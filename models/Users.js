const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { generateReferralCode } = require('../services/helper');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    password: { type: String, required: true, select: false },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    referralCode: { type: String, trim: true, uppercase: true },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    totalReferrals: { type: Number, default: 0, min: 0 },
    kycStatus: {
      type: String,
      enum: ['pending', 'submitted', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ referralCode: 1 }, { unique: true });

userSchema.pre('validate', function assignReferralCode() {
  if (!this.referralCode) {
    this.referralCode = generateReferralCode();
  }
});

userSchema.pre('validate', function requireEmailOrPhone() {
  if (!this.phone && !this.email) {
    this.invalidate('phone', 'Either phone or email is required');
  }
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
