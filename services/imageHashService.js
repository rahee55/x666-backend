const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { Jimp, intToRGBA } = require("jimp");
const manualPayment = require("../config/manualPayment");

const HASH_SIZE = 8;

const mimeFromPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return null;
};

const readReceiptImage = async (filePath) => {
  const mime = mimeFromPath(filePath);
  if (mime) {
    const buffer = await fs.readFile(filePath);
    return Jimp.read(buffer, mime);
  }
  return Jimp.read(filePath);
};

const averageHash = async (filePath) => {
  const image = await readReceiptImage(filePath);
  image.greyscale().resize({ w: HASH_SIZE, h: HASH_SIZE });

  let total = 0;
  const pixels = [];

  for (let y = 0; y < HASH_SIZE; y += 1) {
    for (let x = 0; x < HASH_SIZE; x += 1) {
      const { r } = intToRGBA(image.getPixelColor(x, y));
      pixels.push(r);
      total += r;
    }
  }

  const average = total / pixels.length;
  return pixels.map((value) => (value >= average ? "1" : "0")).join("");
};

const hammingDistance = (hashA, hashB) => {
  if (!hashA || !hashB || hashA.length !== hashB.length) {
    return Infinity;
  }

  let distance = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] !== hashB[i]) distance += 1;
  }
  return distance;
};

const fileSha256 = async (filePath) => {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

const isNearDuplicate = (hashA, hashB) =>
  hammingDistance(hashA, hashB) <= manualPayment.phashSimilarityThreshold;

module.exports = {
  averageHash,
  hammingDistance,
  fileSha256,
  isNearDuplicate,
};
