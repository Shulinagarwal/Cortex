const { SystemMessage, AIMessage } = require("@langchain/core/messages");

const { getAgentModel } = require("../modelConfig");
const { buildOrchestratorPrompt } = require("../prompts/orchestratorAgent");
const { buildTools } = require("../tools");
const {
  MAX_TOOL_CALLS_PER_TURN,
  resolveAllowedTools,
  filterToolsByAllowlist,
  isOverToolBudget,
  budgetExceededMessage,
} = require("../guardrails");

const TOOL_MARKUP_TAIL = /<[｜|]DSML[｜|][\s\S]*$/g;
const TOOL_MARKUP_TOKEN = /<[｜|][^>]*[｜|]>/g;

const stripToolCallMarkup = (text) =>
  String(text ?? "")
    .replace(TOOL_MARKUP_TAIL, "")
    .replace(TOOL_MARKUP_TOKEN, "")
    .trim();

const answerWithoutTools = async (state, note) => {
  const model = getAgentModel("orchestrator");
  const response = await model.invoke([
    new SystemMessage(
      `${buildOrchestratorPrompt()}\n\n${note}\nYou have NO tools available now. Write the final ` +
        `answer in plain prose using only the tool results already present in this ` +
        `conversation. Do not emit tool-call syntax of any kind. If part of the question could ` +
        `not be checked, say so plainly rather than guessing.`,
    ),
    ...state.messages,
  ]);

  const cleaned = stripToolCallMarkup(response.content);
  response.content =
    cleaned.length > 0
      ? cleaned
      : "I wasn't able to finish checking everything for that question. Try asking for one part at a time.";

  return response;
};

const agentNode = async (state) => {
  const availableTools = await buildTools(state.userId);
  const allowedNames = resolveAllowedTools(
    state.allowedTools,
    availableTools.map((t) => t.name),
  );
  const tools = filterToolsByAllowlist(availableTools, allowedNames);

  if (isOverToolBudget(state.toolCallCount)) {
    const response = await answerWithoutTools(state, budgetExceededMessage());
    return { messages: [response], budgetExceeded: true };
  }

  const model = getAgentModel("orchestrator").bindTools(tools);
  const response = await model.invoke([
    new SystemMessage(buildOrchestratorPrompt()),
    ...state.messages,
  ]);

  const requested = response.tool_calls ?? [];

  if (requested.length > 0 && isOverToolBudget(state.toolCallCount, requested.length)) {
    const remaining = Math.max(0, MAX_TOOL_CALLS_PER_TURN - state.toolCallCount);
    const kept = requested.slice(0, remaining);

    if (kept.length === 0) {
      const finalAnswer = await answerWithoutTools(state, budgetExceededMessage());
      return { messages: [finalAnswer], budgetExceeded: true };
    }

    const trimmed = new AIMessage({
      content: response.content ?? "",
      tool_calls: kept,
    });

    return {
      messages: [trimmed],
      toolCallCount: state.toolCallCount + kept.length,
      toolsUsed: kept.map((call) => call.name),
      budgetExceeded: true,
    };
  }

  return {
    messages: [response],
    toolCallCount: state.toolCallCount + requested.length,
    toolsUsed: requested.map((call) => call.name),
  };
};

module.exports = { agentNode, stripToolCallMarkup };
