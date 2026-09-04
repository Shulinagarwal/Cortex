const mongoose = require("mongoose");

const userMemoryStateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  unprocessedCount: {
    type: Number,
    default: 0,
  },
  lastProcessedAt: {
    type: Date,
    default: null,
  },
});

const UserMemoryStateModel =
  mongoose.models.UserMemoryState || mongoose.model("UserMemoryState", userMemoryStateSchema);

module.exports = UserMemoryStateModel;
