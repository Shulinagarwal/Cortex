const { getConnector, listConnectors } = require("./connectorCatalog");
const ConnectorConnectionModel = require("./connectorConnection.model");
const { encrypt, decrypt } = require("./encryption.util");
const {
  signState,
  verifyState,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} = require("./connectorOAuth.service");

const getRedirectUri = (connectorId) =>
  `${process.env.BACKEND_URL || "http://localhost:5000"}/api/connectors/${connectorId}/callback`;

// Refresh a little before actual expiry, not exactly at it, so a request in flight doesn't
// race a token that expires mid-call.
const REFRESH_BUFFER_MS = 60_000;

const isExpired = (expiresAt) =>
  Boolean(expiresAt) && new Date(expiresAt).getTime() - REFRESH_BUFFER_MS <= Date.now();

// GitHub's tokens don't expire on any useful timescale, so this was never exercised by
// GitHub testing - Google's ~1hr access token lifetime is what actually requires it.
const getFreshAccessToken = async (connection) => {
  if (!isExpired(connection.expiresAt)) {
    return decrypt(connection.encryptedAccessToken);
  }

  if (!connection.encryptedRefreshToken) {
    throw new Error(
      `${connection.connectorId} token expired and no refresh token is stored - reconnect required.`,
    );
  }

  const connector = getConnector(connection.connectorId);
  const refreshToken = decrypt(connection.encryptedRefreshToken);
  const refreshed = await refreshAccessToken(connector, refreshToken);

  const expiresAt = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null;

  await ConnectorConnectionModel.findByIdAndUpdate(connection._id, {
    encryptedAccessToken: encrypt(refreshed.accessToken),
    // Most providers (Google included) don't reissue a refresh_token on refresh - the
    // original stays valid, so only overwrite it when a new one actually comes back.
    ...(refreshed.refreshToken ? { encryptedRefreshToken: encrypt(refreshed.refreshToken) } : {}),
    expiresAt,
  });

  return refreshed.accessToken;
};

const listAvailableConnectors = async (userId) => {
  const connections = await ConnectorConnectionModel.find({ userId });
  const connectedIds = new Set(connections.map((c) => c.connectorId));

  return listConnectors().map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    connected: connectedIds.has(c.id),
  }));
};

const startConnect = (userId, connectorId) => {
  const connector = getConnector(connectorId);
  if (!connector || !connector.clientId) return null;

  const state = signState(userId, connectorId);
  return buildAuthorizeUrl(connector, state, getRedirectUri(connectorId));
};

const handleCallback = async (connectorId, code, state) => {
  const connector = getConnector(connectorId);
  if (!connector) throw new Error("Unknown connector.");

  const userId = verifyState(state, connectorId);
  const tokens = await exchangeCodeForToken(connector, code, getRedirectUri(connectorId));

  const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;

  await ConnectorConnectionModel.findOneAndUpdate(
    { userId, connectorId },
    {
      userId,
      connectorId,
      encryptedAccessToken: encrypt(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      expiresAt,
      scope: tokens.scope,
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  );

  return userId;
};

const disconnect = async (userId, connectorId) => {
  const result = await ConnectorConnectionModel.findOneAndDelete({ userId, connectorId });
  return Boolean(result);
};

const getDecryptedAccessToken = async (userId, connectorId) => {
  const connection = await ConnectorConnectionModel.findOne({ userId, connectorId });
  if (!connection) return null;
  return getFreshAccessToken(connection);
};

const getUserMcpServers = async (userId) => {
  const connections = await ConnectorConnectionModel.find({ userId });
  const servers = {};

  for (const connection of connections) {
    const connector = getConnector(connection.connectorId);
    if (!connector) continue;

    try {
      const accessToken = await getFreshAccessToken(connection);
      servers[connector.id] = {
        transport: "http",
        url: connector.mcpServerUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      };
    } catch (error) {
      console.error(`Skipping ${connector.id} - could not get a usable token:`, error.message);
    }
  }

  return servers;
};

module.exports = {
  listAvailableConnectors,
  startConnect,
  handleCallback,
  disconnect,
  getDecryptedAccessToken,
  getUserMcpServers,
};
