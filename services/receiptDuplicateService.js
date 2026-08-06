const fs = require("fs");
const path = require("path");
const axios = require("axios");
const TopupRequest = require("../models/TopupRequest");
const {
  averageHash,
  fileSha256,
  hammingDistance,
} = require("./imageHashService");

const DUPLICATE_MESSAGE =
  "This receipt has already been uploaded. Please use a different payment screenshot.";

const ACTIVE_RECEIPT_STATUSES = ["under_review", "approved"];

const STRICT_PHASH_MAX_DISTANCE =
  Number(process.env.STRICT_PHASH_MAX_DISTANCE) || 2;

const HF_MODEL =
  process.env.HF_DUPLICATE_MODEL || "sentence-transformers/clip-ViT-B-32";

// Very high threshold: only near-identical screenshots (same receipt re-uploaded).
const HF_DUPLICATE_SIMILARITY =
  Number(process.env.HF_RECEIPT_DUPLICATE_SIMILARITY) || 0.98;

const flattenEmbedding = (value) => {
  let embedding = value;
  while (Array.isArray(embedding) && Array.isArray(embedding[0])) {
    embedding = embedding[0];
  }
  return Array.isArray(embedding) ? embedding : null;
};

const cosineSimilarity = (vectorA, vectorB) => {
  if (!vectorA?.length || !vectorB?.length || vectorA.length !== vectorB.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i += 1) {
    dot += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator ? dot / denominator : 0;
};

const getImageEmbedding = async (filePath) => {
  const token = process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_KEY;
  const headers = { "Content-Type": "application/octet-stream" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const imageBuffer = fs.readFileSync(filePath);
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      imageBuffer,
      { headers, timeout: 45000 },
    );
    return flattenEmbedding(response.data);
  } catch {
    return null;
  }
};

const resolveReceiptPath = (receiptImageUrl) =>
  receiptImageUrl ? path.join(process.cwd(), receiptImageUrl) : null;

const findExactFileDuplicate = async (fileHash, topupRequestId) => {
  const exactMatch = await TopupRequest.findOne({
    receiptFileHash: fileHash,
    status: { $in: ACTIVE_RECEIPT_STATUSES },
    _id: { $ne: topupRequestId },
  })
    .select("referenceCode")
    .lean();

  if (!exactMatch) return null;

  return {
    duplicate: true,
    method: "sha256",
    message: DUPLICATE_MESSAGE,
    referenceCode: exactMatch.referenceCode,
  };
};

const findStrictPhashDuplicate = async (imageHash, topupRequestId) => {
  if (!imageHash) return null;

  const candidates = await TopupRequest.find({
    receiptImageHash: { $ne: null },
    status: { $in: ACTIVE_RECEIPT_STATUSES },
    _id: { $ne: topupRequestId },
  })
    .select("receiptImageHash referenceCode")
    .lean();

  const phashMatch = candidates.find(
    (entry) =>
      hammingDistance(entry.receiptImageHash, imageHash) <=
      STRICT_PHASH_MAX_DISTANCE,
  );

  if (!phashMatch) return null;

  return {
    duplicate: true,
    method: "phash",
    message: DUPLICATE_MESSAGE,
    referenceCode: phashMatch.referenceCode,
    imageHash,
  };
};

const findTransactionIdDuplicate = async (transactionId, topupRequestId) => {
  const normalizedId = String(transactionId || "")
    .trim()
    .toUpperCase();

  if (!normalizedId || normalizedId.length < 6) return null;

  const txnMatch = await TopupRequest.findOne({
    receiptTransactionId: normalizedId,
    status: { $in: ACTIVE_RECEIPT_STATUSES },
    _id: { $ne: topupRequestId },
  })
    .select("referenceCode")
    .lean();

  if (!txnMatch) return null;

  return {
    duplicate: true,
    method: "transaction_id",
    message: DUPLICATE_MESSAGE,
    referenceCode: txnMatch.referenceCode,
  };
};

const findAiDuplicate = async (filePath, topupRequestId) => {
  const newEmbedding = await getImageEmbedding(filePath);
  if (!newEmbedding) {
    return { duplicate: false, embedding: null };
  }

  const candidates = await TopupRequest.find({
    status: { $in: ACTIVE_RECEIPT_STATUSES },
    _id: { $ne: topupRequestId },
    $or: [
      { receiptImageEmbedding: { $exists: true, $ne: null } },
      { receiptImageUrl: { $ne: null } },
    ],
  })
    .select("receiptImageEmbedding receiptImageUrl referenceCode")
    .lean();

  for (const candidate of candidates) {
    let candidateEmbedding = flattenEmbedding(candidate.receiptImageEmbedding);

    if (!candidateEmbedding?.length) {
      const candidatePath = resolveReceiptPath(candidate.receiptImageUrl);
      if (candidatePath && fs.existsSync(candidatePath)) {
        candidateEmbedding = await getImageEmbedding(candidatePath);
      }
    }

    if (!candidateEmbedding?.length) continue;

    const similarity = cosineSimilarity(newEmbedding, candidateEmbedding);
    if (similarity >= HF_DUPLICATE_SIMILARITY) {
      return {
        duplicate: true,
        method: "huggingface",
        message: DUPLICATE_MESSAGE,
        similarity,
        referenceCode: candidate.referenceCode,
        embedding: newEmbedding,
      };
    }
  }

  return { duplicate: false, embedding: newEmbedding };
};

const findDuplicateReceipt = async ({ filePath, topupRequestId }) => {
  const fileHash = await fileSha256(filePath);

  const exactDuplicate = await findExactFileDuplicate(fileHash, topupRequestId);
  if (exactDuplicate) return exactDuplicate;

  const imageHash = await averageHash(filePath);
  const phashDuplicate = await findStrictPhashDuplicate(imageHash, topupRequestId);
  if (phashDuplicate) return phashDuplicate;

  return {
    duplicate: false,
    imageHash,
    fileHash,
  };
};

module.exports = {
  DUPLICATE_MESSAGE,
  findDuplicateReceipt,
  findTransactionIdDuplicate,
  findAiDuplicate,
  getImageEmbedding,
};
