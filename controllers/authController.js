const jwt = require('jsonwebtoken');
const User = require('../models/Users');
const Wallet = require('../models/Wallet');
const { sendOTP, verifyOTP, OtpRateLimitError } = require('../services/otpService');
const { trackReferral } = require('../services/referralService');
const { asyncHandler, sendSuccess, sendError } = require('../services/helper');
const {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validate,
  passwordsMatch,
} = require('../services/validationSchema');

const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const handleOtpError = (res, error) => {
  if (error instanceof OtpRateLimitError || error.code === 'OTP_RATE_LIMIT') {
    return sendError(res, error.message, error.status || 429);
  }
  return sendError(res, error.message);
};

const findReferrer = async (referralCode) => {
  if (!referralCode) return null;
  const referrer = await User.findOne({ referralCode: referralCode.trim().toUpperCase() });
  if (!referrer) {
    throw new Error('Invalid referral code');
  }
  return referrer;
};

const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  phone: user.phone,
  email: user.email,
  isPhoneVerified: user.isPhoneVerified,
  isEmailVerified: user.isEmailVerified,
  referralCode: user.referralCode,
  totalReferrals: user.totalReferrals,
  kycStatus: user.kycStatus,
});

exports.signup = asyncHandler(async (req, res) => {
  const errors = validate(signupSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { name, phone, email, password, confirmPassword, referralCode } = req.body;

  if (!passwordsMatch(password, confirmPassword)) {
    return sendError(res, 'Password and confirm password do not match');
  }

  const normalizedPhone = phone.trim();
  const normalizedEmail = email.trim().toLowerCase();

  const phoneTaken = await User.findOne({ phone: normalizedPhone });
  if (phoneTaken) return sendError(res, 'Phone already registered', 409);

  const emailTaken = await User.findOne({ email: normalizedEmail });
  if (emailTaken) return sendError(res, 'Email already registered', 409);

  let referrer = null;
  try {
    referrer = await findReferrer(referralCode);
  } catch (error) {
    return sendError(res, error.message);
  }

  const user = await User.create({
    name: name.trim(),
    phone: normalizedPhone,
    email: normalizedEmail,
    password,
    isPhoneVerified: false,
    isEmailVerified: false,
    referredBy: referrer?._id || null,
  });

  await Wallet.create({ userId: user._id, balance: 0, lockedBalance: 0 });

  if (referrer) {
    await trackReferral(referrer._id, user._id);
  }

  const token = signToken(user._id);

  sendSuccess(res, {
    message: 'Account created successfully',
    data: {
      token,
      user: formatUser(user),
    },
  }, 201);
});

exports.login = asyncHandler(async (req, res) => {
  const errors = validate(loginSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { phone, email, password } = req.body;

  if (!phone && !email) {
    return sendError(res, 'Phone or email is required');
  }

  const query = phone ? { phone: phone.trim() } : { email: email.trim().toLowerCase() };
  const user = await User.findOne(query).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return sendError(res, 'Invalid credentials', 401);
  }

  const token = signToken(user._id);

  sendSuccess(res, {
    message: 'Login successful',
    data: { token, user: formatUser(user) },
  });
});

exports.logout = asyncHandler(async (req, res) => {
  if (req.session) {
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
  }

  sendSuccess(res, {
    message: 'Logged out successfully. Discard the JWT on the client.',
  });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const errors = validate(forgotPasswordSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { email } = req.body;

  const genericMessage = 'If an account exists, an OTP has been sent to your email.';

  const user = await User.findOne({ email: email.trim().toLowerCase() });

  if (!user || !user.email) {
    return sendSuccess(res, { message: genericMessage });
  }

  try {
    await sendOTP(user.email, 'reset_password');
  } catch (error) {
    return handleOtpError(res, error);
  }

  sendSuccess(res, {
    message: genericMessage,
    data: {
      channel: 'email',
      identifier: user.email,
    },
  });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const errors = validate(resetPasswordSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { email, code, newPassword, confirmPassword } = req.body;

  if (!passwordsMatch(newPassword, confirmPassword)) {
    return sendError(res, 'Password and confirm password do not match');
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    await verifyOTP(normalizedEmail, code, 'reset_password');
  } catch (error) {
    return sendError(res, error.message, error.message.includes('attempts exceeded') ? 429 : 400);
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  user.password = newPassword;
  await user.save();

  const token = signToken(user._id);

  sendSuccess(res, {
    message: 'Password reset successful',
    data: { token, user: formatUser(user) },
  });
});
