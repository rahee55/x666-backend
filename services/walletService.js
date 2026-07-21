const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const TopupRequest = require("../models/TopupRequest");
const { getWithdrawHoldHours } = require("./settingsService");

const recordTransaction = async (
  userId,
  type,
  amount,
  {
    status = "pending",
    gatewayRef = null,
    accountUsed = null,
    destinationAccount = null,
    topupRequestId = null,
    paymentReference = null,
    withdrawableAt = null,
    receiptNumber = null,
    receiptPath = null,
    adminNotes = null,
    session = null,
  } = {},
) => {
  const payload = {
    userId,
    type,
    amount,
    status,
    gatewayRef,
    accountUsed,
    destinationAccount,
    topupRequestId,
    paymentReference,
    withdrawableAt,
    receiptNumber,
    receiptPath,
    adminNotes,
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
  {
    gatewayRef = null,
    accountUsed = null,
    status = "success",
    topupRequestId = null,
    paymentReference = null,
    withdrawableAt = null,
    receiptNumber = null,
    receiptPath = null,
    session: externalSession = null,
  } = {},
) => {
  if (amount <= 0) {
    throw new Error("Credit amount must be greater than zero");
  }

  const ownsSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());

  if (ownsSession) {
    session.startTransaction();
  }

  try {
    const wallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount } },
      { new: true, upsert: true, session },
    );

    const transaction = await recordTransaction(userId, type, amount, {
      status,
      gatewayRef,
      accountUsed,
      topupRequestId,
      paymentReference,
      withdrawableAt,
      receiptNumber,
      receiptPath,
      session,
    });

    if (ownsSession) {
      await session.commitTransaction();
    }

    return { wallet, transaction };
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
  {
    gatewayRef = null,
    accountUsed = null,
    status = "success",
    destinationAccount = null,
    session: externalSession = null,
  } = {},
) => {
  if (amount <= 0) {
    throw new Error("Debit amount must be greater than zero");
  }

  const ownsSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());

  if (ownsSession) {
    session.startTransaction();
  }

  try {
    const wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet || wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    wallet.balance -= amount;
    await wallet.save({ session });

    const transaction = await recordTransaction(userId, type, amount, {
      status,
      gatewayRef,
      accountUsed,
      destinationAccount,
      session,
    });

    if (ownsSession) {
      await session.commitTransaction();
    }

    return { wallet, transaction };
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

const getHeldTopupAmount = async (userId) => {
  const now = new Date();
  const result = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        type: "topup",
        status: "success",
        withdrawableAt: { $gt: now },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return result[0]?.total || 0;
};

const getWithdrawableBalance = async (userId) => {
  const wallet = await Wallet.findOne({ userId });
  const held = await getHeldTopupAmount(userId);
  return Math.max(0, (wallet?.balance || 0) - held);
};

const approveTopupRequest = async (topupRequest, { reviewedBy = null } = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const lockedRequest = await TopupRequest.findOne({
      _id: topupRequest._id,
      status: "under_review",
    }).session(session);

    if (!lockedRequest) {
      throw new Error("Top-up request is not awaiting review");
    }

    const withdrawHoldHours = await getWithdrawHoldHours();
    const withdrawableAt = new Date(
      Date.now() + withdrawHoldHours * 60 * 60 * 1000,
    );

    const wallet = await Wallet.findOneAndUpdate(
      { userId: lockedRequest.userId },
      { $inc: { balance: lockedRequest.expectedAmount } },
      { new: true, upsert: true, session },
    );

    const [transaction] = await Transaction.create(
      [
        {
          userId: lockedRequest.userId,
          type: "topup",
          amount: lockedRequest.expectedAmount,
          status: "success",
          accountUsed: "manual",
          topupRequestId: lockedRequest._id,
          paymentReference: lockedRequest.referenceCode,
          withdrawableAt,
        },
      ],
      { session },
    );

    lockedRequest.status = "approved";
    lockedRequest.transactionId = transaction._id;
    lockedRequest.reviewedBy = reviewedBy;
    lockedRequest.reviewedAt = new Date();
    await lockedRequest.save({ session });

    await session.commitTransaction();
    return { wallet, transaction, topupRequest: lockedRequest };
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
  {
    destinationAccount,
    accountUsed = "other",
    gatewayRef = null,
  } = {},
) => {
  const withdrawable = await getWithdrawableBalance(userId);
  if (withdrawable < amount) {
    const error = new Error(
      "Insufficient withdrawable balance. Recent top-ups may still be on hold.",
    );
    error.status = 402;
    throw error;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet || wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    wallet.balance -= amount;
    wallet.lockedBalance += amount;
    await wallet.save({ session });

    const transaction = await recordTransaction(userId, "withdraw", amount, {
      status: "pending_manual_review",
      gatewayRef,
      accountUsed,
      destinationAccount,
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

const completePendingWithdraw = async (transactionId, { adminNotes = null } = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findOne({
      _id: transactionId,
      type: "withdraw",
      status: "pending_manual_review",
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return null;
    }

    const wallet = await Wallet.findOne({ userId: transaction.userId }).session(
      session,
    );
    if (!wallet) {
      await session.abortTransaction();
      return null;
    }

    if (wallet.lockedBalance >= transaction.amount) {
      wallet.lockedBalance -= transaction.amount;
    }

    await wallet.save({ session });

    transaction.status = "success";
    if (adminNotes) transaction.adminNotes = adminNotes;
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

const rejectPendingWithdraw = async (transactionId, { adminNotes = null } = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findOne({
      _id: transactionId,
      type: "withdraw",
      status: "pending_manual_review",
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return null;
    }

    const wallet = await Wallet.findOne({ userId: transaction.userId }).session(
      session,
    );
    if (!wallet) {
      await session.abortTransaction();
      return null;
    }

    wallet.balance += transaction.amount;
    if (wallet.lockedBalance >= transaction.amount) {
      wallet.lockedBalance -= transaction.amount;
    }
    await wallet.save({ session });

    transaction.status = "rejected";
    transaction.adminNotes = adminNotes;
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

const getBalance = async (userId) => {
  const wallet = await Wallet.findOne({ userId });
  const withdrawableBalance = await getWithdrawableBalance(userId);
  const heldTopupAmount = await getHeldTopupAmount(userId);

  if (!wallet) {
    return {
      balance: 0,
      lockedBalance: 0,
      withdrawableBalance: 0,
      heldTopupAmount: 0,
    };
  }

  return {
    balance: wallet.balance,
    lockedBalance: wallet.lockedBalance,
    withdrawableBalance,
    heldTopupAmount,
  };
};

const getTransactions = (userId, { limit = 50, skip = 0 } = {}) =>
  Transaction.find({ userId }).sort("-createdAt").skip(skip).limit(limit);

const countTransactions = (userId) => Transaction.countDocuments({ userId });

module.exports = {
  creditWallet,
  debitWallet,
  recordTransaction,
  approveTopupRequest,
  queueWithdrawForManualReview,
  completePendingWithdraw,
  rejectPendingWithdraw,
  getBalance,
  getTransactions,
  countTransactions,
  getWithdrawableBalance,
  getHeldTopupAmount,
};
