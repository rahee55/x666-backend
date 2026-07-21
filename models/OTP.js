const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const otpSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, trim: true },
    code: { type: String, required: true, select: false },
    purpose: {
      type: String,
      enum: ["reset_password", "withdraw"],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    verified: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ identifier: 1, purpose: 1, verified: 1 });
otpSchema.index({ identifier: 1, createdAt: -1 });

otpSchema.pre("save", async function hashOtpCode() {
  if (!this.isModified("code")) return;
  this.code = await bcrypt.hash(this.code, 10);
});

otpSchema.methods.compareCode = function compareCode(candidate) {
  return bcrypt.compare(candidate, this.code);
};

module.exports = mongoose.model("OTP", otpSchema);
