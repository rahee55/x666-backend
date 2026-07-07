const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referredUserSignedUpAt: { type: Date, required: true },
    qualifyingSpinDone: { type: Boolean, default: false },
    bonusEligible: { type: Boolean, default: false },
    bonusPaidAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

referralSchema.index({ referredUserId: 1 }, { unique: true });
referralSchema.index({ referrerId: 1, bonusEligible: 1, bonusPaidAt: 1 });

module.exports = mongoose.model('Referral', referralSchema);
