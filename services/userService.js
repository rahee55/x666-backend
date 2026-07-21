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
    status: user.status,
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

const formatAdminUser = (user, { wallet = null } = {}) => ({
  id: user._id,
  name: user.name,
  phone: user.phone ?? null,
  email: user.email ?? null,
  role: user.role,
  status: user.status,
  isPhoneVerified: user.isPhoneVerified,
  isEmailVerified: user.isEmailVerified,
  referralCode: user.referralCode,
  totalReferrals: user.totalReferrals,
  kycStatus: user.kycStatus,
  deletedAt: user.deletedAt ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  wallet: wallet
    ? {
        balance: wallet.balance,
        lockedBalance: wallet.lockedBalance,
      }
    : null,
});

module.exports = { formatPublicUser, formatAdminUser };
