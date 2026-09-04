const express = require("express");
const Router = express.Router();
const { isAuthenticated } = require("../../shared/middleware/auth.middleware");
const { validate } = require("../../shared/middleware/validate.middleware");
const { chatIdParamSchema, sendMessageSchema } = require("./message.schema");
const {
  handleGetMessages,
  handleSendMessage,
} = require("./message.controller");

Router.use(isAuthenticated);

Router.get("/:chatId", validate({ params: chatIdParamSchema }), handleGetMessages);
Router.post("/", validate({ body: sendMessageSchema }), handleSendMessage);

module.exports = Router;
