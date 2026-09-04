const ChatModel = require("./chat.model");
const MessageModel = require("../message/message.model");
const { sendError } = require("../../shared/utils/apiError");

const handleCreateChat = async (req, res) => {
  const chat = await ChatModel.create({ createdby: req.user._id });
  return res.status(201).json({ msg: "chat Created successfully", chat: chat });
};

const handleGetUserChats = async (req, res) => {
  const chats = await ChatModel.find({ createdby: req.user._id }).sort({
    createdAt: -1,
  });
  return res.status(200).json({ chats: chats });
};

const handleDeleteChat = async (req, res) => {
  try {
    const chat = await ChatModel.findOneAndDelete({
      _id: req.params.id,
      createdby: req.user._id,
    });

    if (!chat) {
      return sendError(res, 404, "NOT_FOUND", "Chat not found.");
    }

    await MessageModel.deleteMany({ chatId: chat._id });

    return res.status(200).json({ msg: "Chat deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat:", error);
    return sendError(res, 500, "DELETE_FAILED", "Failed to delete chat.");
  }
};

module.exports = { handleCreateChat, handleGetUserChats, handleDeleteChat };
