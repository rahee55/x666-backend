const mongoose = require('mongoose');

const spinHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountWon: { type: Number, required: true, min: 0 },
    spinSlotShown: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

spinHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SpinHistory', spinHistorySchema);
