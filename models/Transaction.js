const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "topup",
        "withdraw",
        "spin_win",
        "referral_bonus",
        "game_debit",
        "game_credit",
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "pending",
        "success",
        "failed",
        "pending_manual_review",
        "pending_review",
        "rejected",
      ],
      default: "pending",
    },
    gatewayRef: { type: String, default: null },
    topupRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TopupRequest",
      default: null,
    },
    paymentReference: { type: String, default: null },
    destinationAccount: { type: String, default: null },
    accountUsed: {
      type: String,
      enum: ["jazzcash", "easypaisa", "bank", "manual", "other"],
      default: null,
    },
    withdrawableAt: { type: Date, default: null },
    receiptNumber: { type: String, default: null },
    receiptPath: { type: String, default: null },
    adminNotes: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ gatewayRef: 1 }, { sparse: true });
transactionSchema.index({ paymentReference: 1 }, { sparse: true });
transactionSchema.index({ topupRequestId: 1 }, { sparse: true });
transactionSchema.index({ userId: 1, type: 1, withdrawableAt: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
