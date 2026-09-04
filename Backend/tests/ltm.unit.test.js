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

class SimpleFakeModel {
  constructor() {
    this.rows = [];
  }

  async create(doc) {
    const row = { _id: doc._id || `id_${this.rows.length + 1}`, ...doc };
    this.rows.push(row);
    return row;
  }

  async findOne(filter) {
    const [key, value] = Object.entries(filter)[0] || [];
    return this.rows.find((row) => String(row[key]) === String(value)) || null;
  }

  async findByIdAndUpdate(id, update) {
    const row = this.rows.find((r) => String(r._id) === String(id));
    if (row) Object.assign(row, update);
    return row || null;
  }

  find(filter) {
    const results = this.rows.filter((row) => String(row.chatId ?? row.createdby) === String(filter.chatId ?? filter.createdby));
    return { sort: () => results, then: (res, rej) => Promise.resolve(results).then(res, rej) };
  }
}

const loadLtmService = ({
  invoke,
  searchResults = [],
  listFactsResult = [],
  qdrantOverrides = {},
  ltmEnabled = true,
  userId = "u1",
}) => {
  delete require.cache[resolve("src/modules/memory/ltm.service.js")];

  const chatModel = new SimpleFakeModel();
  const messageModel = new SimpleFakeModel();
  const stateModel = new SimpleFakeModel();
  const userModel = new SimpleFakeModel();
  userModel.rows.push({ _id: userId, ltmEnabled });

  stubModule("src/modules/chat/chat.model.js", chatModel);
  stubModule("src/modules/message/message.model.js", messageModel);
  stubModule("src/modules/memory/userMemoryState.model.js", stateModel);
  stubModule("src/modules/user/user.model.js", userModel);
  stubModule("src/agents/modelConfig.js", { getAgentModel: () => ({ invoke }) });

  const upsertCalls = [];
  const deleteCalls = [];
  stubModule("src/modules/memory/memoryQdrant.service.js", {
    embed: async () => [1, 0, 0],
    upsertFact: async (userId, fact) => {
      upsertCalls.push({ userId, fact });
    },
    searchByVector: async () => searchResults,
    listFacts: async () => listFactsResult,
    deleteFacts: async (userId, ids) => {
      deleteCalls.push({ userId, ids });
    },
    isConfigured: () => false,
    ...qdrantOverrides,
  });

  const ltmService = require(resolve("src/modules/memory/ltm.service.js"));
  return { ltmService, chatModel, messageModel, stateModel, userModel, upsertCalls, deleteCalls };
};

test("FR-MEM-06: below the batch threshold, the counter increments but no extraction runs", async () => {
  let invokeCalls = 0;
  const { ltmService, stateModel } = loadLtmService({
    invoke: async () => {
      invokeCalls += 1;
      return { content: "should not run" };
    },
  });

  for (let i = 0; i < 19; i += 1) {
    await ltmService.recordAndMaybeExtract("u1");
  }

  assert.equal(invokeCalls, 0, "extraction must not run before the threshold");
  assert.equal(stateModel.rows[0].unprocessedCount, 19);
});

test("FR-MEM-06: crossing the batch threshold extracts facts from messages since the last run and resets the counter", async () => {
  const { ltmService, chatModel, messageModel, stateModel, upsertCalls } = loadLtmService({
    invoke: async () => ({ content: "Works at Acme Corp.\nPrefers Python." }),
  });

  chatModel.rows.push({ _id: "c1", createdby: "u1" });
  for (let i = 0; i < 20; i += 1) {
    messageModel.rows.push({
      _id: `m${i}`,
      chatId: "c1",
      role: "USER",
      content: `message ${i}`,
      createdAt: new Date(Date.now() + i * 1000),
    });
  }

  for (let i = 0; i < 20; i += 1) {
    await ltmService.recordAndMaybeExtract("u1");
  }

  assert.equal(stateModel.rows[0].unprocessedCount, 0, "counter resets after extraction");
  assert.ok(stateModel.rows[0].lastProcessedAt, "lastProcessedAt must advance");
  assert.equal(upsertCalls.length, 2, "both extracted facts should be saved (no matching duplicates)");
  assert.match(upsertCalls[0].fact.text, /Acme Corp/);
});

