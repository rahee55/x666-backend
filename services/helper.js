const crypto = require('crypto');
const mongoose = require('mongoose');

const generateReferralCode = (length = 8) => {
  return crypto.randomBytes(length).toString('hex').slice(0, length).toUpperCase();
};

const generateCode = () => crypto.randomInt(100000, 999999).toString();

const normalizeObjectId = (value) => {
  if (value === undefined || value === null) return null;

  let raw = String(value).trim();
  if (!raw) return null;

  // Frontend sometimes sends "id" + 24-char hex instead of the raw MongoDB id.
  if (/^id[a-fA-F0-9]{24}$/.test(raw)) {
    raw = raw.slice(2);
  }

  if (!mongoose.Types.ObjectId.isValid(raw)) {
    return null;
  }

  return raw;
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({ success: true, ...data });
};

const sendError = (res, message, status = 400) => {
  res.status(status).json({ success: false, message });
};

module.exports = {
  generateReferralCode,
  generateCode,
  normalizeObjectId,
  asyncHandler,
  sendSuccess,
  sendError,
};
