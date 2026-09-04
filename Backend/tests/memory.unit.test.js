const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const BACKEND_ROOT = path.join(__dirname, "..");
const resolve = (relative) => require.resolve(path.join(BACKEND_ROOT, relative));

const stubModule = (relative, exports) => {
  const filename = resolve(relative);
  const stub = new Module(filename, null);
  stub.filename = filename;
  stub.loaded = true;
  stub.exports = exports;
  require.cache[filename] = stub;
};

const loadMemoryService = ({ invoke }) => {
  delete require.cache[resolve("src/modules/message/stm.service.js")];

  const chatUpdates = [];
  stubModule("src/modules/chat/chat.model.js", {
    findByIdAndUpdate: async (id, update) => {
      chatUpdates.push({ id, update });
      return null;
    },
  });
  stubModule("src/agents/modelConfig.js", { getAgentModel: () => ({ invoke }) });

  const memoryService = require(resolve("src/modules/message/stm.service.js"));
  return { memoryService, chatUpdates };
};

const makeMessage = (id, role, content) => ({ _id: id, role, content });

const buildPastMessages = (count) =>
  Array.from({ length: count }, (_, i) =>
    makeMessage(`m${i + 1}`, i % 2 === 0 ? "USER" : "AI", `message ${i + 1}`),
  );

test("FR-MEM-01: below threshold, full history is used verbatim and no LLM call happens", async () => {
  let invokeCalls = 0;
  const { memoryService } = loadMemoryService({
    invoke: async () => {
      invokeCalls += 1;
      return { content: "should not be called" };
    },
  });

  const pastMessages = buildPastMessages(5);
  const messages = await memoryService.buildAgentMessages({ chat: { _id: "c1" }, pastMessages });

  assert.equal(invokeCalls, 0, "no summarization call below threshold");
  assert.equal(messages.length, 5);
});

test("FR-MEM-01/02/03: above threshold, older messages fold into a persisted summary and the graph input is summary-prefixed + truncated", async () => {
  const { memoryService, chatUpdates } = loadMemoryService({
    invoke: async () => ({ content: "Concise running summary." }),
  });

  const pastMessages = buildPastMessages(21);
  const messages = await memoryService.buildAgentMessages({ chat: { _id: "c1" }, pastMessages });

  assert.equal(messages.length, 11, "1 summary system message + 10 kept verbatim");
  assert.equal(messages[0]._getType(), "system");
  assert.match(messages[0].content, /Concise running summary\./);

  assert.equal(chatUpdates.length, 1, "the chat's summary field must be persisted exactly once");
  assert.equal(chatUpdates[0].id, "c1");
  assert.equal(chatUpdates[0].update.summary.text, "Concise running summary.");
  assert.equal(chatUpdates[0].update.summary.summarizedThroughMessageId, "m11");
});

test("FR-MEM-02: a chat already summarized only folds the new tail, not the whole history again", async () => {
  const foldedBatches = [];
  const { memoryService } = loadMemoryService({
    invoke: async (msgs) => {
      foldedBatches.push(msgs[0].content);
      return { content: "Updated summary." };
    },
  });

  const pastMessages = buildPastMessages(35);
  const chat = {
    _id: "c1",
    summary: { text: "Old summary.", summarizedThroughMessageId: "m11", updatedAt: new Date() },
  };

  const messages = await memoryService.buildAgentMessages({ chat, pastMessages });

  assert.equal(foldedBatches.length, 1);
  assert.match(foldedBatches[0], /Old summary\./, "previous summary must be carried into the next fold, not discarded");
  assert.doesNotMatch(foldedBatches[0], /message 1[^0-9]/, "already-summarized messages must not be re-sent to the LLM");
  assert.equal(messages[0].content, "Summary of earlier conversation:\nUpdated summary.");
});

test("FR-MEM-04: a summarization failure falls back silently to full raw history, never blocks the send", async () => {
  const { memoryService, chatUpdates } = loadMemoryService({
    invoke: async () => {
      throw new Error("Simulated provider outage");
    },
  });

  const pastMessages = buildPastMessages(21);
  const messages = await memoryService.buildAgentMessages({ chat: { _id: "c1" }, pastMessages });

  assert.equal(chatUpdates.length, 0, "a failed fold must not persist a partial/broken summary");
  assert.equal(messages.length, 21, "falls back to the full unsummarized history");
  assert.equal(messages[0]._getType(), "human");
});

test("FR-MEM-04: a fold failure on an already-summarized chat keeps using the existing summary, not raw history back to the start", async () => {
  const { memoryService, chatUpdates } = loadMemoryService({
    invoke: async () => {
      throw new Error("Simulated provider outage");
    },
  });

  const pastMessages = buildPastMessages(35);
  const chat = {
    _id: "c1",
    summary: { text: "Old summary.", summarizedThroughMessageId: "m11", updatedAt: new Date() },
  };

  const messages = await memoryService.buildAgentMessages({ chat, pastMessages });

  assert.equal(chatUpdates.length, 0);
  assert.equal(messages[0]._getType(), "system");
  assert.match(messages[0].content, /Old summary\./);
  assert.equal(messages.length, 25, "system message + the 24 messages after the last summarized one");
});
