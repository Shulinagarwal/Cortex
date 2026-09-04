const express = require("express");
const Router = express.Router();

const { isAuthenticated } = require("../../shared/middleware/auth.middleware");
const { validate } = require("../../shared/middleware/validate.middleware");
const { idParamSchema } = require("../../shared/validation/common.schema");
const {
  handleCreateChat,
  handleGetUserChats,
  handleDeleteChat,
} = require("./chat.controller");

Router.use(isAuthenticated);
Router.get("/", handleGetUserChats);
Router.post("/", handleCreateChat);
Router.delete("/:id", validate({ params: idParamSchema }), handleDeleteChat);

module.exports = Router;