test("FR-MEM-06: a candidate fact that is too similar to an existing one is not saved again", async () => {
  const { ltmService, chatModel, messageModel, upsertCalls } = loadLtmService({
    invoke: async () => ({ content: "User's name is Nitish." }),
    searchResults: [{ id: "existing", text: "User's name is Nitish.", score: 0.98 }],
  });

  chatModel.rows.push({ _id: "c1", createdby: "u1" });
  for (let i = 0; i < 20; i += 1) {
    messageModel.rows.push({ _id: `m${i}`, chatId: "c1", role: "USER", content: `m${i}`, createdAt: new Date() });
  }

  for (let i = 0; i < 20; i += 1) {
    await ltmService.recordAndMaybeExtract("u1");
  }

  assert.equal(upsertCalls.length, 0, "a near-duplicate must be rejected, not stored again");
});

test("FR-MEM-06: a reply of NONE saves nothing", async () => {
  const { ltmService, chatModel, messageModel, upsertCalls } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
  });

  chatModel.rows.push({ _id: "c1", createdby: "u1" });
  for (let i = 0; i < 20; i += 1) {
    messageModel.rows.push({ _id: `m${i}`, chatId: "c1", role: "USER", content: `m${i}`, createdAt: new Date() });
  }

  for (let i = 0; i < 20; i += 1) {
    await ltmService.recordAndMaybeExtract("u1");
  }

  assert.equal(upsertCalls.length, 0);
});

test("FR-MEM-06: over the consolidation cap, facts are merged into a smaller set", async () => {
  const manyFacts = Array.from({ length: 41 }, (_, i) => ({ id: `f${i}`, text: `fact ${i}` }));

  const { ltmService, chatModel, messageModel, upsertCalls, deleteCalls } = loadLtmService({
    invoke: async (msgs) =>
      msgs[0].content.includes("too many stored facts")
        ? { content: "Consolidated fact A.\nConsolidated fact B." }
        : { content: "NONE" },
    listFactsResult: manyFacts,
  });

  chatModel.rows.push({ _id: "c1", createdby: "u1" });
  for (let i = 0; i < 20; i += 1) {
    messageModel.rows.push({ _id: `m${i}`, chatId: "c1", role: "USER", content: `m${i}`, createdAt: new Date() });
  }

  for (let i = 0; i < 20; i += 1) {
    await ltmService.recordAndMaybeExtract("u1");
  }

  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].ids.length, 41, "all old facts must be removed on consolidation");
  assert.equal(upsertCalls.length, 2, "the consolidated, denser set replaces them");
});

test("FR-MEM-06: retrieval returns relevant fact text and never throws on failure", async () => {
  const { ltmService } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    searchResults: [{ id: "f1", text: "Nitish teaches AI.", score: 0.9 }],
  });

  const facts = await ltmService.retrieveRelevantFacts("u1", "what do you know about me?");
  assert.deepEqual(facts, ["Nitish teaches AI."]);
});

test("FR-MEM-06: retrieval failure degrades to no personalization instead of blocking the send", async () => {
  const { ltmService } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    qdrantOverrides: {
      embed: async () => {
        throw new Error("embedding provider down");
      },
    },
  });

  const facts = await ltmService.retrieveRelevantFacts("u1", "hi");
  assert.deepEqual(facts, []);
});

test("FR-MEM-06: update and delete are scoped to facts the user actually owns", async () => {
  const { ltmService, upsertCalls, deleteCalls } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    listFactsResult: [{ id: "owned-1", text: "old text" }],
  });

  const updated = await ltmService.updateUserFact("u1", "owned-1", "new text");
  assert.deepEqual(updated, { id: "owned-1", text: "new text" });
  assert.equal(upsertCalls.length, 1);

  const notOwned = await ltmService.updateUserFact("u1", "not-owned", "x");
  assert.equal(notOwned, null);

  const deleted = await ltmService.deleteUserFact("u1", "owned-1");
  assert.equal(deleted, true);
  assert.equal(deleteCalls.length, 1);

  const deletedAgain = await ltmService.deleteUserFact("u1", "does-not-exist");
  assert.equal(deletedAgain, false);
});

