const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const STATE_TTL_SECONDS = 600;
const STATE_PURPOSE = "connector-oauth";

const signState = (userId, connectorId) =>
  jwt.sign(
    { purpose: STATE_PURPOSE, userId: String(userId), connectorId, nonce: crypto.randomBytes(8).toString("hex") },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: STATE_TTL_SECONDS },
  );

const verifyState = (state, connectorId) => {
  const payload = jwt.verify(state, process.env.JWT_ACCESS_SECRET);
  if (payload.purpose !== STATE_PURPOSE || payload.connectorId !== connectorId) {
    throw new Error("Invalid or mismatched OAuth state.");
  }
  return payload.userId;
};

const buildAuthorizeUrl = (connector, state, redirectUri) => {
  const url = new URL(connector.authorizeUrl);
  // response_type is a REQUIRED parameter per RFC 6749 for every Authorization Code flow -
  // GitHub silently defaults it (it only supports this one flow) so its absence went
  // unnoticed; Google enforces the spec strictly and rejects the request without it.
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", connector.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", connector.scope);
  url.searchParams.set("state", state);

  // Provider-specific extras (e.g. Google needs access_type=offline&prompt=consent to
  // actually issue a refresh_token) live as data on the catalog entry, not as per-provider
  // code here - keeps this function generic across every connector.
  for (const [key, value] of Object.entries(connector.extraAuthorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

// RFC 6749's token endpoint format is application/x-www-form-urlencoded - the spec-mandated
// request shape every OAuth2 provider must accept. GitHub's JSON support is a convenience
// extension on top of this, not the standard; Google's token endpoint only accepts this
// form-encoded shape. Using it universally works for every provider.
const postToTokenEndpoint = async (tokenUrl, params) => {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Token request failed: ${data.error_description || data.error}`);
  }

  return data;
};

const exchangeCodeForToken = async (connector, code, redirectUri) => {
  const data = await postToTokenEndpoint(connector.tokenUrl, {
    client_id: connector.clientId,
    client_secret: connector.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || null,
    scope: data.scope || null,
  };
};

// Not every provider returns a new refresh_token on refresh (Google typically doesn't -
// the original stays valid and reusable) - refreshToken comes back null in that case,
// meaning "unchanged, keep using the one already stored."
const refreshAccessToken = async (connector, refreshToken) => {
  const data = await postToTokenEndpoint(connector.tokenUrl, {
    client_id: connector.clientId,
    client_secret: connector.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || null,
  };
};

module.exports = { signState, verifyState, buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken };
