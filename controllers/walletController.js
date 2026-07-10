const paymentConfig = require('../config/paymentGateway');
const { MIN_TOPUP, MIN_WITHDRAW } = require('../config/constants');
const Transaction = require('../models/Transaction');
const {
  getBalance,
  getTransactions,
  countTransactions,
  recordTransaction,
  completePendingTopup,
  queueWithdrawForManualReview,
  processInstantWithdraw,
  queueRaastWithdraw,
  completePendingWithdraw,
  findTopupByOrderId,
  findTopupByIdForUser,
  reconcilePendingTopupsForUser,
} = require('../services/walletService');
const {
  initiateCollection,
  initiatePayout,
  verifyRedirectSignature,
  parseCallbackPayload,
  fetchPaymentStatus,
  fetchRaastPayoutStatus,
  getPaymentConfig,
  getWithdrawMethods,
} = require('../services/paymentService');
const {
  topupSchema,
  validateWithdrawDetails,
  validate,
} = require('../services/validationSchema');
const { getWithdrawEligibility, assertWithdrawAllowed } = require('../services/spinService');
const { asyncHandler, sendSuccess, sendError } = require('../services/helper');

const resolveWithdrawDestination = ({ gateway, accountNumber, iban }) => {
  if (gateway === 'bank') {
    return String(iban || '').trim().toUpperCase();
  }

  return String(accountNumber || '').trim();
};

const resolveAccountUsed = (gateway, payoutMode) => {
  if (gateway === 'jazzcash' || gateway === 'easypaisa' || gateway === 'bank') {
    return gateway;
  }

  return payoutMode === 'raast' ? 'safepay' : 'other';
};

