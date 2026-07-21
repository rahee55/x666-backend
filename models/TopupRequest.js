const mongoose = require("mongoose");

const clientMetaSchema = new mongoose.Schema(
  {
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { _id: false },
);

const topupRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referenceCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    requestedAmount: { type: Number, required: true, min: 0 },
    expectedAmount: { type: Number, required: true, min: 0 },
    amountOffsetPaisa: { type: Number, required: true, min: 1, max: 99 },
    status: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    receiptImageUrl: { type: String, default: null },
    receiptImageHash: { type: String, default: null, index: true },
    receiptFileHash: { type: String, default: null },
    ocrExtractedData: { type: mongoose.Schema.Types.Mixed, default: null },
    ocrMatchResult: { type: mongoose.Schema.Types.Mixed, default: null },
    adminNotes: { type: String, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    receiptNumber: { type: String, default: null },
    clientMeta: {
      initiate: { type: clientMetaSchema, default: null },
      submit: { type: clientMetaSchema, default: null },
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

topupRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("TopupRequest", topupRequestSchema);
