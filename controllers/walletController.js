const { getSettings } = require("../services/settingsService");
const Transaction = require("../models/Transaction");
const {
  getBalance,
  getTransactions,
  queueWithdrawForManualReview,
} = require("../services/walletService");
const {
  walletOtpSchema,
  validateWithdrawDetails,
  validate,
} = require("../services/validationSchema");
const { getWithdrawEligibility, assertWithdrawAllowed } = require("../services/spinService");
const {
  sendOTP,
  verifyOTP,
  getUserOtpTarget,
  OtpRateLimitError,
} = require("../services/otpService");
const { readReceipt } = require("../services/receiptService");
const { listTopupRequestsForUser, formatTopupRequest } = require("../services/topupService");
const { asyncHandler, sendSuccess, sendError } = require("../services/helper");

const handleOtpError = (res, error) => {
  if (error instanceof OtpRateLimitError || error.code === "OTP_RATE_LIMIT") {
    return sendError(res, error.message, error.status || 429);
  }
  return sendError(res, error.message);
};

const resolveWithdrawDestination = ({ gateway, accountNumber, iban }) => {
  if (gateway === "bank") {
    return String(iban || "")
      .trim()
      .toUpperCase();
  }
  return String(accountNumber || "").trim();
};

exports.getPaymentConfig = asyncHandler(async (_req, res) => {
  const settings = await getSettings();

  sendSuccess(res, {
    data: {
      provider: "manual_bank_transfer",
      currency: settings.currency,
      minTopup: settings.minTopup,
      minWithdraw: settings.minWithdraw,
      maxTopupPerTransaction: settings.maxTopupPerTransaction,
      maxTopupPerDay: settings.maxTopupPerDay,
      maxTopupPerDayNewUser: settings.maxTopupPerDayNewUser,
      maxPendingTopupsPerUser: settings.maxPendingTopupsPerUser,
      topupRequestTtlHours: settings.topupRequestTtlHours,
      withdrawHoldHours: settings.withdrawHoldHours,
    },
  });
});

exports.getBalance = asyncHandler(async (req, res) => {
  const wallet = await getBalance(req.user._id);
  sendSuccess(res, { data: wallet });
});

exports.getTransactions = asyncHandler(async (req, res) => {
  const [transactions, topupRequests] = await Promise.all([
    getTransactions(req.user._id, {
      limit: Number(req.query.limit) || 50,
      skip: Number(req.query.skip) || 0,
    }),
    listTopupRequestsForUser(req.user._id, {
      limit: Number(req.query.limit) || 50,
      skip: Number(req.query.skip) || 0,
    }),
  ]);

  sendSuccess(res, {
    data: {
      transactions,
      topupRequests: topupRequests.map(formatTopupRequest),
    },
  });
});

exports.sendOtp = asyncHandler(async (req, res) => {
  const errors = validate(walletOtpSchema, req.body);
  if (errors.length) return sendError(res, errors.join(", "));

  let target;
  try {
    target = getUserOtpTarget(req.user);
  } catch (error) {
    return sendError(res, error.message);
  }

  try {
    const result = await sendOTP(target.identifier, req.body.purpose);
    sendSuccess(res, {
      message: `OTP sent to your ${result.channel === "email" ? "email" : "phone number"}.`,
      data: {
        purpose: req.body.purpose,
        channel: result.channel,
        identifier: result.identifier,
        expiresAt: result.expiresAt,
      },
    });
  } catch (error) {
    return handleOtpError(res, error);
  }
});

exports.withdraw = asyncHandler(async (req, res) => {
  try {
    await assertWithdrawAllowed(req.user._id);
  } catch (error) {
    if (error.code === "FIRST_SPIN_REQUIRED") {
      return sendError(res, error.message, error.status);
    }
    throw error;
  }

  const errors = validateWithdrawDetails(req.body);
  if (errors.length) return sendError(res, errors.join(", "));

  const { amount, gateway, accountNumber, iban, accountTitle, code } = req.body;
  const destinationAccount = resolveWithdrawDestination({
    gateway,
    accountNumber,
    iban,
  });

  let target;
  try {
    target = getUserOtpTarget(req.user);
    await verifyOTP(target.identifier, code, "withdraw");
  } catch (error) {
    const status = error.message.includes("attempts exceeded") ? 429 : 400;
    return sendError(res, error.message, status);
  }

  const settings = await getSettings();
  if (amount < settings.minWithdraw) {
    return sendError(res, `Minimum withdrawal is ${settings.minWithdraw}`);
  }

  try {
    const { wallet, transaction } = await queueWithdrawForManualReview(
      req.user._id,
      amount,
      {
        destinationAccount,
        accountUsed: gateway,
        gatewayRef: `WD-${Date.now()}`,
      },
    );

    sendSuccess(res, {
      message: "Withdrawal queued for manual admin review",
      data: {
        amount,
        gateway,
        destinationAccount,
        accountNumber: accountNumber || null,
        iban: gateway === "bank" ? destinationAccount : null,
        accountTitle: accountTitle || null,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        withdrawableBalance: (await getBalance(req.user._id)).withdrawableBalance,
        transactionId: transaction._id,
        status: transaction.status,
      },
    });
  } catch (error) {
    return sendError(res, error.message, error.status || 400);
  }
});

exports.getWithdrawStatus = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findOne({
    _id: req.params.id,
    userId: req.user._id,
    type: "withdraw",
  });

  if (!transaction) return sendError(res, "Withdrawal not found", 404);

  const wallet = await getBalance(req.user._id);

  sendSuccess(res, {
    data: {
      transactionId: transaction._id,
      amount: transaction.amount,
      status: transaction.status,
      destinationAccount: transaction.destinationAccount,
      adminNotes: transaction.adminNotes,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      withdrawableBalance: wallet.withdrawableBalance,
    },
  });
});

exports.getWithdrawReceipt = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findOne({
    _id: req.params.id,
    userId: req.user._id,
    type: "withdraw",
    status: "success",
  });

  if (!transaction?.receiptPath) {
    return sendError(res, "Withdrawal receipt not found", 404);
  }

  const receipt = await readReceipt(transaction.receiptPath);
  sendSuccess(res, { data: receipt });
});

exports.getTopupReceipt = asyncHandler(async (req, res) => {
  const TopupRequest = require("../models/TopupRequest");
  const request = await TopupRequest.findOne({
    _id: req.params.id,
    userId: req.user._id,
    status: "approved",
  });

  if (!request?.transactionId) {
    return sendError(res, "Top-up receipt not found", 404);
  }

  const transaction = await Transaction.findById(request.transactionId);
  if (!transaction?.receiptPath) {
    return sendError(res, "Receipt file not found", 404);
  }

  const receipt = await readReceipt(transaction.receiptPath);
  sendSuccess(res, { data: receipt });
});
