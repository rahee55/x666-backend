const Referral = require('../models/Referral');
const { checkAndPayBonus } = require('../services/referralService');
const { asyncHandler, sendSuccess } = require('../services/helper');

exports.getReferrals = asyncHandler(async (req, res) => {
  const referrals = await Referral.find({ referrerId: req.user._id })
    .populate('referredUserId', 'name phone createdAt')
    .sort('-referredUserSignedUpAt');

  sendSuccess(res, { data: { referrals, count: referrals.length } });
});

exports.claimBonus = asyncHandler(async (req, res) => {
  const result = await checkAndPayBonus(req.user._id);
  sendSuccess(res, {
    message: result ? 'Referral bonus credited' : 'Bonus threshold not reached yet',
    data: {
      balance: result?.wallet?.balance ?? null,
      amount: result?.amount ?? null,
      referralsPaid: result?.referralsPaid ?? null,
    },
  });
});

exports.getStats = asyncHandler(async (req, res) => {
  const [total, qualifyingSpinDone, bonusEligible, bonusPaid] = await Promise.all([
    Referral.countDocuments({ referrerId: req.user._id }),
    Referral.countDocuments({ referrerId: req.user._id, qualifyingSpinDone: true }),
    Referral.countDocuments({ referrerId: req.user._id, bonusEligible: true, bonusPaidAt: null }),
    Referral.countDocuments({ referrerId: req.user._id, bonusPaidAt: { $ne: null } }),
  ]);

  sendSuccess(res, { data: { total, qualifyingSpinDone, bonusEligible, bonusPaid } });
});
