const fs = require("fs");
const path = require("path");
const axios = require("axios");
const TopupRequest = require("../models/TopupRequest");
const {
  averageHash,
  fileSha256,
  isNearDuplicate,
} = require("./imageHashService");

const DUPLICATE_MESSAGE =
  "This receipt has already been uploaded. Please use a different payment screenshot.";

const HF_MODEL =
  process.env.HF_DUPLICATE_MODEL || "sentence-transformers/clip-ViT-B-32";
const HF_SIMILARITY_THRESHOLD =
  Number(process.env.HF_RECEIPT_SIMILARITY_THRESHOLD) || 0.92;

const ACTIVE_RECEIPT_STATUSES = ["under_review", "approved"];

const normalizeFilename = (name) =>
  String(name || "")
    .trim()
    .toLowerCase();

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
      {
        headers,
        timeout: 45000,
      },
    );

    return flattenEmbedding(response.data);
  } catch {
    return null;
  }
};

const resolveReceiptPath = (receiptImageUrl) => {
  if (!receiptImageUrl) return null;
  return path.join(process.cwd(), receiptImageUrl);
};

const findDuplicateReceipt = async ({
  filePath,
  userId,
  topupRequestId,
  originalFilename,
}) => {
  const fileHash = await fileSha256(filePath);

  const exactMatch = await TopupRequest.findOne({
    receiptFileHash: fileHash,
    status: { $in: ACTIVE_RECEIPT_STATUSES },
    _id: { $ne: topupRequestId },
  })
    .select("referenceCode")
    .lean();

  if (exactMatch) {
    return {
      duplicate: true,
      method: "sha256",
      message: DUPLICATE_MESSAGE,
      referenceCode: exactMatch.referenceCode,
    };
  }

  const normalizedName = normalizeFilename(originalFilename);
  if (normalizedName) {
    const sameNameMatch = await TopupRequest.findOne({
      userId,
      receiptOriginalFilename: normalizedName,
      status: { $in: ACTIVE_RECEIPT_STATUSES },
      _id: { $ne: topupRequestId },
    })
      .select("referenceCode")
      .lean();

    if (sameNameMatch) {
      return {
        duplicate: true,
        method: "filename",
        message: DUPLICATE_MESSAGE,
        referenceCode: sameNameMatch.referenceCode,
      };
    }
  }

  const imageHash = await averageHash(filePath);
  const candidates = await TopupRequest.find({
    receiptImageHash: { $ne: null },
    status: { $in: ACTIVE_RECEIPT_STATUSES },
    _id: { $ne: topupRequestId },
  })
    .select("receiptImageHash receiptImageUrl receiptImageEmbedding referenceCode")
    .lean();

  const phashMatch = candidates.find((entry) =>
    isNearDuplicate(entry.receiptImageHash, imageHash),
  );

  if (phashMatch) {
    return {
      duplicate: true,
      method: "phash",
      message: DUPLICATE_MESSAGE,
      referenceCode: phashMatch.referenceCode,
      imageHash,
    };
  }

  const newEmbedding = await getImageEmbedding(filePath);
  if (newEmbedding) {
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
      if (similarity >= HF_SIMILARITY_THRESHOLD) {
        return {
          duplicate: true,
          method: "huggingface",
          message: DUPLICATE_MESSAGE,
          similarity,
          referenceCode: candidate.referenceCode,
          imageHash,
          embedding: newEmbedding,
        };
      }
    }

    return {
      duplicate: false,
      imageHash,
      embedding: newEmbedding,
    };
  }

  return {
    duplicate: false,
    imageHash,
  };
};

module.exports = {
  DUPLICATE_MESSAGE,
  findDuplicateReceipt,
  getImageEmbedding,
  cosineSimilarity,
};
