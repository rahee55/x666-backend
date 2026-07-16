const { hasCompletedFirstSpin } = require('./spinService');

const formatPublicUser = async (user, { includeReferredBy = false } = {}) => {
  const spun = await hasCompletedFirstSpin(user._id);

  const formatted = {
    id: user._id,
    name: user.name,
    phone: user.phone ?? null,
    email: user.email ?? null,
    isPhoneVerified: user.isPhoneVerified,
    isEmailVerified: user.isEmailVerified,
    referralCode: user.referralCode,
    totalReferrals: user.totalReferrals,
    kycStatus: user.kycStatus,
    spin: spun,
  };

  if (includeReferredBy && user.referredBy) {
    formatted.referredBy =
      typeof user.referredBy === 'object' && user.referredBy !== null
        ? {
            id: user.referredBy._id,
            name: user.referredBy.name,
            referralCode: user.referredBy.referralCode,
          }
        : user.referredBy;
  }

  return formatted;
};

module.exports = { formatPublicUser };
