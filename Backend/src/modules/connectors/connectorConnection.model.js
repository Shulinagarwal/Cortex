const mongoose = require("mongoose");

const connectorConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    connectorId: {
      type: String,
      required: true,
    },
    encryptedAccessToken: {
      type: String,
      required: true,
    },
    encryptedRefreshToken: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    scope: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

connectorConnectionSchema.index({ userId: 1, connectorId: 1 }, { unique: true });

const ConnectorConnectionModel =
  mongoose.models.ConnectorConnection ||
  mongoose.model("ConnectorConnection", connectorConnectionSchema);

module.exports = ConnectorConnectionModel;
