// Curated MCP connector catalog (D24: claude.ai-style architecture — remote servers only,
// per-user OAuth against each connector's own server, no local process spawning). Adding a
// new connector is adding a row here, not writing new OAuth/MCP code.
//
// GitHub is the only connector, by decision (D31, 2026-08-26) — Google Calendar/Gmail/Drive
// were built and reverted; see docs/services/SVC-8-memory-mcp.md 2.2 for why.

const CONNECTOR_CATALOG = [
  {
    id: "github",
    name: "GitHub",
    description: "Read and manage issues, pull requests, repositories, and more.",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: process.env.GITHUB_CONNECTOR_CLIENT_ID,
    clientSecret: process.env.GITHUB_CONNECTOR_CLIENT_SECRET,
    scope: "repo",
    mcpServerUrl: "https://api.githubcopilot.com/mcp/",
  },
];

const getConnector = (id) => CONNECTOR_CATALOG.find((c) => c.id === id) || null;

const listConnectors = () => CONNECTOR_CATALOG.filter((c) => Boolean(c.clientId && c.clientSecret));

module.exports = { CONNECTOR_CATALOG, getConnector, listConnectors };