const frontendUrl = (path, params = {}) => {
  const base = (process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const query = new URLSearchParams(params).toString();
  return query ? `${base}${path}?${query}` : `${base}${path}`;
};

const wantsHtmlRedirect = (req) =>
  req.method === 'GET' || (req.headers.accept || '').includes('text/html');

const topupDisplayStatus = (dbStatus) => (dbStatus === 'success' ? 'paid' : dbStatus);

const formatTransactionForResponse = (transaction) => {
  const data = transaction.toObject ? transaction.toObject() : { ...transaction };

  if (data.type === 'topup' && data.status === 'success') {
    data.status = 'paid';
  }

  return data;
};

const redirectOrJson = (req, res, { status, payload, redirectPath, redirectParams }) => {
  if (wantsHtmlRedirect(req)) {
    return res.redirect(frontendUrl(redirectPath, redirectParams));
  }
  return sendSuccess(res, payload, status);
};

const redirectOrError = (req, res, { status, message, redirectPath, redirectParams }) => {
  if (wantsHtmlRedirect(req)) {
    return res.redirect(frontendUrl(redirectPath, { ...redirectParams, message }));
  }
  return sendError(res, message, status);
};

const processTopupCallback = async ({ orderId, tracker, signature, referenceCode }) => {
  if (!orderId || !tracker || !signature) {
    const error = new Error('order_id, tracker, and signature are required');
    error.status = 400;
    throw error;
  }

  if (!verifyRedirectSignature(tracker, signature)) {
    const error = new Error('Invalid Safepay signature');
    error.status = 403;
    throw error;
  }

  return finalizeTopup(orderId, tracker, referenceCode);
};

const finalizeTopup = async (orderId, tracker, referenceCode) => {
  const existing = await findTopupByOrderId(orderId);

  if (!existing) {
    const error = new Error('Top-up order not found');
    error.status = 404;
    throw error;
  }

  if (existing.status === 'success') {
    return {
      alreadyProcessed: true,
      orderId,
      transactionId: existing._id,
      balance: (await getBalance(existing.userId))?.balance ?? 0,
    };
  }

  if (existing.status !== 'pending') {
    const error = new Error('Top-up order is not pending');
    error.status = 409;
    throw error;
  }

  if (existing.safepayTracker && tracker && existing.safepayTracker !== tracker) {
    const error = new Error('Tracker mismatch for order');
    error.status = 409;
    throw error;
  }

  const paymentStatus = await fetchPaymentStatus(existing.safepayTracker || tracker);

  if (!paymentStatus.isPaid) {
    if (paymentStatus.state && paymentStatus.state !== 'TRACKER_ENDED') {
      await Transaction.findByIdAndUpdate(existing._id, {
        status: 'failed',
        safepayTracker: tracker || existing.safepayTracker,
        safepayReference: referenceCode || paymentStatus.referenceCode,
      });
    }

    const error = new Error(
      paymentStatus.state
        ? `Payment not completed. Safepay state: ${paymentStatus.state}`
        : 'Payment not completed yet'
    );
    error.status = 402;
    throw error;
  }

  const result = await completePendingTopup(existing._id, {
    safepayTracker: tracker || existing.safepayTracker,
    safepayReference: referenceCode || paymentStatus.referenceCode,
    gatewayRef: orderId,
  });

  if (!result) {
    const error = new Error('Unable to complete top-up');
    error.status = 409;
    throw error;
  }

  return {
    alreadyProcessed: false,
    orderId,
    referenceCode: referenceCode || paymentStatus.referenceCode,
    tracker: tracker || existing.safepayTracker,
    balance: result.wallet.balance,
    transactionId: result.transaction._id,
  };
};

const buildTopupStatusResponse = async (transaction, userId) => {
  await reconcilePendingTopupsForUser(userId);

  const current = await Transaction.findById(transaction._id);
  const wallet = await getBalance(userId);

  let safepayState = null;
  if (current?.status === 'pending' && current.safepayTracker) {
    try {
      ({ state: safepayState } = await fetchPaymentStatus(current.safepayTracker));
    } catch (error) {
      console.warn('Safepay status read failed:', error.message);
    }
  }

  return {
    orderId: current.gatewayRef,
    transactionId: current._id,
    amount: current.amount,
    status: topupDisplayStatus(current.status),
    safepayTracker: current.safepayTracker,
    safepayState,
    safepayPaid: current.status === 'success' || safepayState === 'TRACKER_ENDED',
    balance: wallet?.balance ?? 0,
  };
};

exports.getPaymentConfig = asyncHandler(async (req, res) => {
  const eligibility = await getWithdrawEligibility(req.user._id);

  sendSuccess(res, {
    data: {
      ...getPaymentConfig(),
      minTopup: MIN_TOPUP,
      minWithdraw: MIN_WITHDRAW,
      withdrawMethods: getWithdrawMethods().map((method) => ({
        ...method,
        enabled: eligibility.canWithdraw,
      })),
      canWithdraw: eligibility.canWithdraw,
      firstSpinRequired: eligibility.firstSpinRequired,
    },
  });
});

exports.getWithdrawMethods = asyncHandler(async (req, res) => {
  const eligibility = await getWithdrawEligibility(req.user._id);

  sendSuccess(res, {
    data: {
      provider: 'safepay',
      methods: getWithdrawMethods().map((method) => ({
        ...method,
        enabled: eligibility.canWithdraw,
      })),
      minWithdraw: MIN_WITHDRAW,
      withdrawMode: paymentConfig.safepay.withdrawMode,
      ...eligibility,
    },
  });
});

exports.getBalance = asyncHandler(async (req, res) => {
  await reconcilePendingTopupsForUser(req.user._id);
  const wallet = await getBalance(req.user._id);
  sendSuccess(res, {
    data: {
      balance: wallet?.balance ?? 0,
      lockedBalance: wallet?.lockedBalance ?? 0,
    },
  });
});

exports.getTransactions = asyncHandler(async (req, res) => {
  await reconcilePendingTopupsForUser(req.user._id);

  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const skip = Number(req.query.skip) || 0;

  const [transactions, total] = await Promise.all([
    getTransactions(req.user._id, { limit, skip }),
    countTransactions(req.user._id),
  ]);

  sendSuccess(res, {
    data: {
      transactions: transactions.map(formatTransactionForResponse),
      total,
      limit,
      skip,
    },
  });
});

exports.topup = asyncHandler(async (req, res) => {
  const errors = validate(topupSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { amount } = req.body;
  if (amount < MIN_TOPUP) {
    return sendError(res, `Minimum top-up is ${MIN_TOPUP}`);
  }

  const collection = await initiateCollection(amount, req.user._id);

  const transaction = await recordTransaction(req.user._id, 'topup', amount, {
    status: 'pending',
    gatewayRef: collection.orderId,
    accountUsed: 'safepay',
    safepayTracker: collection.tracker,
  });

  sendSuccess(res, {
    message: 'Safepay checkout session created',
    data: {
      orderId: collection.orderId,
      tracker: collection.tracker,
      checkoutUrl: collection.checkoutUrl,
      transactionId: transaction._id,
      amount,
      currency: collection.currency,
      environment: collection.environment,
    },
  });
});

exports.getTopupStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const transaction = await findTopupByOrderId(orderId);

  if (!transaction || String(transaction.userId) !== String(req.user._id)) {
    return sendError(res, 'Top-up order not found', 404);
  }

  const data = await buildTopupStatusResponse(transaction, req.user._id);

  sendSuccess(res, { data });
});

