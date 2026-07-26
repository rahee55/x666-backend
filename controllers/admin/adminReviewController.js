const { makeUnifiedReviewQueue } = require('../../services/reviewQueue.service');
const adminTransactionController = require('./adminTransactionController');
const adminWithdrawalController = require('./adminWithdrawalController');
const { asyncHandler, sendSuccess, sendError } = require('../../services/helper');

const REVIEW_TYPES = new Set(['topup', 'withdraw']);

exports.listPendingReviews = asyncHandler(async (req, res) => {
  const result = await makeUnifiedReviewQueue(req);

  sendSuccess(res, {
    draw: result.draw,
    recordsTotal: result.recordsTotal,
    recordsFiltered: result.recordsFiltered,
    data: result.data,
    pagination: result.pagination,
  });
});

exports.getTopupDetail = asyncHandler(async (req, res) => {
  req.params.id = req.params.id;
  return adminTransactionController.getTransaction(req, res);
});

exports.getTopupScreenshot = asyncHandler(async (req, res) => {
  req.params.id = req.params.id || req.params.topupId;
  return adminTransactionController.getScreenshot(req, res);
});

exports.approveReview = asyncHandler(async (req, res) => {
  const type = String(req.params.type || '').toLowerCase();
  if (!REVIEW_TYPES.has(type)) {
    return sendError(res, 'Invalid review type. Use topup or withdraw.', 400);
  }

  req.params.id = req.params.id;
  if (type === 'topup') {
    return adminTransactionController.approveTransaction(req, res);
  }
  return adminWithdrawalController.approveWithdraw(req, res);
});

exports.rejectReview = asyncHandler(async (req, res) => {
  const type = String(req.params.type || '').toLowerCase();
  if (!REVIEW_TYPES.has(type)) {
    return sendError(res, 'Invalid review type. Use topup or withdraw.', 400);
  }

  if (type === 'topup' && !req.body.reason) {
    req.body.reason = req.body.notes || req.body.reason;
  }
  if (type === 'withdraw' && !req.body.notes) {
    req.body.notes = req.body.reason || req.body.notes;
  }

  req.params.id = req.params.id;
  if (type === 'topup') {
    return adminTransactionController.rejectTransaction(req, res);
  }
  return adminWithdrawalController.rejectWithdraw(req, res);
});
