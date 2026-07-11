const mongoose = require('mongoose');

const PENDING_SIGNUP_TTL_MS = 15 * 60 * 1000;

const pendingSignupSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, unique: true, trim: true },
    channel: { type: String, enum: ['email', 'sms'], required: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    referralCode: { type: String, default: null, trim: true },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

pendingSignupSchema.statics.buildExpiry = () => new Date(Date.now() + PENDING_SIGNUP_TTL_MS);

module.exports = mongoose.model('PendingSignup', pendingSignupSchema);
