const manualPayment = require("../config/manualPayment");
const {
  createTopupRequest,
  submitTopupReceipt,
  listTopupRequestsForUser,
  getTopupRequestForUser,
  formatTopupRequest,
} = require("../services/topupService");
const { readReceipt } = require("../services/receiptService");
const { topupInitiateSchema, validate } = require("../services/validationSchema");
const { asyncHandler, sendSuccess, sendError, normalizeObjectId } = require("../services/helper");

exports.initiate = asyncHandler(async (req, res) => {
  const errors = validate(topupInitiateSchema, req.body);
  if (errors.length) return sendError(res, errors.join(", "));

  try {
    const { topupRequest, bankAccounts, instructions } = await createTopupRequest(
      req.user._id,
      req.body.amount,
      req,
    );

    sendSuccess(res, {
      message: "Top-up reference generated",
      data: {
        topupRequestId: String(topupRequest._id),
        id: String(topupRequest._id),
        referenceCode: topupRequest.referenceCode,
        requestedAmount: topupRequest.requestedAmount,
        expectedAmount: topupRequest.expectedAmount,
        status: topupRequest.status,
        expiresAt: topupRequest.expiresAt,
        currency: manualPayment.currency,
        instructions,
        bankAccounts,
      },
    });
  } catch (error) {
    return sendError(res, error.message, error.status || 400);
  }
});

exports.submitReceipt = asyncHandler(async (req, res) => {
  if (!req.file) {
    return sendError(res, "Receipt image is required (jpg or png, max 5MB)");
  }

  const topupRequestId = normalizeObjectId(req.params.id);
  if (!topupRequestId) {
    return sendError(
      res,
      "Invalid top-up request id. Use the topupRequestId from POST /api/topup/initiate (24-character hex, no \"id\" prefix).",
      400,
    );
  }

  try {
    const topupRequest = await submitTopupReceipt(
      topupRequestId,
      req.user._id,
      req.file,
      req,
    );

    sendSuccess(res, {
      message: "Receipt submitted and queued for manual review",
      data: formatTopupRequest(topupRequest),
    });
  } catch (error) {
    return sendError(res, error.message, error.status || 400);
  }
});

exports.listRequests = asyncHandler(async (req, res) => {
  const requests = await listTopupRequestsForUser(req.user._id, {
    limit: Number(req.query.limit) || 50,
    skip: Number(req.query.skip) || 0,
  });

  sendSuccess(res, {
    data: {
      requests: requests.map(formatTopupRequest),
    },
  });
});

exports.getRequest = asyncHandler(async (req, res) => {
  const topupRequestId = normalizeObjectId(req.params.id);
  if (!topupRequestId) {
    return sendError(res, "Invalid top-up request id", 400);
  }

  const request = await getTopupRequestForUser(topupRequestId, req.user._id);
  if (!request) return sendError(res, "Top-up request not found", 404);

  sendSuccess(res, { data: formatTopupRequest(request) });
});

exports.getReceipt = asyncHandler(async (req, res) => {
  const topupRequestId = normalizeObjectId(req.params.id);
  if (!topupRequestId) {
    return sendError(res, "Invalid top-up request id", 400);
  }

  const request = await getTopupRequestForUser(topupRequestId, req.user._id);
  if (!request) return sendError(res, "Top-up request not found", 404);
  if (request.status !== "approved" || !request.receiptNumber) {
    return sendError(res, "Receipt is not available for this top-up yet", 404);
  }

  const Transaction = require("../models/Transaction");
  const transaction = await Transaction.findById(request.transactionId);
  if (!transaction?.receiptPath) {
    return sendError(res, "Receipt file not found", 404);
  }

  const receipt = await readReceipt(transaction.receiptPath);
  sendSuccess(res, { data: receipt });
});
