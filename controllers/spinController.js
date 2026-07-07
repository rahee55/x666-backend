const SpinHistory = require('../models/SpinHistory');
const { SPIN_COST } = require('../config/constants');
const { pickWeightedSlot, assertCanSpin, getRemainingSpins, getWithdrawEligibility } = require('../services/spinService');
const { creditWallet, debitWallet, getBalance } = require('../services/walletService');
const { handleReferredUserSpin } = require('../services/referralService');
const { asyncHandler, sendSuccess, sendError } = require('../services/helper');

exports.spin = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  let spinsRemaining;
  try {
    spinsRemaining = await assertCanSpin(userId);
  } catch (error) {
    if (error.code === 'SPIN_ALREADY_USED') {
      return sendError(res, error.message, error.status);
    }
    throw error;
  }

  if (SPIN_COST > 0) {
    const wallet = await getBalance(userId);
    if (!wallet || wallet.balance < SPIN_COST) {
      return sendError(res, 'Insufficient balance for spin', 402);
    }
    await debitWallet(userId, SPIN_COST, 'game_debit');
  }

  const spinSlotShown = pickWeightedSlot();
  const amountWon = spinSlotShown;

  if (amountWon > 0) {
    await creditWallet(userId, amountWon, 'spin_win');
  }

  const history = await SpinHistory.create({
    userId,
    amountWon,
    spinSlotShown,
  });

  const { referral, referrerBonus } = await handleReferredUserSpin(userId);

  const wallet = await getBalance(userId);
  const withdrawEligibility = await getWithdrawEligibility(userId);

  sendSuccess(res, {
    message: 'Spin completed',
    data: {
      amountWon,
      spinSlotShown,
      spinCost: SPIN_COST,
      balance: wallet?.balance ?? 0,
      historyId: history._id,
      spinsRemaining,
      canSpin: spinsRemaining > 0,
      canWithdraw: withdrawEligibility.canWithdraw,
      firstSpinRequired: withdrawEligibility.firstSpinRequired,
      referredUser: Boolean(referral),
      qualifyingSpinMarked: Boolean(referral?.qualifyingSpinDone),
      referrerBonusPaid: Boolean(referrerBonus),
    },
  });
});

exports.getHistory = asyncHandler(async (req, res) => {
  const history = await SpinHistory.find({ userId: req.user._id }).sort('-createdAt').limit(50);
  const spinsRemaining = await getRemainingSpins(req.user._id);

  sendSuccess(res, {
    data: {
      history,
      spinsRemaining,
      canSpin: spinsRemaining > 0,
    },
  });
});

exports.getResult = asyncHandler(async (req, res) => {
  const record = await SpinHistory.findOne({ _id: req.params.id, userId: req.user._id });
  if (!record) return sendError(res, 'Spin result not found', 404);
  sendSuccess(res, { data: { result: record } });
});
