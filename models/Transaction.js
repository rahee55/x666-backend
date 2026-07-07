const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['topup', 'withdraw', 'spin_win', 'referral_bonus', 'game_debit', 'game_credit'],
      required: true,
    },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'pending_manual_review'],
      default: 'pending',
    },
    gatewayRef: { type: String, default: null },
    safepayTracker: { type: String, default: null },
    safepayReference: { type: String, default: null },
    destinationAccount: { type: String, default: null },
    accountUsed: {
      type: String,
      enum: ['jazzcash', 'easypaisa', 'safepay', 'bank', 'other'],
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ gatewayRef: 1 }, { sparse: true });
transactionSchema.index({ safepayTracker: 1 }, { sparse: true });

module.exports = mongoose.model('Transaction', transactionSchema);
