const { StateGraph, START, END } = require("@langchain/langgraph");

const { StateAnnotation } = require("./state");
const { agentNode } = require("./nodes/agentNode");
const { toolsNode } = require("./nodes/toolsNode");

const shouldContinueToTools = (state) => {
  const lastMessage = state.messages.at(-1);
  if (lastMessage?.tool_calls?.length > 0) return "tools";
  return END;
};

const createCortexAgentApp = () => {
  const workflow = new StateGraph(StateAnnotation)
    .addNode("agent", agentNode)
    .addNode("tools", toolsNode)

    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinueToTools, {
      tools: "tools",
      [END]: END,
    })
    .addEdge("tools", "agent");

  return workflow.compile();
};

let cortexAgentApp;
const getCortexAgentApp = () => {
  if (!cortexAgentApp) cortexAgentApp = createCortexAgentApp();
  return cortexAgentApp;
};

module.exports = {
  getCortexAgentApp,
  createCortexAgentApp,
  shouldContinueToTools,
};