exports.getTopupStatusById = asyncHandler(async (req, res) => {
  const transaction = await findTopupByIdForUser(req.params.id, req.user._id);
  if (!transaction) return sendError(res, 'Top-up not found', 404);

  const data = await buildTopupStatusResponse(transaction, req.user._id);

  sendSuccess(res, { data });
});

exports.topupCallback = asyncHandler(async (req, res) => {
  const { orderId, tracker, signature, referenceCode } = parseCallbackPayload(req);
  const successPath = paymentConfig.safepay.frontendSuccessPath;
  const cancelPath = paymentConfig.safepay.frontendCancelPath;

  try {
    const result = await processTopupCallback({ orderId, tracker, signature, referenceCode });

    return redirectOrJson(req, res, {
      status: 200,
      payload: {
        message: result.alreadyProcessed ? 'Top-up already processed' : 'Top-up successful',
        data: result,
      },
      redirectPath: successPath,
      redirectParams: {
        status: 'success',
        orderId: result.orderId,
        balance: result.balance,
      },
    });
  } catch (error) {
    return redirectOrError(req, res, {
      status: error.status || 400,
      message: error.message,
      redirectPath: cancelPath,
      redirectParams: { status: 'failed', orderId: orderId || '' },
    });
  }
});

exports.topupCancel = asyncHandler(async (req, res) => {
  const orderId = req.query.order_id || req.query.orderId || req.body?.order_id || req.body?.orderId;

  if (orderId) {
    await Transaction.findOneAndUpdate(
      { gatewayRef: orderId, type: 'topup', status: 'pending' },
      { status: 'failed' }
    );
  }

  return redirectOrJson(req, res, {
    status: 200,
    payload: {
      message: 'Top-up cancelled',
      data: { orderId: orderId || null, status: 'cancelled' },
    },
    redirectPath: paymentConfig.safepay.frontendCancelPath,
    redirectParams: { status: 'cancelled', orderId: orderId || '' },
  });
});

