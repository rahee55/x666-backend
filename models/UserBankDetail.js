const mongoose = require('mongoose');

const userBankDetailSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    gateway: { type: String, enum: ['bank', 'jazzcash', 'easypaisa'], required: true },
    accountTitle: { type: String, trim: true, default: null },
    iban: { type: String, trim: true, uppercase: true, default: null },
    accountNumber: { type: String, trim: true, default: null },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

userBankDetailSchema.index({ userId: 1, gateway: 1, accountNumber: 1 }, { sparse: true });
userBankDetailSchema.index({ userId: 1, iban: 1 }, { sparse: true });

userBankDetailSchema.pre('validate', function validateGatewayFields() {
  if (this.gateway === 'bank') {
    if (!this.iban) {
      this.invalidate('iban', 'IBAN is required for bank accounts');
    }
    return;
  }

  if (!this.accountNumber) {
    this.invalidate('accountNumber', 'Account number is required for mobile wallets');
  }
});

module.exports = mongoose.model('UserBankDetail', userBankDetailSchema);
