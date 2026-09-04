const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["USER", "AI"],
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
    },
    toolsUsed: {
      type: [String],
      default: undefined,
    },
    idempotencyKey: {
      type: String,
      default: undefined,
    },
  },
  { timestamps: true },
);

// Sparse: only USER messages carry a key, and older rows have none. Unique so a repeated
// submission of the same logical send can never create a second row, whatever caused it.
MessageSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const MessageModel = mongoose.models.Message || mongoose.model("Message", MessageSchema);

module.exports = MessageModel;