exports.withdraw = asyncHandler(async (req, res) => {
  try {
    await assertWithdrawAllowed(req.user._id);
  } catch (error) {
    if (error.code === 'FIRST_SPIN_REQUIRED') {
      return sendError(res, error.message, error.status);
    }
    throw error;
  }

  const errors = validateWithdrawDetails(req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { amount, gateway, accountNumber, iban, accountTitle } = req.body;
  const destinationAccount = resolveWithdrawDestination({ gateway, accountNumber, iban });

  if (amount < MIN_WITHDRAW) {
    return sendError(res, `Minimum withdrawal is ${MIN_WITHDRAW}`);
  }

  const walletBefore = await getBalance(req.user._id);
  if (!walletBefore || walletBefore.balance < amount) {
    return sendError(res, 'Insufficient balance', 402);
  }

  let payout;
  try {
    payout = await initiatePayout(amount, req.user._id, destinationAccount, { iban, gateway });
  } catch (error) {
    return sendError(res, error.message || 'Unable to initiate payout');
  }

  const accountUsed = resolveAccountUsed(gateway, payout.mode);
  const withdrawResponseData = {
    amount,
    gateway,
    destinationAccount,
    accountNumber: accountNumber || null,
    iban: gateway === 'bank' ? destinationAccount : null,
    accountTitle: accountTitle || null,
  };

  if (payout.mode === 'sandbox_auto') {
    const { wallet, transaction } = await processInstantWithdraw(req.user._id, amount, {
      destinationAccount,
      accountUsed,
      gatewayRef: payout.gatewayRef,
      safepayReference: `SANDBOX-AUTO-${gateway.toUpperCase()}`,
    });

    return sendSuccess(res, {
      message: `Safepay sandbox withdrawal processed via ${gateway}`,
      data: {
        ...withdrawResponseData,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        transactionId: transaction._id,
        status: transaction.status,
        withdrawMode: payout.mode,
      },
    });
  }

  if (payout.mode === 'raast') {
    const { wallet, transaction } = await queueRaastWithdraw(req.user._id, amount, {
      destinationAccount,
      gatewayRef: payout.gatewayRef,
      safepayReference: payout.token,
      accountUsed: 'bank',
    });

    let payoutStatus = payout.status;
    if (paymentConfig.safepay.environment === 'sandbox') {
      try {
        const statusPayload = await fetchRaastPayoutStatus(payout.requestId);
        payoutStatus = statusPayload?.status || statusPayload?.[0]?.status || payoutStatus;
        if (payoutStatus === 'P_SETTLED') {
          const completed = await completePendingWithdraw(transaction._id, {
            safepayReference: payout.token,
            gatewayRef: payout.requestId,
          });
          if (completed) {
            return sendSuccess(res, {
              message: 'Raast sandbox payout settled',
              data: {
                ...withdrawResponseData,
                balance: completed.wallet.balance,
                lockedBalance: completed.wallet.lockedBalance,
                transactionId: completed.transaction._id,
                status: completed.transaction.status,
                withdrawMode: payout.mode,
                payoutStatus,
              },
            });
          }
        }
      } catch (error) {
        console.warn('Raast payout status check failed:', error.message);
      }
    }

    return sendSuccess(res, {
      message: 'Raast payout initiated — processing',
      data: {
        ...withdrawResponseData,
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
        transactionId: transaction._id,
        status: transaction.status,
        withdrawMode: payout.mode,
        payoutStatus,
        payoutToken: payout.token,
      },
    });
  }

  const { wallet, transaction } = await queueWithdrawForManualReview(req.user._id, amount, {
    destinationAccount,
    accountUsed,
    gatewayRef: payout.gatewayRef,
  });

  sendSuccess(res, {
    message: 'Withdrawal queued for manual admin review',
    data: {
      ...withdrawResponseData,
      balance: wallet.balance,
      lockedBalance: wallet.lockedBalance,
      transactionId: transaction._id,
      status: transaction.status,
      withdrawMode: 'manual',
    },
  });
});

exports.getWithdrawStatus = asyncHandler(async (req, res) => {
  const transaction = await Transaction.findOne({
    _id: req.params.id,
    userId: req.user._id,
    type: 'withdraw',
  });

  if (!transaction) return sendError(res, 'Withdrawal not found', 404);

  let payoutStatus = null;
  if (transaction.gatewayRef && transaction.status === 'pending') {
    try {
      const statusPayload = await fetchRaastPayoutStatus(transaction.gatewayRef);
      payoutStatus = statusPayload?.status || statusPayload?.[0]?.status || null;

      if (payoutStatus === 'P_SETTLED') {
        const completed = await completePendingWithdraw(transaction._id, {
          safepayReference: transaction.safepayReference,
          gatewayRef: transaction.gatewayRef,
        });
        if (completed) {
          transaction.status = completed.transaction.status;
        }
      }
    } catch (error) {
      console.warn('Withdraw status poll failed:', error.message);
    }
  }

  const wallet = await getBalance(req.user._id);

  sendSuccess(res, {
    data: {
      transactionId: transaction._id,
      amount: transaction.amount,
      status: transaction.status,
      gatewayRef: transaction.gatewayRef,
      destinationAccount: transaction.destinationAccount,
      payoutStatus,
      balance: wallet?.balance ?? 0,
      lockedBalance: wallet?.lockedBalance ?? 0,
    },
  });
});
