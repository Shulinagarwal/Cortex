const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_TOOL_CALLS_PER_TURN,
  DEFAULT_ALLOWED_TOOLS,
  resolveAllowedTools,
  filterToolsByAllowlist,
  isOverToolBudget,
} = require("../src/agents/guardrails");

const { shouldContinueToTools } = require("../src/agents/graph");

test("FR-AGENT-05: a fresh turn is under budget", () => {
  assert.equal(isOverToolBudget(0), false);
  assert.equal(isOverToolBudget(0, 2), false);
});

test("FR-AGENT-05: the cap triggers exactly at the limit, not one past it", () => {
  assert.equal(isOverToolBudget(MAX_TOOL_CALLS_PER_TURN - 1, 1), false);
  assert.equal(isOverToolBudget(MAX_TOOL_CALLS_PER_TURN, 1), true);
});

test("FR-AGENT-05: a single oversized batch is caught, not just a slow drift", () => {
  assert.equal(isOverToolBudget(0, MAX_TOOL_CALLS_PER_TURN + 1), true);
});

test("FR-AGENT-05: no allowlist given falls back to the default set", () => {
  assert.deepEqual(resolveAllowedTools(null), DEFAULT_ALLOWED_TOOLS);
  assert.deepEqual(resolveAllowedTools([]), DEFAULT_ALLOWED_TOOLS);
});

test("FR-AGENT-05: an unknown tool name cannot be smuggled into the allowlist", () => {
  const resolved = resolveAllowedTools(["web_search", "execute_code", "rm_rf"]);
  assert.deepEqual(resolved, ["web_search"]);
});

test("FR-AGENT-05: filtering removes tools the session is not allowed", () => {
  const fakeTools = [
    { name: "web_search" },
    { name: "search_my_documents" },
    { name: "write_code" },
  ];
  const filtered = filterToolsByAllowlist(fakeTools, ["web_search"]);
  assert.deepEqual(filtered.map((t) => t.name), ["web_search"]);
});

test("FR-AGENT-03: the loop ends when the model stops requesting tools", () => {
  const state = { messages: [{ content: "done" }] };
  assert.notEqual(shouldContinueToTools(state), "tools");
});

test("FR-AGENT-03: the loop continues while tool calls are pending", () => {
  const state = { messages: [{ content: "", tool_calls: [{ name: "web_search", id: "1" }] }] };
  assert.equal(shouldContinueToTools(state), "tools");
});
