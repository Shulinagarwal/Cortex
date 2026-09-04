const { ToolMessage } = require("@langchain/core/messages");

const { buildTools } = require("../tools");
const { resolveAllowedTools, filterToolsByAllowlist } = require("../guardrails");

const toolsNode = async (state) => {
  const lastMessage = state.messages.at(-1);
  const requestedCalls = lastMessage?.tool_calls ?? [];

  const availableTools = await buildTools(state.userId);
  const allowedNames = resolveAllowedTools(
    state.allowedTools,
    availableTools.map((t) => t.name),
  );
  const tools = filterToolsByAllowlist(availableTools, allowedNames);
  const toolsByName = new Map(tools.map((toolInstance) => [toolInstance.name, toolInstance]));

  const outputs = [];
  const executed = [];

  for (const call of requestedCalls) {
    const toolInstance = toolsByName.get(call.name);

    if (!toolInstance) {
      outputs.push(
        new ToolMessage({
          content: `The tool "${call.name}" is not available. Answer without it.`,
          tool_call_id: call.id,
          name: call.name,
        }),
      );
      continue;
    }

    try {
      const result = await toolInstance.invoke(call.args);
      executed.push(call.name);
      outputs.push(
        new ToolMessage({
          content: typeof result === "string" ? result : JSON.stringify(result),
          tool_call_id: call.id,
          name: call.name,
        }),
      );
    } catch (error) {
      console.error(`Tool "${call.name}" failed:`, error.message);
      outputs.push(
        new ToolMessage({
          content: `The ${call.name} tool failed: ${error.message}. Answer with what you have, and say that part could not be checked.`,
          tool_call_id: call.id,
          name: call.name,
        }),
      );
    }
  }

  return { messages: outputs, toolsUsed: executed };
};

module.exports = { toolsNode };
