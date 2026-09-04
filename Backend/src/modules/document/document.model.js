const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    filename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    detectedMimeType: { type: String, required: true },
    size: { type: Number, required: true },
    chunkCount: { type: Number, required: true },
    storageId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Document || mongoose.model("Document", documentSchema);
