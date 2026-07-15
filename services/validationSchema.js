const signupSchema = {
  name: { required: true, type: 'string', minLength: 2 },
  phone: { type: 'string' },
  email: { type: 'string' },
  password: { required: true, type: 'string', minLength: 6 },
  confirmPassword: { required: true, type: 'string', minLength: 6 },
  referralCode: { type: 'string' },
};

const loginSchema = {
  phone: { type: 'string' },
  email: { type: 'string' },
  password: { required: true, type: 'string' },
};

const forgotPasswordSchema = {
  phone: { type: 'string' },
  email: { type: 'string' },
};

const resetPasswordSchema = {
  phone: { type: 'string' },
  email: { type: 'string' },
  code: { required: true, type: 'string' },
  newPassword: { required: true, type: 'string', minLength: 6 },
  confirmPassword: { required: true, type: 'string', minLength: 6 },
};

const changePasswordSchema = {
  currentPassword: { required: true, type: 'string' },
  newPassword: { required: true, type: 'string', minLength: 6 },
  confirmPassword: { required: true, type: 'string', minLength: 6 },
};

const walletOtpSchema = {
  purpose: { required: true, type: 'string', enum: ['topup', 'withdraw'] },
};

const topupSchema = {
  amount: { required: true, type: 'number', min: 1 },
  code: { required: true, type: 'string' },
};

const { WITHDRAW_GATEWAYS, getWithdrawMethod } = require('../config/withdrawMethods');

const withdrawSchema = {
  amount: { required: true, type: 'number', min: 1 },
  gateway: { required: true, type: 'string', enum: WITHDRAW_GATEWAYS },
  accountNumber: { type: 'string' },
  iban: { type: 'string' },
  accountTitle: { type: 'string' },
  code: { required: true, type: 'string' },
};

const validateEmailOrPhone = (data, { requireExactlyOne = false } = {}) => {
  const errors = [];
  const hasEmail = Boolean(data.email && String(data.email).trim());
  const hasPhone = Boolean(data.phone && String(data.phone).trim());

  if (!hasEmail && !hasPhone) {
    errors.push('Either phone or email is required');
    return errors;
  }

  if (requireExactlyOne && hasEmail && hasPhone) {
    errors.push('Provide either phone or email, not both');
  }

  return errors;
};

const validateWithdrawDetails = (data) => {
  const errors = validate(withdrawSchema, data);
  if (errors.length) return errors;

  const method = getWithdrawMethod(data.gateway);
  if (!method) {
    return [`gateway must be one of: ${WITHDRAW_GATEWAYS.join(', ')}`];
  }

  method.requiredFields.forEach((field) => {
    if (!data[field] || String(data[field]).trim() === '') {
      errors.push(`${field} is required for ${method.label}`);
    }
  });

  return errors;
};

const validate = (schema, data) => {
  const errors = [];

  Object.entries(schema).forEach(([field, rules]) => {
    const value = data[field];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      return;
    }

    if (value === undefined || value === null) return;

    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push(`${field} must be a string`);
    }

    if (rules.type === 'number' && typeof value !== 'number') {
      errors.push(`${field} must be a number`);
    }

    if (rules.minLength && String(value).length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (rules.min !== undefined && Number(value) < rules.min) {
      errors.push(`${field} must be at least ${rules.min}`);
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }
  });

  return errors;
};

const passwordsMatch = (password, confirmPassword) => password === confirmPassword;

module.exports = {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  walletOtpSchema,
  topupSchema,
  withdrawSchema,
  validateWithdrawDetails,
  validateEmailOrPhone,
  validate,
  passwordsMatch,
};
