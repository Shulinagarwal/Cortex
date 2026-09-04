const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tokenHash: { type: String, required: true, unique: true },

    expiresAt: { type: Date, required: true },

    revoked: { type: Boolean, default: false, index: true },

    rotatedAt: { type: Date, default: null },

    revokedReason: {
      type: String,
      enum: ["rotated", "logout", "reuse_detected"],
      default: null,
    },

    rotatedFromId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefreshToken",
      default: null,
    },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.RefreshToken || mongoose.model("RefreshToken", refreshTokenSchema);