test("FR-MEM-06g: LTM is opt-in - a user who has not enabled it gets no extraction and no retrieval", async () => {
  let invokeCalls = 0;
  const { ltmService, chatModel, messageModel, stateModel, upsertCalls } = loadLtmService({
    invoke: async () => {
      invokeCalls += 1;
      return { content: "Some fact." };
    },
    searchResults: [{ id: "f1", text: "Some fact.", score: 0.9 }],
    ltmEnabled: false,
  });

  chatModel.rows.push({ _id: "c1", createdby: "u1" });
  for (let i = 0; i < 25; i += 1) {
    messageModel.rows.push({ _id: `m${i}`, chatId: "c1", role: "USER", content: `m${i}`, createdAt: new Date() });
  }

  for (let i = 0; i < 25; i += 1) {
    await ltmService.recordAndMaybeExtract("u1");
  }

  assert.equal(invokeCalls, 0, "no extraction call when the user has not opted in");
  assert.equal(upsertCalls.length, 0);
  assert.equal(stateModel.rows.length, 0, "the counter is never even created for an opted-out user");

  const facts = await ltmService.retrieveRelevantFacts("u1", "anything");
  assert.deepEqual(facts, [], "no personalization is injected for an opted-out user, even with matching facts stored");
});

test("FR-MEM-06g: memory settings can be read and toggled", async () => {
  const { ltmService, userModel } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    ltmEnabled: false,
  });

  const before = await ltmService.getLtmSettings("u1");
  assert.deepEqual(before, { enabled: false });

  const updated = await ltmService.setLtmEnabled("u1", true);
  assert.deepEqual(updated, { enabled: true });
  assert.equal(userModel.rows[0].ltmEnabled, true);

  const after = await ltmService.getLtmSettings("u1");
  assert.deepEqual(after, { enabled: true });
});

test("FR-MEM-06g: a user with no memory settings row yet defaults to disabled", async () => {
  const { ltmService } = loadLtmService({ invoke: async () => ({ content: "NONE" }), userId: "someone-else" });

  const settings = await ltmService.getLtmSettings("brand-new-user");
  assert.deepEqual(settings, { enabled: false });
});

test("FR-MEM-06h: a user can add a fact themselves, once opted in", async () => {
  const { ltmService, upsertCalls } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    ltmEnabled: true,
  });

  const result = await ltmService.addUserFact("u1", "I work at Acme Corp.");

  assert.equal(result.created, true);
  assert.equal(result.fact.text, "I work at Acme Corp.");
  assert.equal(upsertCalls.length, 1);
});

test("FR-MEM-06h: adding a fact is refused while memory is off", async () => {
  const { ltmService, upsertCalls } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    ltmEnabled: false,
  });

  const result = await ltmService.addUserFact("u1", "I work at Acme Corp.");

  assert.deepEqual(result, { created: false, reason: "disabled" });
  assert.equal(upsertCalls.length, 0);
});

test("FR-MEM-06h: adding a near-duplicate fact reports the existing one instead of creating a copy", async () => {
  const { ltmService, upsertCalls } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    ltmEnabled: true,
    searchResults: [{ id: "existing-1", text: "Works at Acme Corp.", score: 0.97 }],
  });

  const result = await ltmService.addUserFact("u1", "I work at Acme Corp.");

  assert.equal(result.created, false);
  assert.equal(result.reason, "duplicate");
  assert.equal(result.existing.id, "existing-1");
  assert.equal(upsertCalls.length, 0);
});

test("FR-MEM-06h: adding empty text is rejected without hitting the store", async () => {
  const { ltmService, upsertCalls } = loadLtmService({
    invoke: async () => ({ content: "NONE" }),
    ltmEnabled: true,
  });

  const result = await ltmService.addUserFact("u1", "   ");

  assert.deepEqual(result, { created: false, reason: "empty" });
  assert.equal(upsertCalls.length, 0);
});
