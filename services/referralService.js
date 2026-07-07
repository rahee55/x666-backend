const mongoose = require('mongoose');
const Referral = require('../models/Referral');
const User = require('../models/Users');
const { REFERRAL_COUNT_FOR_BONUS, REFERRAL_BONUS_AMOUNT } = require('../config/constants');
const { creditWallet } = require('./walletService');

const trackReferral = async (referrerId, referredUserId) => {
  const existing = await Referral.findOne({ referredUserId });
  if (existing) {
    throw new Error('User already referred');
  }

  await User.findByIdAndUpdate(referrerId, { $inc: { totalReferrals: 1 } });

  return Referral.create({
    referrerId,
    referredUserId,
    referredUserSignedUpAt: new Date(),
    qualifyingSpinDone: false,
    bonusEligible: false,
  });
};

const markQualifyingSpin = async (referredUserId) => {
  const referral = await Referral.findOneAndUpdate(
    { referredUserId, qualifyingSpinDone: false },
    { qualifyingSpinDone: true, bonusEligible: true },
    { new: true }
  );
  return referral;
};

const countQualifyingReferrals = (referrerId, session = null) => {
  const query = Referral.countDocuments({
    referrerId,
    bonusEligible: true,
    bonusPaidAt: null,
  });

  return session ? query.session(session) : query;
};

const checkAndPayBonus = async (referrerId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const qualifyingCount = await countQualifyingReferrals(referrerId, session);

    if (qualifyingCount < REFERRAL_COUNT_FOR_BONUS) {
      await session.abortTransaction();
      return null;
    }

    const referralsToPay = await Referral.find({
      referrerId,
      bonusEligible: true,
      bonusPaidAt: null,
    })
      .sort({ referredUserSignedUpAt: 1 })
      .limit(REFERRAL_COUNT_FOR_BONUS)
      .session(session);

    if (referralsToPay.length < REFERRAL_COUNT_FOR_BONUS) {
      await session.abortTransaction();
      return null;
    }

    const referralIds = referralsToPay.map((referral) => referral._id);
    const paidAt = new Date();

    const markPaid = await Referral.updateMany(
      { _id: { $in: referralIds }, bonusPaidAt: null },
      { $set: { bonusPaidAt: paidAt } },
      { session }
    );

    if (markPaid.modifiedCount < REFERRAL_COUNT_FOR_BONUS) {
      await session.abortTransaction();
      return null;
    }

    const wallet = await creditWallet(referrerId, REFERRAL_BONUS_AMOUNT, 'referral_bonus', {
      gatewayRef: `REF-BONUS-${referralIds.length}-${Date.now()}`,
      status: 'success',
      session,
    });

    await session.commitTransaction();

    return {
      wallet,
      amount: REFERRAL_BONUS_AMOUNT,
      referralsPaid: markPaid.modifiedCount,
      qualifyingCount,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const handleReferredUserSpin = async (referredUserId) => {
  const referral = await Referral.findOne({ referredUserId });
  if (!referral) {
    return { referral: null, referrerBonus: null };
  }

  if (referral.qualifyingSpinDone) {
    return { referral, referrerBonus: null };
  }

  const updatedReferral = await markQualifyingSpin(referredUserId);
  const referrerBonus = updatedReferral
    ? await checkAndPayBonus(updatedReferral.referrerId)
    : null;

  return { referral: updatedReferral, referrerBonus };
};

module.exports = {
  trackReferral,
  markQualifyingSpin,
  countQualifyingReferrals,
  checkAndPayBonus,
  handleReferredUserSpin,
};
