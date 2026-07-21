const path = require('path');
const TopupRequest = require('../../models/TopupRequest');
const User = require('../../models/Users');
const { getPaginatedData } = require('../../services/table.service');
const { approveTopupRequest } = require('../../services/walletService');
const { generateReceipt } = require('../../services/receiptService');
const { reconcileWithBankStatement } = require('../../services/bankReconciliationService');
const { formatTopupRequest } = require('../../services/topupService');
const { sendEmail } = require('../../config/email');
const {
  adminTransactionRejectSchema,
  adminReviewSchema,
  validate,
} = require('../../services/validationSchema');
const { asyncHandler, sendSuccess, sendError, normalizeObjectId } = require('../../services/helper');

const buildTopupListQuery = (query) => {
  const {
    fromDate,
    toDate,
    userId,
    status,
    search,
    page,
    limit,
    sortBy,
    sortOrder,
  } = query;

  const filters = {};
  if (status) filters.status = status;
  if (userId) filters.userId = userId;

  if (fromDate || toDate) {
    filters.createdAt = {};
    if (fromDate) filters.createdAt.$gte = new Date(fromDate);
    if (toDate) filters.createdAt.$lte = new Date(toDate);
  }

  return {
    page,
    limit,
    search,
    sortBy,
    sortOrder,
    ...filters,
  };
};

const notifyTopupRejected = async (user, topupRequest, reason) => {
  if (!user?.email) return;

  try {
    await sendEmail({
      to: user.email,
      subject: 'Top-up request rejected',
      text: `Your top-up request ${topupRequest.referenceCode} was rejected.\n\nReason: ${reason}`,
      html: `<p>Your top-up request <strong>${topupRequest.referenceCode}</strong> was rejected.</p><p><strong>Reason:</strong> ${reason}</p>`,
    });
  } catch (error) {
    console.warn('Top-up rejection email failed:', error.message);
  }
};

exports.listTransactions = asyncHandler(async (req, res) => {
  const queryParams = buildTopupListQuery(req.query);
  const result = await getPaginatedData(
    TopupRequest,
    queryParams,
    ['referenceCode'],
    { populate: { path: 'userId', select: 'name email phone' } },
  );

  sendSuccess(res, {
    data: {
      transactions: result.rows.map((row) => ({
        ...formatTopupRequest(row),
        user: row.userId || null,
      })),
      pagination: result.pagination,
    },
  });
});

exports.getTransaction = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const topupRequest = await TopupRequest.findById(id)
    .populate('userId', 'name email phone createdAt')
    .populate('reviewedBy', 'name email')
    .lean();

  if (!topupRequest) return sendError(res, 'Top-up request not found', 404);

  sendSuccess(res, {
    data: {
      ...formatTopupRequest(topupRequest),
      user: topupRequest.userId || null,
      reviewedByUser: topupRequest.reviewedBy || null,
    },
  });
});

exports.getScreenshot = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const topupRequest = await TopupRequest.findById(id);
  if (!topupRequest?.receiptImageUrl) {
    return sendError(res, 'Receipt image not found', 404);
  }

  const absolutePath = path.resolve(process.cwd(), topupRequest.receiptImageUrl);
  return res.sendFile(absolutePath);
});

exports.approveTransaction = asyncHandler(async (req, res) => {
  const errors = validate(adminReviewSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const topupRequest = await TopupRequest.findById(id);
  if (!topupRequest) return sendError(res, 'Top-up request not found', 404);
  if (topupRequest.status !== 'under_review') {
    return sendError(res, `Top-up request is ${topupRequest.status}`, 409);
  }

  const user = await User.findById(topupRequest.userId);
  if (!user) return sendError(res, 'User not found', 404);

  const result = await approveTopupRequest(topupRequest, {
    reviewedBy: req.user._id,
  });

  const receipt = await generateReceipt({
    topupRequest: result.topupRequest,
    transaction: result.transaction,
    user,
  });

  result.transaction.receiptNumber = receipt.receiptNumber;
  result.transaction.receiptPath = receipt.receiptPath;
  await result.transaction.save();

  result.topupRequest.receiptNumber = receipt.receiptNumber;
  if (req.body.notes) {
    result.topupRequest.adminNotes = req.body.notes;
  }
  await result.topupRequest.save();

  await reconcileWithBankStatement(result.topupRequest, result.transaction);

  sendSuccess(res, {
    message: 'Top-up approved and wallet credited',
    data: {
      topupRequest: formatTopupRequest(result.topupRequest.toObject()),
      transactionId: result.transaction._id,
      balance: result.wallet.balance,
      receipt: receipt.payload,
    },
  });
});

exports.rejectTransaction = asyncHandler(async (req, res) => {
  const errors = validate(adminTransactionRejectSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const topupRequest = await TopupRequest.findById(id);
  if (!topupRequest) return sendError(res, 'Top-up request not found', 404);
  if (topupRequest.status !== 'under_review') {
    return sendError(res, `Top-up request is ${topupRequest.status}`, 409);
  }

  const reason = req.body.reason.trim();
  topupRequest.status = 'rejected';
  topupRequest.adminNotes = reason;
  topupRequest.reviewedBy = req.user._id;
  topupRequest.reviewedAt = new Date();
  await topupRequest.save();

  const user = await User.findById(topupRequest.userId);
  await notifyTopupRejected(user, topupRequest, reason);

  sendSuccess(res, {
    message: 'Top-up rejected',
    data: formatTopupRequest(topupRequest.toObject()),
  });
});
