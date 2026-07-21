const { WITHDRAW_GATEWAYS } = require("../config/withdrawMethods");

const topupInitiateSchema = {
  amount: { required: true, type: "number", min: 1 },
};

const walletOtpSchema = {
  purpose: { required: true, type: "string", enum: ["withdraw"] },
};

const withdrawSchema = {
  amount: { required: true, type: "number", min: 1 },
  gateway: { required: true, type: "string", enum: WITHDRAW_GATEWAYS },
  accountNumber: { type: "string" },
  iban: { type: "string" },
  accountTitle: { type: "string" },
  code: { required: true, type: "string" },
};

const adminReviewSchema = {
  notes: { type: "string" },
};

const bankDetailSchema = {
  gateway: { required: true, type: "string", enum: WITHDRAW_GATEWAYS },
  accountTitle: { type: "string" },
  iban: { type: "string" },
  accountNumber: { type: "string" },
  isDefault: { type: "boolean" },
};

const { getWithdrawMethod } = require("../config/withdrawMethods");

const validateWithdrawDetails = (data) => {
  const errors = validate(withdrawSchema, data);
  if (errors.length) return errors;

  const method = getWithdrawMethod(data.gateway);
  if (!method) {
    return [`gateway must be one of: ${WITHDRAW_GATEWAYS.join(", ")}`];
  }

  method.requiredFields.forEach((field) => {
    if (!data[field] || String(data[field]).trim() === "") {
      errors.push(`${field} is required for ${method.label}`);
    }
  });

  return errors;
};

const validate = (schema, data) => {
  const errors = [];

  Object.entries(schema).forEach(([field, rules]) => {
    const value = data[field];

    if (
      rules.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push(`${field} is required`);
      return;
    }

    if (value === undefined || value === null) return;

    if (rules.type === "string" && typeof value !== "string") {
      errors.push(`${field} must be a string`);
    }

    if (rules.type === "number" && typeof value !== "number") {
      errors.push(`${field} must be a number`);
    }

    if (rules.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${field} must be a boolean`);
    }

    if (rules.minLength && String(value).length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (rules.min !== undefined && Number(value) < rules.min) {
      errors.push(`${field} must be at least ${rules.min}`);
    }

    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
    }
  });

  return errors;
};

const passwordsMatch = (password, confirmPassword) =>
  password === confirmPassword;

const validateEmailOrPhone = (data, { requireExactlyOne = false } = {}) => {
  const errors = [];
  const hasEmail = Boolean(data.email && String(data.email).trim());
  const hasPhone = Boolean(data.phone && String(data.phone).trim());

  if (!hasEmail && !hasPhone) {
    errors.push("Either phone or email is required");
    return errors;
  }

  if (requireExactlyOne && hasEmail && hasPhone) {
    errors.push("Provide either phone or email, not both");
  }

  return errors;
};

const signupSchema = {
  name: { required: true, type: "string", minLength: 2 },
  phone: { type: "string" },
  email: { type: "string" },
  password: { required: true, type: "string", minLength: 6 },
  confirmPassword: { required: true, type: "string", minLength: 6 },
  referralCode: { type: "string" },
};

const loginSchema = {
  phone: { type: "string" },
  email: { type: "string" },
  password: { required: true, type: "string" },
};

const forgotPasswordSchema = {
  phone: { type: "string" },
  email: { type: "string" },
};

const resetPasswordSchema = {
  phone: { type: "string" },
  email: { type: "string" },
  code: { required: true, type: "string" },
  newPassword: { required: true, type: "string", minLength: 6 },
  confirmPassword: { required: true, type: "string", minLength: 6 },
};

const changePasswordSchema = {
  currentPassword: { required: true, type: "string" },
  newPassword: { required: true, type: "string", minLength: 6 },
  confirmPassword: { required: true, type: "string", minLength: 6 },
};

const adminCreateUserSchema = {
  name: { required: true, type: "string", minLength: 2 },
  phone: { type: "string" },
  email: { type: "string" },
  password: { required: true, type: "string", minLength: 6 },
  confirmPassword: { required: true, type: "string", minLength: 6 },
  role: { type: "string", enum: ["user", "admin"] },
  status: { type: "string", enum: ["active", "suspended", "banned"] },
};

const adminUpdateUserSchema = {
  name: { type: "string", minLength: 2 },
  phone: { type: "string" },
  email: { type: "string" },
  role: { type: "string", enum: ["user", "admin"] },
  kycStatus: {
    type: "string",
    enum: ["pending", "submitted", "approved", "rejected"],
  },
};

const adminUpdateUserStatusSchema = {
  status: {
    required: true,
    type: "string",
    enum: ["active", "suspended", "banned"],
  },
};

const adminTransactionRejectSchema = {
  reason: { required: true, type: "string", minLength: 3 },
};

const adminBankAccountSchema = {
  bankName: { required: true, type: "string" },
  accountTitle: { required: true, type: "string" },
  accountNumber: { type: "string" },
  iban: { type: "string" },
  gateway: {
    required: true,
    type: "string",
    enum: ["bank", "jazzcash", "easypaisa"],
  },
  label: { type: "string" },
  instructions: { type: "string" },
  isActive: { type: "boolean" },
};

const adminSettingsSchema = {
  currency: { type: "string" },
  minTopup: { type: "number", min: 0 },
  minWithdraw: { type: "number", min: 0 },
  maxTopupPerTransaction: { type: "number", min: 0 },
  maxTopupPerDay: { type: "number", min: 0 },
  maxTopupPerDayNewUser: { type: "number", min: 0 },
  newUserDays: { type: "number", min: 0 },
  maxPendingTopupsPerUser: { type: "number", min: 0 },
  topupRequestTtlHours: { type: "number", min: 1 },
  withdrawHoldHours: { type: "number", min: 0 },
};

module.exports = {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  walletOtpSchema,
  topupInitiateSchema,
  withdrawSchema,
  adminReviewSchema,
  bankDetailSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminUpdateUserStatusSchema,
  adminTransactionRejectSchema,
  adminBankAccountSchema,
  adminSettingsSchema,
  validateWithdrawDetails,
  validateEmailOrPhone,
  validate,
  passwordsMatch,
};
