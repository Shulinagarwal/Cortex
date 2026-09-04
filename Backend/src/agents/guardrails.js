const MAX_TOOL_CALLS_PER_TURN = Number(process.env.MAX_TOOL_CALLS_PER_TURN || 5);

const DEFAULT_ALLOWED_TOOLS = ["web_search", "read_url", "search_my_documents", "list_my_documents", "write_code"];

// `availableToolNames` defaults to the fixed built-in set, but callers that also have
// per-user MCP connector tools built for this turn should pass the full available name
// list (built-ins + connector tools) so those aren't silently stripped by the allowlist.
const resolveAllowedTools = (requested, availableToolNames = DEFAULT_ALLOWED_TOOLS) => {
  if (!Array.isArray(requested) || requested.length === 0) return availableToolNames;
  return requested.filter((name) => availableToolNames.includes(name));
};

const filterToolsByAllowlist = (tools, allowedNames) => {
  const allowed = new Set(allowedNames);
  return tools.filter((toolInstance) => allowed.has(toolInstance.name));
};

const isOverToolBudget = (toolCallCount, incoming = 0) =>
  toolCallCount + incoming > MAX_TOOL_CALLS_PER_TURN;

const budgetExceededMessage = () =>
  `I reached my limit of ${MAX_TOOL_CALLS_PER_TURN} tool calls for this question, so I stopped and answered with what I had. If the answer looks incomplete, try asking for one thing at a time.`;

module.exports = {
  MAX_TOOL_CALLS_PER_TURN,
  DEFAULT_ALLOWED_TOOLS,
  resolveAllowedTools,
  filterToolsByAllowlist,
  isOverToolBudget,
  budgetExceededMessage,
};
