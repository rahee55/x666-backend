const User = require('../models/Users');
const { asyncHandler, sendSuccess } = require('../services/helper');

exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('referredBy', 'name referralCode');
  sendSuccess(res, { data: { user } });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { ...(name && { name }), ...(email && { email }) },
    { new: true, runValidators: true }
  );
  sendSuccess(res, { message: 'Profile updated', data: { user } });
});

exports.getReferralLink = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('referralCode totalReferrals');

  const baseUrl = (process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'https://app.example.com').replace(/\/$/, '');
  const referralLink = `${baseUrl}/signup?ref=${user.referralCode}`;

  sendSuccess(res, {
    data: {
      referralCode: user.referralCode,
      referralLink,
      shareableUrl: referralLink,
      totalReferrals: user.totalReferrals,
    },
  });
});
