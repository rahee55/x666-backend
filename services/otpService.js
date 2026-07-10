const OTP = require('../models/OTP');
const { sendEmail, useEthereal } = require('../config/email');
const { generateCode } = require('./helper');

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RATE_LIMIT = 5;
const OTP_RATE_WINDOW_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

const VALID_PURPOSES = ['reset_password'];

class OtpRateLimitError extends Error {
  constructor(message = 'Too many OTP requests. Please try again in 10 minutes.') {
    super(message);
    this.name = 'OtpRateLimitError';
    this.code = 'OTP_RATE_LIMIT';
    this.status = 429;
  }
}

const normalizeIdentifier = (identifier) => {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('A valid identifier (phone or email) is required');
  }

  const trimmed = identifier.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
};

const isEmail = (identifier) => identifier.includes('@');

const assertValidPurpose = (purpose) => {
  if (!VALID_PURPOSES.includes(purpose)) {
    throw new Error(`Invalid OTP purpose. Must be one of: ${VALID_PURPOSES.join(', ')}`);
  }
};

const checkSendRateLimit = async (identifier) => {
  const windowStart = new Date(Date.now() - OTP_RATE_WINDOW_MS);
  const recentCount = await OTP.countDocuments({
    identifier,
    createdAt: { $gte: windowStart },
  });

  if (recentCount >= OTP_RATE_LIMIT) {
    throw new OtpRateLimitError();
  }
};

const sendSmsOtp = async (phone, code, purpose) => {
  const payload = {
    to: phone,
    message: `Your ${purpose} verification code is ${code}. Valid for 10 minutes.`,
    provider: process.env.SMS_PROVIDER || 'stub',
  };

  // Stub SMS provider — replace with Jazz/Telenor/Zong API integration
  console.log('[SMS STUB]', JSON.stringify({ ...payload, code: '[REDACTED]' }));
  console.log(`[SMS STUB] OTP for ${phone}: ${code}`);

  return { channel: 'sms', provider: payload.provider, status: 'queued' };
};

const sendEmailOtp = async (email, code, purpose) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[EMAIL OTP DEV] ${purpose} code for ${email}: ${code}`);
  }

  if (!useEthereal() && (!process.env.SMTP_HOST || !process.env.SMTP_PASS)) {
    return { channel: 'email', status: 'dev-console-only' };
  }

  try {
    const result = await sendEmail({
      to: email,
      subject: `Your ${purpose} verification code`,
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });

    return {
      channel: 'email',
      messageId: result.messageId,
      previewUrl: result.previewUrl,
      status: 'sent',
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[EMAIL OTP DEV] Nodemailer failed, using console fallback:', error.message);
      return { channel: 'email', status: 'dev-console-fallback' };
    }
    throw error;
  }
};

const generateOTP = async (identifier, purpose) => {
  const normalized = normalizeIdentifier(identifier);
  assertValidPurpose(purpose);
  await checkSendRateLimit(normalized);

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await OTP.create({
    identifier: normalized,
    code,
    purpose,
    expiresAt,
    attempts: 0,
    verified: false,
  });

  return { identifier: normalized, code, expiresAt };
};

const sendOTP = async (identifier, purpose) => {
  const normalized = normalizeIdentifier(identifier);

  if (!isEmail(normalized)) {
    throw new Error('OTP is only sent via email. Provide a valid email address.');
  }

  const { identifier: resolved, code, expiresAt } = await generateOTP(normalized, purpose);
  const delivery = await sendEmailOtp(resolved, code, purpose);

  return { identifier: resolved, expiresAt, delivery };
};

const verifyOTP = async (identifier, code, purpose) => {
  const normalized = normalizeIdentifier(identifier);
  assertValidPurpose(purpose);

  if (!code || typeof code !== 'string') {
    throw new Error('OTP code is required');
  }

  const record = await OTP.findOne({
    identifier: normalized,
    purpose,
    verified: false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .select('+code');

  if (!record) {
    throw new Error('Invalid or expired OTP');
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    throw new Error('Maximum OTP verification attempts exceeded');
  }

  const isValid = await record.compareCode(code.trim());
  if (!isValid) {
    record.attempts += 1;
    await record.save();

    const remaining = MAX_VERIFY_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      throw new Error('Maximum OTP verification attempts exceeded');
    }

    throw new Error(`Invalid OTP. ${remaining} attempt(s) remaining.`);
  }

  record.verified = true;
  await record.save();

  return { identifier: normalized, purpose, verified: true };
};

module.exports = {
  generateOTP,
  sendOTP,
  verifyOTP,
  OtpRateLimitError,
  OTP_RATE_LIMIT,
  OTP_RATE_WINDOW_MS,
  MAX_VERIFY_ATTEMPTS,
};
