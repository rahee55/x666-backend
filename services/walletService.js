const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const TopupRequest = require("../models/TopupRequest");
const { getWithdrawHoldHours, getSettings } = require("./settingsService");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientMongoError = (error) => {
  if (!error) return false;
  if (typeof error.hasErrorLabel === "function") {
    if (error.hasErrorLabel("TransientTransactionError")) return true;
    if (error.hasErrorLabel("UnknownTransactionCommitResult")) return true;
  }
  return [112, 251].includes(error.code);
};

const withTransactionRetry = async (fn, { maxAttempts = 5 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(25 * attempt);
    }
  }
  throw lastError;
};

const recordTransaction = async (
  userId,
  type,
  amount,
  {
    status = "pending",
    gatewayRef = null,
    accountUsed = null,
    destinationAccount = null,
    accountTitle = null,
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
    accountTitle,
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

  const runCredit = async (session, ownsSession) => {
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
  };

  if (!externalSession) {
    return withTransactionRetry(async () => {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        return await runCredit(session, true);
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    });
  }

  const session = externalSession;
  try {
    return await runCredit(session, false);
  } catch (error) {
    throw error;
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

  const runDebit = async (session, ownsSession) => {
    const wallet = await Wallet.findOneAndUpdate(
      { userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, session },
    );

    if (!wallet) {
      throw new Error("Insufficient balance");
    }

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
  };

  if (!externalSession) {
    return withTransactionRetry(async () => {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        return await runDebit(session, true);
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    });
  }

  const session = externalSession;
  try {
    return await runDebit(session, false);
  } catch (error) {
    throw error;
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

const getStartOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const getDailyWithdrawTotal = async (userId) => {
  const startOfDay = getStartOfToday();
  const result = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        type: "withdraw",
        status: { $in: ["pending_manual_review", "success", "pending"] },
        createdAt: { $gte: startOfDay },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return result[0]?.total || 0;
};

const assertWithdrawLimits = async (userId, amount) => {
  const withdrawAmount = Number(amount);
  const settings = await getSettings();

  if (withdrawAmount > settings.maxWithdrawPerTransaction) {
    const error = new Error(
      `Maximum withdrawal per request is ${settings.maxWithdrawPerTransaction} PKR`,
    );
    error.status = 400;
    throw error;
  }

  const dailyTotal = await getDailyWithdrawTotal(userId);
  if (dailyTotal + withdrawAmount > settings.maxWithdrawPerDay) {
    const remaining = Math.max(0, settings.maxWithdrawPerDay - dailyTotal);
    const error = new Error(
      remaining === 0
        ? `Daily withdrawal limit of ${settings.maxWithdrawPerDay} PKR reached. Try again tomorrow.`
        : `Daily withdrawal limit exceeded. You can withdraw up to ${remaining} PKR more today.`,
    );
    error.status = 400;
    throw error;
  }
};

const approveTopupRequest = async (
  topupRequest,
  { reviewedBy = null } = {},
) => {
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
    accountTitle = null,
    accountUsed = "other",
    gatewayRef = null,
  } = {},
) => {
  const withdrawAmount = Number(amount);

  // Amount validation
  if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
    const error = new Error("Withdrawal amount must be greater than zero.");
    error.status = 400;
    throw error;
  }

  // Destination account validation
  if (!destinationAccount) {
    const error = new Error("Destination account is required.");
    error.status = 400;
    throw error;
  }

  await assertWithdrawLimits(userId, withdrawAmount);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await Wallet.findOne({ userId }).session(session);

    if (!wallet) {
      const error = new Error("Wallet not found.");
      error.status = 404;
      throw error;
    }

    if (Number(wallet.balance || 0) < withdrawAmount) {
      const error = new Error("Insufficient wallet balance.");
      error.status = 402;
      throw error;
    }

    wallet.balance = Number(wallet.balance || 0) - withdrawAmount;

    wallet.lockedBalance = Number(wallet.lockedBalance || 0) + withdrawAmount;

    await wallet.save({ session });

    const transaction = await recordTransaction(
      userId,
      "withdraw",
      withdrawAmount,
      {
        status: "pending_manual_review",
        gatewayRef,
        accountUsed,
        destinationAccount,
        accountTitle,
        session,
      },
    );

    await session.commitTransaction();

    return {
      wallet,
      transaction,
      message: "Withdrawal request sent to admin for manual review.",
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const completePendingWithdraw = async (
  transactionId,
  { adminNotes = null, payoutProofPath = null } = {},
) => {
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
    if (payoutProofPath) transaction.receiptPath = payoutProofPath;
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

const rejectPendingWithdraw = async (
  transactionId,
  { adminNotes = null } = {},
) => {
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
  getDailyWithdrawTotal,
  assertWithdrawLimits,
};
