const mongoose = require('mongoose');
const SpinHistory = require('../models/SpinHistory');
const Transaction = require('../models/Transaction');
const {
  SPIN_SLOTS,
  SPIN_WEIGHTS,
  SPIN_LIFETIME_LIMIT,
  MIN_GAME_USAGE_FOR_WITHDRAW,
} = require('../config/constants');

const assertWeightConfig = () => {
  if (SPIN_SLOTS.length !== SPIN_WEIGHTS.length) {
    throw new Error('SPIN_SLOTS and SPIN_WEIGHTS must have the same length');
  }

  const total = SPIN_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  if (total !== 100) {
    throw new Error('SPIN_WEIGHTS must sum to 100');
  }
};

const pickWeightedSlot = () => {
  assertWeightConfig();

  const roll = Math.random() * 100;
  let cumulative = 0;

  for (let i = 0; i < SPIN_SLOTS.length; i += 1) {
    cumulative += SPIN_WEIGHTS[i];
    if (roll < cumulative) {
      return SPIN_SLOTS[i];
    }
  }

  return SPIN_SLOTS[SPIN_SLOTS.length - 1];
};

const getLifetimeSpinCount = async (userId) =>
  SpinHistory.countDocuments({ userId });

const getRemainingSpins = async (userId) => {
  const used = await getLifetimeSpinCount(userId);
  return Math.max(SPIN_LIFETIME_LIMIT - used, 0);
};

const hasCompletedFirstSpin = async (userId) => (await getLifetimeSpinCount(userId)) >= 1;

const getTotalGameWagered = async (userId) => {
  const result = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(String(userId)),
        type: 'game_debit',
        status: 'success',
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return result[0]?.total || 0;
};

const hasMetMinGameUsage = async (userId) =>
  (await getTotalGameWagered(userId)) >= MIN_GAME_USAGE_FOR_WITHDRAW;

const getWithdrawEligibility = async (userId) => {
  const [firstSpinDone, totalGameUsage] = await Promise.all([
    hasCompletedFirstSpin(userId),
    getTotalGameWagered(userId),
  ]);
  const gameUsageMet = totalGameUsage >= MIN_GAME_USAGE_FOR_WITHDRAW;
  const canWithdraw = firstSpinDone && gameUsageMet;

  let message = null;
  if (!firstSpinDone) {
    message = 'Complete your first spin before withdrawing';
  } else if (!gameUsageMet) {
    const remaining = Math.max(0, MIN_GAME_USAGE_FOR_WITHDRAW - totalGameUsage);
    message = `Play games worth at least ${MIN_GAME_USAGE_FOR_WITHDRAW} PKR before withdrawing. You need ${remaining} PKR more in game play.`;
  }

  return {
    canWithdraw,
    firstSpinRequired: !firstSpinDone,
    minGameUsageRequired: MIN_GAME_USAGE_FOR_WITHDRAW,
    totalGameUsage,
    gameUsageMet,
    message,
  };
};

const assertWithdrawAllowed = async (userId) => {
  const eligibility = await getWithdrawEligibility(userId);
  if (eligibility.canWithdraw) {
    return;
  }

  const error = new Error(eligibility.message);
  error.code = eligibility.firstSpinRequired
    ? 'FIRST_SPIN_REQUIRED'
    : 'MIN_GAME_USAGE_REQUIRED';
  error.status = 403;
  throw error;
};

const assertCanSpin = async (userId) => {
  const used = await getLifetimeSpinCount(userId);
  if (used >= SPIN_LIFETIME_LIMIT) {
    const error = new Error('You have already used your one-time spin');
    error.code = 'SPIN_ALREADY_USED';
    error.status = 403;
    throw error;
  }
  return SPIN_LIFETIME_LIMIT - used - 1;
};

module.exports = {
  pickWeightedSlot,
  getLifetimeSpinCount,
  getRemainingSpins,
  hasCompletedFirstSpin,
  getTotalGameWagered,
  hasMetMinGameUsage,
  getWithdrawEligibility,
  assertWithdrawAllowed,
  assertCanSpin,
  assertWeightConfig,
};
