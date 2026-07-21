const mongoose = require('mongoose');
const manualPayment = require('../config/manualPayment');
const { MIN_TOPUP, MIN_WITHDRAW } = require('../config/constants');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'payment' },
    currency: { type: String, default: manualPayment.currency },
    minTopup: { type: Number, default: MIN_TOPUP, min: 0 },
    minWithdraw: { type: Number, default: MIN_WITHDRAW, min: 0 },
    maxTopupPerTransaction: {
      type: Number,
      default: manualPayment.maxTopupPerTransaction,
      min: 0,
    },
    maxTopupPerDay: { type: Number, default: manualPayment.maxTopupPerDay, min: 0 },
    maxTopupPerDayNewUser: {
      type: Number,
      default: manualPayment.maxTopupPerDayNewUser,
      min: 0,
    },
    newUserDays: { type: Number, default: manualPayment.newUserDays, min: 0 },
    maxPendingTopupsPerUser: {
      type: Number,
      default: manualPayment.maxPendingTopupsPerUser,
      min: 0,
    },
    topupRequestTtlHours: {
      type: Number,
      default: manualPayment.topupRequestTtlHours,
      min: 1,
    },
    withdrawHoldHours: {
      type: Number,
      default: manualPayment.withdrawHoldHours,
      min: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Settings', settingsSchema);
