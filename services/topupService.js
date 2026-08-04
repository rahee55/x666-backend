const fs = require("fs/promises");
const path = require("path");
const TopupRequest = require("../models/TopupRequest");
const BankAccount = require("../models/BankAccount");
const { getSettings } = require("./settingsService");
const { fileSha256 } = require("./imageHashService");
const {
  DUPLICATE_MESSAGE,
  findDuplicateReceipt,
} = require("./receiptDuplicateService");
const {
  extractFromScreenshot,
  validateExtractedFields,
} = require("./ocrService");
const { classifyReceiptImage } = require("./receiptClassifierService");

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const getClientMeta = (req) => ({
  ip: req.ip || req.headers["x-forwarded-for"] || null,
  userAgent: req.headers["user-agent"] || null,
});

const computeExpectedAmount = (requestedAmount) => {
  const amountOffsetPaisa = Math.floor(Math.random() * 99) + 1;
  const expectedAmount =
    Math.round((requestedAmount + amountOffsetPaisa / 100) * 100) / 100;

  return { expectedAmount, amountOffsetPaisa };
};

const generateReferenceCode = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let suffix = "";
    for (let i = 0; i < 6; i += 1) {
      suffix += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
    }

    const referenceCode = `TOPUP-${suffix}`;
    const exists = await TopupRequest.exists({ referenceCode });
    if (!exists) return referenceCode;
  }

  throw new Error("Unable to generate unique top-up reference");
};

const getActiveBankAccounts = () =>
  BankAccount.find({ isActive: true }).sort({ createdAt: 1 }).lean();

const assertTopupLimits = async (_userId, amount) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Top-up amount must be greater than zero");
  }
};

const expireStalePendingRequests = async (userId) => {
  const now = new Date();
  await TopupRequest.updateMany(
    {
      userId,
      status: "pending",
      expiresAt: { $lte: now },
    },
    { $set: { status: "expired" } },
  );
};

const createTopupRequest = async (userId, amount, req) => {
  await expireStalePendingRequests(userId);
  await assertTopupLimits(userId, amount);

  const settings = await getSettings();
  const { expectedAmount, amountOffsetPaisa } = computeExpectedAmount(amount);
  const referenceCode = await generateReferenceCode();
  const expiresAt = new Date(
    Date.now() + settings.topupRequestTtlHours * 60 * 60 * 1000,
  );

  const topupRequest = await TopupRequest.create({
    userId,
    referenceCode,
    requestedAmount: amount,
    expectedAmount,
    amountOffsetPaisa,
    status: "pending",
    expiresAt,
    clientMeta: { initiate: getClientMeta(req) },
  });

  const bankAccounts = await getActiveBankAccounts();

  return {
    topupRequest,
    bankAccounts,
    instructions:
      "Transfer the exact expected amount to one of the accounts below and include the reference code in the transfer note/remark field.",
  };
};

const submitTopupReceipt = async (topupRequestId, userId, file, req) => {
  const topupRequest = await TopupRequest.findOne({
    _id: topupRequestId,
    userId,
  });

  if (!topupRequest) {
    const error = new Error("Top-up request not found");
    error.status = 404;
    throw error;
  }

  if (topupRequest.status !== "pending") {
    const error = new Error(
      `Top-up request is ${topupRequest.status} and cannot accept a receipt`,
    );
    error.status = 409;
    throw error;
  }

  if (topupRequest.expiresAt <= new Date()) {
    topupRequest.status = "expired";
    await topupRequest.save();
    const error = new Error("Top-up request has expired");
    error.status = 410;
    throw error;
  }

  const duplicateCheck = await findDuplicateReceipt({
    filePath: file.path,
    userId,
    topupRequestId,
    originalFilename: file.originalname,
  });

  if (duplicateCheck.duplicate) {
    await fs.unlink(file.path).catch(() => {});
    const error = new Error(duplicateCheck.message || DUPLICATE_MESSAGE);
    error.status = 409;
    error.code = "DUPLICATE_RECEIPT";
    throw error;
  }

  const receiptClassification = await classifyReceiptImage(file.path);
  if (!receiptClassification.isReceipt) {
    await fs.unlink(file.path).catch(() => {});
    const error = new Error(receiptClassification.reason);
    error.status = 400;
    error.code = "INVALID_RECEIPT_IMAGE";
    throw error;
  }

  const extracted = await extractFromScreenshot(file.path);
  extracted.reference = topupRequest.referenceCode;

  const ocrMatchResult = validateExtractedFields({
    extracted,
    referenceCode: topupRequest.referenceCode,
    expectedAmount: topupRequest.expectedAmount,
    submittedAt: new Date(),
  });

  topupRequest.receiptImageUrl = path
    .relative(process.cwd(), file.path)
    .replace(/\\/g, "/");
  topupRequest.receiptImageHash = duplicateCheck.imageHash;
  topupRequest.receiptFileHash = await fileSha256(file.path);
  topupRequest.receiptOriginalFilename = String(file.originalname || "")
    .trim()
    .toLowerCase();
  topupRequest.receiptImageEmbedding = duplicateCheck.embedding || null;
  topupRequest.ocrExtractedData = extracted;
  topupRequest.ocrMatchResult = ocrMatchResult;
  topupRequest.receiptClassification = receiptClassification;
  topupRequest.status = "under_review";
  topupRequest.clientMeta = {
    ...topupRequest.clientMeta,
    submit: getClientMeta(req),
  };

  await topupRequest.save();

  return topupRequest;
};

const listTopupRequestsForUser = (userId, { limit = 50, skip = 0 } = {}) =>
  TopupRequest.find({ userId })
    .sort("-createdAt")
    .skip(skip)
    .limit(limit)
    .lean();

const getTopupRequestForUser = (topupRequestId, userId) =>
  TopupRequest.findOne({ _id: topupRequestId, userId }).lean();

const formatTopupRequest = (request) => ({
  id: String(request._id),
  topupRequestId: String(request._id),
  referenceCode: request.referenceCode,
  requestedAmount: request.requestedAmount,
  expectedAmount: request.expectedAmount,
  status: request.status,
  receiptImageUrl: request.receiptImageUrl,
  ocrExtractedData: request.ocrExtractedData,
  ocrMatchResult: request.ocrMatchResult,
  receiptClassification: request.receiptClassification,
  adminNotes: request.adminNotes,
  transactionId: request.transactionId,
  receiptNumber: request.receiptNumber,
  expiresAt: request.expiresAt,
  reviewedAt: request.reviewedAt,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
});

module.exports = {
  createTopupRequest,
  submitTopupReceipt,
  listTopupRequestsForUser,
  getTopupRequestForUser,
  getActiveBankAccounts,
  formatTopupRequest,
  computeExpectedAmount,
  generateReferenceCode,
  assertTopupLimits,
};
