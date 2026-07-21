const User = require('../models/Users');
const Wallet = require('../models/Wallet');
const {
  sendOTP,
  verifyOTP,
  normalizePhone,
  OtpRateLimitError,
} = require('../services/otpService');
const { trackReferral } = require('../services/referralService');
const { formatPublicUser } = require('../services/userService');
const { signToken } = require('../services/authService');
const { asyncHandler, sendSuccess, sendError } = require('../services/helper');
const {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  validateEmailOrPhone,
  validate,
  passwordsMatch,
} = require('../services/validationSchema');

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

const resolveSignupIdentifier = ({ phone, email }) => {
  const identifierErrors = validateEmailOrPhone({ phone, email }, { requireExactlyOne: true });
  if (identifierErrors.length) {
    return { error: identifierErrors.join(', ') };
  }

  if (email) {
    return { channel: 'email', identifier: email.trim().toLowerCase() };
  }

  return { channel: 'sms', identifier: normalizePhone(phone.trim()) };
};

const resolveAuthIdentifier = ({ phone, email }) => {
  const identifierErrors = validateEmailOrPhone({ phone, email });
  if (identifierErrors.length) {
    return { error: identifierErrors.join(', ') };
  }

  if (email) {
    return { channel: 'email', identifier: email.trim().toLowerCase() };
  }

  return { channel: 'sms', identifier: normalizePhone(phone.trim()) };
};

const formatUser = formatPublicUser;

exports.signup = asyncHandler(async (req, res) => {
  const errors = validate(signupSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { name, phone, email, password, confirmPassword, referralCode } = req.body;

  if (!passwordsMatch(password, confirmPassword)) {
    return sendError(res, 'Password and confirm password do not match');
  }

  const resolved = resolveSignupIdentifier({ phone, email });
  if (resolved.error) return sendError(res, resolved.error);

  const { identifier, channel } = resolved;

  if (channel === 'email') {
    const emailTaken = await User.findOne({ email: identifier });
    if (emailTaken) return sendError(res, 'Email already registered', 409);
  } else {
    const phoneTaken = await User.findOne({ phone: identifier });
    if (phoneTaken) return sendError(res, 'Phone already registered', 409);
  }

  let referrer = null;
  try {
    referrer = await findReferrer(referralCode);
  } catch (error) {
    return sendError(res, error.message);
  }

  const userPayload = {
    name: name.trim(),
    password,
    referredBy: referrer?._id || null,
  };

  if (channel === 'email') {
    userPayload.email = identifier;
  } else {
    userPayload.phone = identifier;
  }

  const user = await User.create(userPayload);

  await Wallet.create({ userId: user._id, balance: 0, lockedBalance: 0 });

  if (referrer) {
    await trackReferral(referrer._id, user._id);
  }

  const token = signToken(user);

  sendSuccess(
    res,
    {
      message: 'Account created successfully',
      data: { token, user: await formatUser(user) },
    },
    201
  );
});

exports.login = asyncHandler(async (req, res) => {
  const errors = validate(loginSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { phone, email, password } = req.body;

  if (!phone && !email) {
    return sendError(res, 'Phone or email is required');
  }

  const query = phone
    ? { phone: normalizePhone(phone.trim()) }
    : { email: email.trim().toLowerCase() };
  const user = await User.findOne(query).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return sendError(res, 'Invalid credentials', 401);
  }

  if (user.deletedAt) {
    return sendError(res, 'Invalid credentials', 401);
  }

  if (user.status !== 'active') {
    return sendError(res, `Account is ${user.status}`, 403);
  }

  const token = signToken(user);

  sendSuccess(res, {
    message: 'Login successful',
    data: { token, user: await formatUser(user) },
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

  const resolved = resolveAuthIdentifier(req.body);
  if (resolved.error) return sendError(res, resolved.error);

  const { identifier, channel } = resolved;
  const genericMessage = `If an account exists, an OTP has been sent to your ${channel === 'email' ? 'email' : 'phone number'}.`;

  const query = channel === 'email' ? { email: identifier } : { phone: identifier };
  const user = await User.findOne(query);

  if (!user) {
    return sendSuccess(res, { message: genericMessage });
  }

  try {
    await sendOTP(identifier, 'reset_password');
  } catch (error) {
    return handleOtpError(res, error);
  }

  sendSuccess(res, {
    message: genericMessage,
    data: {
      channel,
      identifier,
    },
  });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const errors = validate(resetPasswordSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { phone, email, code, newPassword, confirmPassword } = req.body;

  if (!passwordsMatch(newPassword, confirmPassword)) {
    return sendError(res, 'Password and confirm password do not match');
  }

  const resolved = resolveAuthIdentifier({ phone, email });
  if (resolved.error) return sendError(res, resolved.error);

  const { identifier, channel } = resolved;

  try {
    await verifyOTP(identifier, code, 'reset_password');
  } catch (error) {
    return sendError(res, error.message, error.message.includes('attempts exceeded') ? 429 : 400);
  }

  const query = channel === 'email' ? { email: identifier } : { phone: identifier };
  const user = await User.findOne(query).select('+password');
  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  user.password = newPassword;
  await user.save();

  const token = signToken(user);

  sendSuccess(res, {
    message: 'Password reset successful',
    data: { token, user: await formatUser(user) },
  });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const errors = validate(changePasswordSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!passwordsMatch(newPassword, confirmPassword)) {
    return sendError(res, 'New password and confirm password do not match');
  }

  if (currentPassword === newPassword) {
    return sendError(res, 'New password must be different from current password');
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user) {
    return sendError(res, 'User not found', 404);
  }

  if (!(await user.comparePassword(currentPassword))) {
    return sendError(res, 'Current password is incorrect', 401);
  }

  user.password = newPassword;
  await user.save();

  sendSuccess(res, {
    message: 'Password changed successfully',
  });
});
