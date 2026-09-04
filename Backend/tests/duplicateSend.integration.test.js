const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { buildTestApp } = require("./helpers/testApp");

const USER_A = { _id: "user_a" };
const KEY = "11111111-2222-4333-8444-555555555555";

const replyingGraph = {
  streamEvents: async function* () {
    yield { event: "on_chat_model_stream", data: { chunk: { content: "Here is the answer." } } };
  },
};

test("a retried send with the same idempotency key does not duplicate the user message", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: replyingGraph,
  });

  const payload = { content: "Summarize the document", idempotencyKey: KEY };

  await request(app).post("/api/messages").send(payload);
  await request(app).post("/api/messages").send(payload);
  await request(app).post("/api/messages").send(payload);

  const userMessages = models.Message.rows.filter((row) => row.role === "USER");

  assert.equal(
    userMessages.length,
    1,
    "three submissions of the SAME logical send must produce exactly one user message - " +
      "this is the tab-refocus duplicate bug",
  );
});

test("a retried send does not create a second chat either", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: replyingGraph,
  });

  const payload = { content: "Summarize the document", idempotencyKey: KEY };

  await request(app).post("/api/messages").send(payload);
  await request(app).post("/api/messages").send(payload);

  assert.equal(models.Chat.rows.length, 1, "the repeat must not spawn a second empty chat");
});

test("a retried send returns the reply that already exists, not an error", async () => {
  const { app } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: replyingGraph,
  });

  const payload = { content: "Summarize the document", idempotencyKey: KEY };

  await request(app).post("/api/messages").send(payload);
  const repeat = await request(app).post("/api/messages").send(payload);

  const dataLine = repeat.text.split("\n\n").find((line) => line.startsWith("data:"));
  const parsed = JSON.parse(dataLine.slice("data:".length));

  assert.equal(parsed.done, true);
  assert.equal(parsed.duplicate, true);
  assert.ok(parsed.aiMessage, "must hand back the answer that was already generated");
  assert.match(parsed.aiMessage.content, /Here is the answer\./);
});

test("genuinely sending the same text twice still works when the keys differ", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: replyingGraph,
  });

  await request(app)
    .post("/api/messages")
    .send({ content: "ok", idempotencyKey: "aaaaaaaa-1111-4111-8111-111111111111" });

  await request(app)
    .post("/api/messages")
    .send({ content: "ok", idempotencyKey: "bbbbbbbb-2222-4222-8222-222222222222" });

  const userMessages = models.Message.rows.filter((row) => row.role === "USER");

  assert.equal(
    userMessages.length,
    2,
    "deduping must key off the send attempt, not the text - repeating yourself is allowed",
  );
});

test("a send with no idempotency key at all still works (older clients)", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: replyingGraph,
  });

  await request(app).post("/api/messages").send({ content: "no key here" });

  const userMessages = models.Message.rows.filter((row) => row.role === "USER");
  assert.equal(userMessages.length, 1);
});
