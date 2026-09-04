const express = require("express");
const Router = express.Router();

const { isAuthenticated } = require("../../shared/middleware/auth.middleware");
const { validate } = require("../../shared/middleware/validate.middleware");
const {
  factIdParamSchema,
  updateMemorySchema,
  updateMemorySettingsSchema,
} = require("./memory.schema");
const {
  handleAddMemory,
  handleListMemories,
  handleUpdateMemory,
  handleDeleteMemory,
  handleGetMemorySettings,
  handleUpdateMemorySettings,
} = require("./memory.controller");

Router.use(isAuthenticated);

Router.get("/settings", handleGetMemorySettings);
Router.put("/settings", validate({ body: updateMemorySettingsSchema }), handleUpdateMemorySettings);

Router.get("/", handleListMemories);
Router.post("/", validate({ body: updateMemorySchema }), handleAddMemory);
Router.put("/:id", validate({ params: factIdParamSchema, body: updateMemorySchema }), handleUpdateMemory);
Router.delete("/:id", validate({ params: factIdParamSchema }), handleDeleteMemory);

module.exports = Router;
