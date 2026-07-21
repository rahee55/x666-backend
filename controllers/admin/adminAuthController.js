const User = require('../../models/Users');
const { signToken } = require('../../services/authService');
const { formatAdminUser } = require('../../services/userService');
const { normalizePhone } = require('../../services/otpService');
const {
  loginSchema,
  validateEmailOrPhone,
  validate,
} = require('../../services/validationSchema');
const { asyncHandler, sendSuccess, sendError } = require('../../services/helper');

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

  const user = await User.findOne({ ...query, role: 'admin' }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return sendError(res, 'Invalid credentials', 401);
  }

  if (user.deletedAt) {
    return sendError(res, 'Account is not available', 401);
  }

  if (user.status !== 'active') {
    return sendError(res, `Account is ${user.status}`, 403);
  }

  const token = signToken(user);

  sendSuccess(res, {
    message: 'Admin login successful',
    data: { token, user: formatAdminUser(user) },
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

exports.me = asyncHandler(async (req, res) => {
  sendSuccess(res, {
    data: { user: formatAdminUser(req.user) },
  });
});
