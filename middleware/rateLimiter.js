const rateLimit = require('express-rate-limit');

const apiError = (message) => ({ success: false, message });

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: apiError('Too many OTP requests. Please wait a minute and try again.'),
  standardHeaders: true,
  legacyHeaders: false,
});

const spinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: apiError('Too many spin attempts. Please slow down and try again.'),
  standardHeaders: true,
  legacyHeaders: false,
});

/** Optional signup protection only — login routes are not rate-limited. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: apiError('Too many signup attempts from this device. Please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
});

const topupInitiateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: apiError('Too many top-up initiation attempts. Please try again later.'),
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { otpLimiter, spinLimiter, authLimiter, topupInitiateLimiter };
