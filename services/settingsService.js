const Settings = require('../models/Settings');
const manualPayment = require('../config/manualPayment');
const { MIN_TOPUP, MIN_WITHDRAW } = require('../config/constants');

const SETTINGS_KEY = 'payment';

const DEFAULT_SETTINGS = {
  key: SETTINGS_KEY,
  currency: manualPayment.currency,
  minTopup: MIN_TOPUP,
  minWithdraw: MIN_WITHDRAW,
  maxTopupPerTransaction: manualPayment.maxTopupPerTransaction,
  maxTopupPerDay: manualPayment.maxTopupPerDay,
  maxTopupPerDayNewUser: manualPayment.maxTopupPerDayNewUser,
  newUserDays: manualPayment.newUserDays,
  maxPendingTopupsPerUser: manualPayment.maxPendingTopupsPerUser,
  topupRequestTtlHours: manualPayment.topupRequestTtlHours,
  withdrawHoldHours: manualPayment.withdrawHoldHours,
};

const formatSettings = (doc) => {
  const settings = doc?.toObject ? doc.toObject() : doc;
  return {
    currency: settings.currency,
    minTopup: settings.minTopup,
    minWithdraw: settings.minWithdraw,
    maxTopupPerTransaction: settings.maxTopupPerTransaction,
    maxTopupPerDay: settings.maxTopupPerDay,
    maxTopupPerDayNewUser: settings.maxTopupPerDayNewUser,
    newUserDays: settings.newUserDays,
    maxPendingTopupsPerUser: settings.maxPendingTopupsPerUser,
    topupRequestTtlHours: settings.topupRequestTtlHours,
    withdrawHoldHours: settings.withdrawHoldHours,
    updatedAt: settings.updatedAt,
  };
};

const getSettingsDocument = async () => {
  let settings = await Settings.findOne({ key: SETTINGS_KEY });
  if (!settings) {
    settings = await Settings.create(DEFAULT_SETTINGS);
  }
  return settings;
};

const getSettings = async () => formatSettings(await getSettingsDocument());

const getWithdrawHoldHours = async () => {
  const settings = await getSettingsDocument();
  return settings.withdrawHoldHours;
};

const updateSettings = async (payload) => {
  const allowed = [
    'currency',
    'minTopup',
    'minWithdraw',
    'maxTopupPerTransaction',
    'maxTopupPerDay',
    'maxTopupPerDayNewUser',
    'newUserDays',
    'maxPendingTopupsPerUser',
    'topupRequestTtlHours',
    'withdrawHoldHours',
  ];

  const updates = {};
  allowed.forEach((field) => {
    if (payload[field] !== undefined && payload[field] !== null) {
      updates[field] = payload[field];
    }
  });

  const settings = await Settings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: updates },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return formatSettings(settings);
};

const seedSettings = async () => {
  const existing = await Settings.findOne({ key: SETTINGS_KEY });
  if (existing) return;
  await Settings.create(DEFAULT_SETTINGS);
};

module.exports = {
  getSettings,
  getWithdrawHoldHours,
  updateSettings,
  seedSettings,
  formatSettings,
};
