const signupSchema = {
  name: { required: true, type: 'string', minLength: 2 },
  phone: { required: true, type: 'string' },
  email: { required: true, type: 'string' },
  password: { required: true, type: 'string', minLength: 6 },
  confirmPassword: { required: true, type: 'string', minLength: 6 },
  referralCode: { type: 'string' },
};

const verifySignupSchema = {
  name: { required: true, type: 'string', minLength: 2 },
  phone: { required: true, type: 'string' },
  email: { required: true, type: 'string' },
  password: { required: true, type: 'string', minLength: 6 },
  confirmPassword: { required: true, type: 'string', minLength: 6 },
  code: { required: true, type: 'string' },
  referralCode: { type: 'string' },
};

const loginSchema = {
  phone: { type: 'string' },
  email: { type: 'string' },
  password: { required: true, type: 'string' },
};

const forgotPasswordSchema = {
  email: { required: true, type: 'string' },
};

const resetPasswordSchema = {
  email: { required: true, type: 'string' },
  code: { required: true, type: 'string' },
  newPassword: { required: true, type: 'string', minLength: 6 },
  confirmPassword: { required: true, type: 'string', minLength: 6 },
};

const topupSchema = {
  amount: { required: true, type: 'number', min: 1 },
};

const topupVerifySchema = {
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
};

const withdrawVerifySchema = {
  amount: { required: true, type: 'number', min: 1 },
  gateway: { required: true, type: 'string', enum: WITHDRAW_GATEWAYS },
  accountNumber: { type: 'string' },
  iban: { type: 'string' },
  accountTitle: { type: 'string' },
  code: { required: true, type: 'string' },
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

const validateWithdrawVerify = (data) => {
  const errors = validateWithdrawDetails(data);
  const codeErrors = validate({ code: { required: true, type: 'string' } }, data);
  return [...errors, ...codeErrors];
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
  verifySignupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  topupSchema,
  topupVerifySchema,
  withdrawSchema,
  withdrawVerifySchema,
  validateWithdrawDetails,
  validateWithdrawVerify,
  validate,
  passwordsMatch,
};
