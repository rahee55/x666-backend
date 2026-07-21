const path = require("path");
const TopupRequest = require("../models/TopupRequest");
const BankAccount = require("../models/BankAccount");
const User = require("../models/Users");
const { getSettings } = require("./settingsService");
const {
  averageHash,
  fileSha256,
  isNearDuplicate,
} = require("./imageHashService");
const {
  extractFromScreenshot,
  validateExtractedFields,
} = require("./ocrService");

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

const countPendingTopupsForUser = (userId) =>
  TopupRequest.countDocuments({
    userId,
    status: { $in: ["pending", "under_review"] },
  });

const getDailyTopupTotal = async (userId) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const result = await TopupRequest.aggregate([
    {
      $match: {
        userId,
        status: { $in: ["pending", "under_review", "approved"] },
        createdAt: { $gte: start },
      },
    },
    { $group: { _id: null, total: { $sum: "$requestedAmount" } } },
  ]);

  return result[0]?.total || 0;
};

const assertTopupLimits = async (userId, amount) => {
  const settings = await getSettings();

  if (amount < settings.minTopup) {
    throw new Error(`Minimum top-up is ${settings.minTopup}`);
  }

  if (amount > settings.maxTopupPerTransaction) {
    throw new Error(
      `Maximum top-up per transaction is ${settings.maxTopupPerTransaction}`,
    );
  }

  const pendingCount = await countPendingTopupsForUser(userId);
  if (pendingCount >= settings.maxPendingTopupsPerUser) {
    const error = new Error(
      `You already have ${pendingCount} pending top-up requests. Complete or wait for them to expire before creating another.`,
    );
    error.status = 429;
    throw error;
  }

  const user = await User.findById(userId);
  const isNewUser =
    user &&
    Date.now() - new Date(user.createdAt).getTime() <
      settings.newUserDays * 24 * 60 * 60 * 1000;

  const dailyLimit = isNewUser
    ? settings.maxTopupPerDayNewUser
    : settings.maxTopupPerDay;

  const dailyTotal = await getDailyTopupTotal(userId);
  if (dailyTotal + amount > dailyLimit) {
    throw new Error(`Daily top-up limit of ${dailyLimit} would be exceeded`);
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

const findDuplicateReceiptHash = async (imageHash) => {
  const candidates = await TopupRequest.find({
    receiptImageHash: { $ne: null },
    status: { $in: ["under_review", "approved"] },
  })
    .select("receiptImageHash referenceCode")
    .lean();

  return (
    candidates.find((entry) => isNearDuplicate(entry.receiptImageHash, imageHash)) ||
    null
  );
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

  const imageHash = await averageHash(file.path);
  const duplicate = await findDuplicateReceiptHash(imageHash);
  if (duplicate) {
    const error = new Error(
      "This receipt image appears to match a previously submitted receipt",
    );
    error.status = 409;
    error.code = "DUPLICATE_RECEIPT";
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
  topupRequest.receiptImageHash = imageHash;
  topupRequest.receiptFileHash = await fileSha256(file.path);
  topupRequest.ocrExtractedData = extracted;
  topupRequest.ocrMatchResult = ocrMatchResult;
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
