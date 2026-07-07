const crypto = require('crypto');

const generateReferralCode = (length = 8) => {
  return crypto.randomBytes(length).toString('hex').slice(0, length).toUpperCase();
};

const generateCode = () => crypto.randomInt(100000, 999999).toString();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, data = {}, status = 200) => {
  res.status(status).json({ success: true, ...data });
};

const sendError = (res, message, status = 400) => {
  res.status(status).json({ success: false, message });
};

module.exports = { generateReferralCode, generateCode, asyncHandler, sendSuccess, sendError };
