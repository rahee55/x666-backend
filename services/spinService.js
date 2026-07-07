const SpinHistory = require('../models/SpinHistory');
const { SPIN_SLOTS, SPIN_WEIGHTS, SPIN_LIFETIME_LIMIT } = require('../config/constants');

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

const getWithdrawEligibility = async (userId) => {
  const canWithdraw = await hasCompletedFirstSpin(userId);

  return {
    canWithdraw,
    firstSpinRequired: !canWithdraw,
    message: canWithdraw ? null : 'Complete your first spin before withdrawing',
  };
};

const assertWithdrawAllowed = async (userId) => {
  if (await hasCompletedFirstSpin(userId)) {
    return;
  }

  const error = new Error('Complete your first spin before withdrawing');
  error.code = 'FIRST_SPIN_REQUIRED';
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
  getWithdrawEligibility,
  assertWithdrawAllowed,
  assertCanSpin,
  assertWeightConfig,
};
