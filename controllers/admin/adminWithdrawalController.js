const Transaction = require('../../models/Transaction');
const {
  completePendingWithdraw,
  rejectPendingWithdraw,
} = require('../../services/walletService');
const { getPaginatedData } = require('../../services/table.service');
const { adminReviewSchema, validate } = require('../../services/validationSchema');
const { asyncHandler, sendSuccess, sendError, normalizeObjectId } = require('../../services/helper');

exports.listPendingWithdrawals = asyncHandler(async (req, res) => {
  const queryParams = {
    ...req.query,
    type: 'withdraw',
    status: 'pending_manual_review',
  };

  const result = await getPaginatedData(Transaction, queryParams, ['gatewayRef', 'destinationAccount'], {
    populate: { path: 'userId', select: 'name email phone' },
    filters: {},
  });

  sendSuccess(res, {
    data: {
      withdrawals: result.rows,
      pagination: result.pagination,
    },
  });
});

exports.approveWithdraw = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const result = await completePendingWithdraw(id, {
    adminNotes: req.body.notes || null,
  });

  if (!result) return sendError(res, 'Withdrawal not found or not pending', 404);

  sendSuccess(res, {
    message: 'Withdrawal approved',
    data: {
      transactionId: result.transaction._id,
      status: result.transaction.status,
      balance: result.wallet.balance,
      lockedBalance: result.wallet.lockedBalance,
    },
  });
});

exports.rejectWithdraw = asyncHandler(async (req, res) => {
  const errors = validate(adminReviewSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const reason = req.body.notes || req.body.reason || 'Withdrawal rejected by admin';
  const result = await rejectPendingWithdraw(id, {
    adminNotes: reason,
  });

  if (!result) return sendError(res, 'Withdrawal not found or not pending', 404);

  sendSuccess(res, {
    message: 'Withdrawal rejected and funds returned',
    data: {
      transactionId: result.transaction._id,
      status: result.transaction.status,
      balance: result.wallet.balance,
      lockedBalance: result.wallet.lockedBalance,
    },
  });
});
