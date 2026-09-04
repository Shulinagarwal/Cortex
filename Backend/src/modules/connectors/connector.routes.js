const express = require("express");
const Router = express.Router();

const { isAuthenticated } = require("../../shared/middleware/auth.middleware");
const { validate } = require("../../shared/middleware/validate.middleware");
const { connectorIdParamSchema } = require("./connector.schema");
const {
  handleListConnectors,
  handleStartConnect,
  handleOAuthCallback,
  handleDisconnect,
} = require("./connector.controller");

// Public: GitHub redirects the browser here directly, with no Cortex auth header attached.
// The signed `state` query param (verified inside handleOAuthCallback) is the authorization
// for this one request - not the isAuthenticated middleware.
Router.get("/:id/callback", validate({ params: connectorIdParamSchema }), handleOAuthCallback);

Router.use(isAuthenticated);
Router.get("/", handleListConnectors);
Router.get("/:id/start", validate({ params: connectorIdParamSchema }), handleStartConnect);
Router.delete("/:id", validate({ params: connectorIdParamSchema }), handleDisconnect);

module.exports = Router;
