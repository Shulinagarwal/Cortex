const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { buildTestApp } = require("./helpers/testApp");

const USER_A = { _id: "user_a" };

test("FR-MEM-01/02/03: a long chat triggers compression over real HTTP, and the graph receives a bounded, summary-prefixed input", async () => {
  let capturedInput = null;
  const capturingGraph = {
    streamEvents: async function* (input) {
      capturedInput = input;
      yield { event: "on_chat_model_stream", data: { chunk: { content: "ok" } } };
    },
  };

  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: capturingGraph,
  });

  const chatId = "507f1f77bcf86cd799439011";
  models.Chat.rows.push({ _id: chatId, createdby: "user_a", title: "Long Chat" });

  for (let i = 0; i < 20; i += 1) {
    models.Message.rows.push({
      _id: `seed_${i}`,
      chatId,
      role: i % 2 === 0 ? "USER" : "AI",
      content: `seed message ${i}`,
      createdAt: new Date(Date.now() + i * 1000),
    });
  }

  await request(app).post("/api/messages").send({ content: "one more to tip it over", chatId });

  const chatRow = models.Chat.rows.find((row) => String(row._id) === chatId);

  assert.ok(chatRow.summary?.text, "the chat must end up with a persisted summary");
  assert.ok(capturedInput, "the graph must have been invoked");
  assert.equal(
    capturedInput.messages.length,
    11,
    "1 summary system message + the 10 most recent kept verbatim",
  );
  assert.equal(capturedInput.messages[0]._getType(), "system");
});

test("FR-MEM-01: a short chat is unaffected — full history, no summary", async () => {
  let capturedInput = null;
  const capturingGraph = {
    streamEvents: async function* (input) {
      capturedInput = input;
      yield { event: "on_chat_model_stream", data: { chunk: { content: "ok" } } };
    },
  };

  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: capturingGraph,
  });

  await request(app).post("/api/messages").send({ content: "hello" });

  assert.equal(capturedInput.messages.length, 1);
  assert.equal(capturedInput.messages[0]._getType(), "human");
  assert.equal(models.Chat.rows[0].summary, undefined);
});
