const {
  listAvailableConnectors,
  startConnect,
  handleCallback,
  disconnect,
} = require("./connector.service");
const { sendError } = require("../../shared/utils/apiError");

const frontendUrl = () =>
  (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");

const handleListConnectors = async (req, res) => {
  try {
    const connectors = await listAvailableConnectors(req.user._id);
    return res.status(200).json({ connectors });
  } catch (error) {
    console.error("Error listing connectors:", error);
    return sendError(res, 500, "CONNECTORS_FETCH_FAILED", "Failed to load connectors.");
  }
};

const handleStartConnect = async (req, res) => {
  const url = startConnect(req.user._id.toString(), req.params.id);
  if (!url) return sendError(res, 404, "NOT_FOUND", "Unknown or unconfigured connector.");
  return res.status(200).json({ url });
};

const handleOAuthCallback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(
      `${frontendUrl()}/settings?tab=connectors&error=${encodeURIComponent(oauthError)}`,
    );
  }

  try {
    await handleCallback(req.params.id, code, state);
    return res.redirect(`${frontendUrl()}/settings?tab=connectors&connected=${req.params.id}`);
  } catch (error) {
    console.error("Connector OAuth callback failed:", error);
    return res.redirect(`${frontendUrl()}/settings?tab=connectors&error=connection_failed`);
  }
};

const handleDisconnect = async (req, res) => {
  try {
    const deleted = await disconnect(req.user._id, req.params.id);
    if (!deleted) return sendError(res, 404, "NOT_FOUND", "Not connected.");
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error disconnecting connector:", error);
    return sendError(res, 500, "CONNECTOR_DISCONNECT_FAILED", "Failed to disconnect.");
  }
};

module.exports = { handleListConnectors, handleStartConnect, handleOAuthCallback, handleDisconnect };
