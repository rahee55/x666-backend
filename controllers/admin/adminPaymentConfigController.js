const BankAccount = require('../../models/BankAccount');
const { getSettings, updateSettings } = require('../../services/settingsService');
const {
  adminBankAccountSchema,
  adminSettingsSchema,
  validate,
} = require('../../services/validationSchema');
const { asyncHandler, sendSuccess, sendError, normalizeObjectId } = require('../../services/helper');

const formatBankAccount = (account) => ({
  id: account._id,
  bankName: account.bankName,
  accountTitle: account.accountTitle,
  accountNumber: account.accountNumber,
  iban: account.iban,
  gateway: account.gateway,
  label: account.label,
  instructions: account.instructions,
  isActive: account.isActive,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
});

exports.listBankAccounts = asyncHandler(async (_req, res) => {
  const accounts = await BankAccount.find().sort('-isActive -updatedAt');
  sendSuccess(res, {
    data: { bankAccounts: accounts.map(formatBankAccount) },
  });
});

exports.createBankAccount = asyncHandler(async (req, res) => {
  const errors = validate(adminBankAccountSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const account = await BankAccount.create(req.body);

  sendSuccess(
    res,
    {
      message: 'Bank account created',
      data: { bankAccount: formatBankAccount(account) },
    },
    201,
  );
});

exports.updateBankAccount = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const errors = validate(adminBankAccountSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const account = await BankAccount.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!account) return sendError(res, 'Bank account not found', 404);

  sendSuccess(res, {
    message: 'Bank account updated',
    data: { bankAccount: formatBankAccount(account) },
  });
});

exports.toggleBankAccount = asyncHandler(async (req, res) => {
  const id = normalizeObjectId(req.params.id);
  if (!id) return sendError(res, 'Invalid id', 400);

  const account = await BankAccount.findById(id);
  if (!account) return sendError(res, 'Bank account not found', 404);

  account.isActive = !account.isActive;
  await account.save();

  sendSuccess(res, {
    message: `Bank account ${account.isActive ? 'activated' : 'deactivated'}`,
    data: { bankAccount: formatBankAccount(account) },
  });
});

exports.getSettings = asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  sendSuccess(res, { data: { settings } });
});

exports.updateSettings = asyncHandler(async (req, res) => {
  const errors = validate(adminSettingsSchema, req.body);
  if (errors.length) return sendError(res, errors.join(', '));

  const settings = await updateSettings(req.body);

  sendSuccess(res, {
    message: 'Settings updated',
    data: { settings },
  });
});
