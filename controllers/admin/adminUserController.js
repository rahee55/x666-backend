const User = require('../../models/Users');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const { makeDataTable } = require('../../services/table.service');
const { formatAdminUser } = require('../../services/userService');
const { normalizePhone } = require('../../services/otpService');
const {
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminUpdateUserStatusSchema,
  validateEmailOrPhone,
  validate,
  passwordsMatch,
} = require('../../services/validationSchema');
const { asyncHandler, sendSuccess, sendError, normalizeObjectId } = require('../../services/helper');

exports.listUsers = asyncHandler(async (req, res) => {
  const result = await makeDataTable(User, req, {
    baseFilters: { deletedAt: null },
    searchFields: ['name', 'email', 'phone', 'referralCode'],
    defaultSort: { createdAt: -1 },
  });

  sendSuccess(res, {
    draw: result.draw,
    recordsTotal: result.recordsTotal,
    recordsFiltered: result.recordsFiltered,
    data: result.data.map((user) => formatAdminUser(user)),
    pagination: result.pagination,
  });
});

exports.getUser = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid user id', 400);

  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) return sendError(res, 'User not found', 404);

  const wallet = await Wallet.findOne({ userId: user._id });

  sendSuccess(res, {
    data: { user: formatAdminUser(user, { wallet }) },
  });
});

exports.createUser = asyncHandler(async (req, res) => {
  const errors = validate(adminCreateUserSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const {
    name,
    phone,
    email,
    password,
    confirmPassword,
    role = 'user',
    status = 'active',
  } = req.body;

  if (!passwordsMatch(password, confirmPassword)) {
    return sendError(res, 'Password and confirm password do not match');
  }

  const identifierErrors = validateEmailOrPhone({ phone, email }, { requireExactlyOne: true });
  if (identifierErrors.length) return sendError(res, identifierErrors.join(', '));

  const userPayload = {
    name: name.trim(),
    password,
    role,
    status,
  };

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const emailTaken = await User.findOne({ email: normalizedEmail, deletedAt: null });
    if (emailTaken) return sendError(res, 'Email already registered', 409);
    userPayload.email = normalizedEmail;
  } else {
    const normalizedPhone = normalizePhone(phone.trim());
    const phoneTaken = await User.findOne({ phone: normalizedPhone, deletedAt: null });
    if (phoneTaken) return sendError(res, 'Phone already registered', 409);
    userPayload.phone = normalizedPhone;
  }

  const user = await User.create(userPayload);
  await Wallet.create({ userId: user._id, balance: 0, lockedBalance: 0 });

  sendSuccess(
    res,
    {
      message: 'User created',
      data: { user: formatAdminUser(user) },
    },
    201,
  );
});

exports.updateUser = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid user id', 400);

  if (req.body.password !== undefined || req.body.confirmPassword !== undefined) {
    return sendError(res, 'Password cannot be updated via this endpoint', 400);
  }

  ['isPhoneVerified', 'isEmailVerified'].forEach((field) => {
    if (req.body[field] === 'true') req.body[field] = true;
    if (req.body[field] === 'false') req.body[field] = false;
  });

  const errors = validate(adminUpdateUserSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) return sendError(res, 'User not found', 404);

  if (req.body.name !== undefined) user.name = req.body.name.trim();

  if (req.body.kycStatus !== undefined) user.kycStatus = req.body.kycStatus;

  if (req.body.isPhoneVerified !== undefined) {
    user.isPhoneVerified = req.body.isPhoneVerified;
  }

  if (req.body.isEmailVerified !== undefined) {
    user.isEmailVerified = req.body.isEmailVerified;
  }

  if (req.body.role !== undefined) {
    if (String(user._id) === String(req.user._id) && req.body.role !== 'admin') {
      return sendError(res, 'You cannot remove your own admin role', 400);
    }
    user.role = req.body.role;
  }

  if (req.body.status !== undefined) {
    if (String(user._id) === String(req.user._id) && req.body.status !== 'active') {
      return sendError(res, 'You cannot change your own account status', 400);
    }
    user.status = req.body.status;
  }

  if (req.body.email !== undefined) {
    const rawEmail = req.body.email;
    if (rawEmail === null || String(rawEmail).trim() === '') {
      user.email = undefined;
    } else {
      const normalizedEmail = String(rawEmail).trim().toLowerCase();
      const emailTaken = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
        deletedAt: null,
      });
      if (emailTaken) return sendError(res, 'Email already registered', 409);
      user.email = normalizedEmail;
    }
  }

  if (req.body.phone !== undefined) {
    const rawPhone = req.body.phone;
    if (rawPhone === null || String(rawPhone).trim() === '') {
      user.phone = undefined;
    } else {
      const normalizedPhone = normalizePhone(String(rawPhone).trim());
      const phoneTaken = await User.findOne({
        phone: normalizedPhone,
        _id: { $ne: user._id },
        deletedAt: null,
      });
      if (phoneTaken) return sendError(res, 'Phone already registered', 409);
      user.phone = normalizedPhone;
    }
  }

  if (!user.phone && !user.email) {
    return sendError(res, 'User must have at least phone or email', 400);
  }

  await user.save();

  sendSuccess(res, {
    message: 'User updated',
    data: { user: formatAdminUser(user) },
  });
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid user id', 400);

  const errors = validate(adminUpdateUserStatusSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) return sendError(res, 'User not found', 404);

  if (String(user._id) === String(req.user._id) && req.body.status !== 'active') {
    return sendError(res, 'You cannot change your own account status', 400);
  }

  user.status = req.body.status;
  await user.save();

  sendSuccess(res, {
    message: 'User status updated',
    data: { user: formatAdminUser(user) },
  });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid user id', 400);

  if (String(id) === String(req.user._id)) {
    return sendError(res, 'You cannot delete your own account', 400);
  }

  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) return sendError(res, 'User not found', 404);

  const txCount = await Transaction.countDocuments({ userId: user._id });
  if (txCount > 0) {
    user.deletedAt = new Date();
    user.status = 'banned';
    await user.save();
  } else {
    user.deletedAt = new Date();
    user.status = 'banned';
    await user.save();
  }

  sendSuccess(res, {
    message: 'User soft deleted',
    data: { user: formatAdminUser(user) },
  });
});
