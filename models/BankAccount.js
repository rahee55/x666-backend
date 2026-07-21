const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema(
  {
    bankName: { type: String, required: true, trim: true },
    accountTitle: { type: String, required: true, trim: true },
    accountNumber: { type: String, trim: true, default: null },
    iban: { type: String, trim: true, uppercase: true, default: null },
    gateway: {
      type: String,
      enum: ["bank", "jazzcash", "easypaisa"],
      required: true,
    },
    label: { type: String, trim: true, default: null },
    instructions: { type: String, trim: true, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BankAccount", bankAccountSchema);
