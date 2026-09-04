const { Annotation } = require("@langchain/langgraph");

const StateAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  userId: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  toolsUsed: Annotation({
    reducer: (x, y) => [...new Set([...(x ?? []), ...(y ?? [])])],
    default: () => [],
  }),

  toolCallCount: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),

  allowedTools: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  budgetExceeded: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

module.exports = { StateAnnotation };
