const mongoose = require("mongoose");

const otpRequestSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true },

    codeHash: { type: String, required: true },

    expiresAt: { type: Date, required: true },

    attempts: { type: Number, default: 0 },

    consumed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

otpRequestSchema.index({ email: 1, createdAt: -1 });

otpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.OtpRequest || mongoose.model("OtpRequest", otpRequestSchema);
