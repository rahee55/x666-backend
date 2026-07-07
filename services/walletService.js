const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { fetchPaymentStatus } = require('./paymentService');

const recordTransaction = async (
  userId,
  type,
  amount,
  {
    status = 'pending',
    gatewayRef = null,
    accountUsed = null,
    safepayTracker = null,
    safepayReference = null,
    destinationAccount = null,
    session = null,
  } = {}
) => {
  const payload = {
    userId,
    type,
    amount,
    status,
    gatewayRef,
    accountUsed,
    safepayTracker,
    safepayReference,
    destinationAccount,
  };

  if (session) {
    const [transaction] = await Transaction.create([payload], { session });
    return transaction;
  }

  return Transaction.create(payload);
};

const creditWallet = async (
  userId,
  amount,
  type,
  { gatewayRef = null, accountUsed = null, status = 'success', session: externalSession = null } = {}
) => {
  if (amount <= 0) {
    throw new Error('Credit amount must be greater than zero');
  }

  const ownsSession = !externalSession;
  const session = externalSession || await mongoose.startSession();

  if (ownsSession) {
    session.startTransaction();
  }

  try {
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true, upsert: true, session }
    );

    await recordTransaction(userId, type, amount, {
      status,
      gatewayRef,
      accountUsed,
      session,
    });

    if (ownsSession) {
      await session.commitTransaction();
    }

    return wallet;
  } catch (error) {
    if (ownsSession) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (ownsSession) {
      session.endSession();
    }
  }
};

const debitWallet = async (
  userId,
  amount,
  type,
  { gatewayRef = null, accountUsed = null, status = 'success', session: externalSession = null } = {}
) => {
  if (amount <= 0) {
    throw new Error('Debit amount must be greater than zero');
  }

  const ownsSession = !externalSession;
  const session = externalSession || await mongoose.startSession();

  if (ownsSession) {
    session.startTransaction();
  }

  try {
    const wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet || wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }

    wallet.balance -= amount;
    await wallet.save({ session });

    await recordTransaction(userId, type, amount, {
      status,
      gatewayRef,
      accountUsed,
      session,
    });

    if (ownsSession) {
      await session.commitTransaction();
    }

    return wallet;
  } catch (error) {
    if (ownsSession) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (ownsSession) {
      session.endSession();
    }
  }
};

const completePendingTopup = async (
  transactionId,
  { safepayTracker, safepayReference, gatewayRef } = {}
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findOne({
      _id: transactionId,
      type: 'topup',
      status: 'pending',
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return null;
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId: transaction.userId },
      { $inc: { balance: transaction.amount } },
      { new: true, upsert: true, session }
    );

    transaction.status = 'success';
    transaction.safepayTracker = safepayTracker || transaction.safepayTracker;
    transaction.safepayReference = safepayReference || transaction.safepayReference;
    transaction.gatewayRef = gatewayRef || transaction.gatewayRef;
    transaction.accountUsed = 'safepay';
    await transaction.save({ session });

    await session.commitTransaction();
    return { wallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const queueWithdrawForManualReview = async (
  userId,
  amount,
  { destinationAccount, accountUsed = 'other', gatewayRef = null, safepayReference = null } = {}
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet || wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }

    wallet.balance -= amount;
    wallet.lockedBalance += amount;
    await wallet.save({ session });

    const transaction = await recordTransaction(userId, 'withdraw', amount, {
      status: 'pending_manual_review',
      gatewayRef,
      accountUsed,
      destinationAccount,
      safepayReference,
      session,
    });

    await session.commitTransaction();
    return { wallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getBalance = (userId) => Wallet.findOne({ userId });

const getTransactions = (userId, { limit = 50, skip = 0 } = {}) =>
  Transaction.find({ userId }).sort('-createdAt').skip(skip).limit(limit);

const countTransactions = (userId) => Transaction.countDocuments({ userId });

const findPendingTopupByOrderId = (orderId) =>
  Transaction.findOne({ gatewayRef: orderId, type: 'topup', status: 'pending' });

const processInstantWithdraw = async (
  userId,
  amount,
  { destinationAccount, accountUsed = 'safepay', gatewayRef = null, safepayReference = null } = {}
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet || wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }

    wallet.balance -= amount;
    await wallet.save({ session });

    const transaction = await recordTransaction(userId, 'withdraw', amount, {
      status: 'success',
      gatewayRef,
      accountUsed,
      destinationAccount,
      safepayReference,
      session,
    });

    await session.commitTransaction();
    return { wallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const queueRaastWithdraw = async (
  userId,
  amount,
  { destinationAccount, gatewayRef, safepayReference, accountUsed = 'safepay' } = {}
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet || wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }

    wallet.balance -= amount;
    wallet.lockedBalance += amount;
    await wallet.save({ session });

    const transaction = await recordTransaction(userId, 'withdraw', amount, {
      status: 'pending',
      gatewayRef,
      accountUsed,
      destinationAccount,
      safepayReference: safepayReference || gatewayRef,
      session,
    });

    await session.commitTransaction();
    return { wallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const completePendingWithdraw = async (transactionId, { safepayReference, gatewayRef } = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findOne({
      _id: transactionId,
      type: 'withdraw',
      status: { $in: ['pending', 'pending_manual_review'] },
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return null;
    }

    const wallet = await Wallet.findOne({ userId: transaction.userId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return null;
    }

    if (wallet.lockedBalance >= transaction.amount) {
      wallet.lockedBalance -= transaction.amount;
    }

    await wallet.save({ session });

    transaction.status = 'success';
    transaction.safepayReference = safepayReference || transaction.safepayReference;
    transaction.gatewayRef = gatewayRef || transaction.gatewayRef;
    transaction.accountUsed = 'safepay';
    await transaction.save({ session });

    await session.commitTransaction();
    return { wallet, transaction };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const findWithdrawByGatewayRef = (gatewayRef) =>
  Transaction.findOne({ gatewayRef, type: 'withdraw' });

const findTopupByOrderId = (orderId) =>
  Transaction.findOne({ gatewayRef: orderId, type: 'topup' });

const findTopupByIdForUser = (transactionId, userId) =>
  Transaction.findOne({ _id: transactionId, userId, type: 'topup' });

const reconcilePendingTopup = async (transaction) => {
  if (!transaction || transaction.status !== 'pending' || !transaction.safepayTracker) {
    return transaction;
  }

  const paymentStatus = await fetchPaymentStatus(transaction.safepayTracker);
  if (!paymentStatus.isPaid) {
    return transaction;
  }

  const result = await completePendingTopup(transaction._id, {
    safepayTracker: transaction.safepayTracker,
    safepayReference: paymentStatus.referenceCode,
    gatewayRef: transaction.gatewayRef,
  });

  return result?.transaction || transaction;
};

const reconcilePendingTopupsForUser = async (userId) => {
  const pending = await Transaction.find({
    userId,
    type: 'topup',
    status: 'pending',
    safepayTracker: { $ne: null },
  })
    .sort('-createdAt')
    .limit(5);

  await Promise.all(pending.map((tx) => reconcilePendingTopup(tx)));
};

module.exports = {
  creditWallet,
  debitWallet,
  recordTransaction,
  completePendingTopup,
  queueWithdrawForManualReview,
  processInstantWithdraw,
  queueRaastWithdraw,
  completePendingWithdraw,
  findWithdrawByGatewayRef,
  findTopupByIdForUser,
  getBalance,
  getTransactions,
  countTransactions,
  findPendingTopupByOrderId,
  findTopupByOrderId,
  reconcilePendingTopupsForUser,
};
