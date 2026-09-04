
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { buildTestApp } = require("./helpers/testApp");

const USER_A = { _id: "user_a" };

const immediateFailureGraph = {
  streamEvents: async function* () {
    throw new Error("Simulated provider outage");
  },
};

const partialThenFailureGraph = {
  streamEvents: async function* () {
    yield { event: "on_chat_model_stream", data: { chunk: { content: "The answer starts" } } };
    yield { event: "on_chat_model_stream", data: { chunk: { content: " here and continues." } } };
    throw new Error("Simulated provider outage mid-stream");
  },
};

const outOfCreditsGraph = {
  streamEvents: async function* () {
    const error = new Error(
      "This request requires more credits, or fewer max_tokens. You requested up to 2048 " +
        "tokens, but can only afford 497.",
    );
    error.statusCode = 402;
    error.metadata = { limit_source: "openrouter_credits" };
    throw error;
  },
};

test("a generation failure with NO partial output still saves a real AI reply", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: immediateFailureGraph,
  });

  await request(app)
    .post("/api/messages")
    .send({ content: "What is the question of the day of leetcode today?" });

  const saved = models.Message.rows;
  const userRow = saved.find((row) => row.role === "USER");
  const aiRow = saved.find((row) => row.role === "AI");

  assert.ok(userRow, "the user's question must still be saved");
  assert.ok(aiRow, "an AI row MUST exist - this is the bug: it used to be absent entirely");
  assert.ok(aiRow.content.trim().length > 0, "the saved reply must not be an empty string");
  assert.match(aiRow.content, /went wrong|try again/i);
});

test("an out-of-credits failure saves a specific, actionable message - not the generic apology", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: outOfCreditsGraph,
  });

  await request(app)
    .post("/api/messages")
    .send({ content: "Summarize this PDF" });

  const aiRow = models.Message.rows.find((row) => row.role === "AI");

  assert.ok(aiRow, "an AI row must exist even for a billing failure");
  assert.match(aiRow.content, /out of credits/i, "must name the actual cause");
  assert.match(aiRow.content, /openrouter\.ai\/settings\/credits/, "must include the fix, not just the symptom");
  assert.doesNotMatch(
    aiRow.content,
    /try asking again/i,
    "must not tell the user to retry - a retry fails identically until credits are added",
  );
});

test("a failure on a brand-new chat reports that chat's id in the stream, not just a bare error", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: immediateFailureGraph,
  });

  const response = await request(app)
    .post("/api/messages")
    .send({ content: "Summarize this PDF" });

  const dataLine = response.text.split("\n\n").find((line) => line.startsWith("data:"));
  const payload = JSON.parse(dataLine.slice("data:".length));

  assert.ok(payload.error, "must still signal the failure");
  assert.ok(payload.newChat?._id, "must report the chat the failure was saved into");
  assert.equal(
    String(payload.newChat._id),
    String(models.Chat.rows[0]._id),
    "the reported chat must be the one that actually got created",
  );
});

test("a failure partway through streaming keeps the partial text, not just the apology", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: partialThenFailureGraph,
  });

  await request(app)
    .post("/api/messages")
    .send({ content: "Explain how the retry works" });

  const aiRow = models.Message.rows.find((row) => row.role === "AI");

  assert.ok(aiRow, "an AI row must exist even when the failure happens mid-stream");
  assert.match(
    aiRow.content,
    /The answer starts here and continues\./,
    "the partial content that DID stream must be preserved, not discarded",
  );
  assert.match(aiRow.content, /went wrong|try again/i, "and the failure must still be disclosed");
});

test("reopening the chat after a failure shows a real reply, not a silent gap", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: immediateFailureGraph,
  });

  const chatId = "507f1f77bcf86cd799439099";
  models.Chat.rows.push({ _id: chatId, createdby: "user_a", title: "New Chat" });

  await request(app)
    .post("/api/messages")
    .send({ content: "Will this ever get answered?", chatId });

  const response = await request(app).get(`/api/messages/${chatId}`);

  assert.equal(response.status, 200);
  const roles = response.body.messages.map((m) => m.role);
  assert.deepEqual(
    roles,
    ["USER", "AI"],
    "re-fetching the chat (what a page reload does) must show a real USER+AI pair, " +
      "never a USER message with nothing after it",
  );
});
