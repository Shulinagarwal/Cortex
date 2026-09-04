const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { buildTestApp } = require("./helpers/testApp");

const USER_A = { _id: "user_a" };
const FACT_ID = "11111111-1111-4111-8111-111111111111";

test("FR-MEM-06: relevant facts are injected as a system message ahead of the reply, when the user has opted in", async () => {
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
    memoryQdrant: {
      searchByVector: async () => [{ id: "f1", text: "User's name is Nitish.", score: 0.9 }],
    },
  });
  models.User.rows.push({ _id: "user_a", ltmEnabled: true });

  await request(app).post("/api/messages").send({ content: "hi again" });

  assert.ok(capturedInput, "the graph must have been invoked");
  assert.equal(capturedInput.messages[0]._getType(), "system");
  assert.match(capturedInput.messages[0].content, /User's name is Nitish\./);
});

test("FR-MEM-06g: a user who has not opted in gets no personalization, even with matching facts stored", async () => {
  let capturedInput = null;
  const capturingGraph = {
    streamEvents: async function* (input) {
      capturedInput = input;
      yield { event: "on_chat_model_stream", data: { chunk: { content: "ok" } } };
    },
  };

  const { app } = buildTestApp({
    authenticatedUser: USER_A,
    cortexAgentApp: capturingGraph,
    memoryQdrant: {
      searchByVector: async () => [{ id: "f1", text: "User's name is Nitish.", score: 0.9 }],
    },
  });
  // No User row seeded - matches a real user who has never opted in.

  await request(app).post("/api/messages").send({ content: "hi again" });

  assert.ok(capturedInput, "the graph must still have been invoked");
  assert.equal(capturedInput.messages[0]._getType(), "human", "no facts system message when opted out");
});

test("GET/PUT /api/memory/settings reads and toggles the opt-in flag", async () => {
  const { app, models } = buildTestApp({ authenticatedUser: USER_A });
  models.User.rows.push({ _id: "user_a", ltmEnabled: false });

  const initial = await request(app).get("/api/memory/settings");
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body, { enabled: false });

  const enable = await request(app).put("/api/memory/settings").send({ enabled: true });
  assert.equal(enable.status, 200);
  assert.deepEqual(enable.body, { enabled: true });
  assert.equal(models.User.rows[0].ltmEnabled, true);

  const after = await request(app).get("/api/memory/settings");
  assert.deepEqual(after.body, { enabled: true });

  const bad = await request(app).put("/api/memory/settings").send({ enabled: "yes" });
  assert.equal(bad.status, 400);
});

test("GET /api/memory lists the user's stored facts", async () => {
  const { app } = buildTestApp({
    authenticatedUser: USER_A,
    memoryQdrant: {
      listFacts: async () => [{ id: FACT_ID, text: "Works at Acme Corp." }],
    },
  });

  const response = await request(app).get("/api/memory");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.facts, [{ id: FACT_ID, text: "Works at Acme Corp." }]);
});

test("PUT /api/memory/:id updates an owned fact, 404s for one that isn't", async () => {
  const upserts = [];
  const { app } = buildTestApp({
    authenticatedUser: USER_A,
    memoryQdrant: {
      listFacts: async () => [{ id: FACT_ID, text: "old text" }],
      upsertFact: async (userId, fact) => upserts.push({ userId, fact }),
    },
  });

  const ok = await request(app).put(`/api/memory/${FACT_ID}`).send({ text: "new text" });
  assert.equal(ok.status, 200);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].fact.text, "new text");

  const missing = await request(app)
    .put("/api/memory/22222222-2222-4222-8222-222222222222")
    .send({ text: "x" });
  assert.equal(missing.status, 404);
});

test("DELETE /api/memory/:id removes an owned fact, 404s for one that isn't", async () => {
  const deletes = [];
  const { app } = buildTestApp({
    authenticatedUser: USER_A,
    memoryQdrant: {
      listFacts: async () => [{ id: FACT_ID, text: "old text" }],
      deleteFacts: async (userId, ids) => deletes.push({ userId, ids }),
    },
  });

  const ok = await request(app).delete(`/api/memory/${FACT_ID}`);
  assert.equal(ok.status, 200);
  assert.equal(deletes.length, 1);

  const missing = await request(app).delete("/api/memory/22222222-2222-4222-8222-222222222222");
  assert.equal(missing.status, 404);
});

test("POST /api/memory adds a fact the user typed themselves, once memory is on", async () => {
  const upserts = [];
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    memoryQdrant: { upsertFact: async (userId, fact) => upserts.push({ userId, fact }) },
  });
  models.User.rows.push({ _id: "user_a", ltmEnabled: true });

  const response = await request(app).post("/api/memory").send({ text: "I work at Acme Corp." });

  assert.equal(response.status, 201);
  assert.equal(response.body.created, true);
  assert.equal(response.body.fact.text, "I work at Acme Corp.");
  assert.equal(upserts.length, 1);
});

test("POST /api/memory is refused while memory is off", async () => {
  const { app, models } = buildTestApp({ authenticatedUser: USER_A });
  models.User.rows.push({ _id: "user_a", ltmEnabled: false });

  const response = await request(app).post("/api/memory").send({ text: "I work at Acme Corp." });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "LTM_DISABLED");
});

test("POST /api/memory reports a near-duplicate instead of creating a copy", async () => {
  const { app, models } = buildTestApp({
    authenticatedUser: USER_A,
    memoryQdrant: {
      searchByVector: async () => [{ id: "existing-1", text: "Works at Acme Corp.", score: 0.97 }],
    },
  });
  models.User.rows.push({ _id: "user_a", ltmEnabled: true });

  const response = await request(app).post("/api/memory").send({ text: "I work at Acme Corp." });

  assert.equal(response.status, 200);
  assert.equal(response.body.created, false);
  assert.equal(response.body.reason, "duplicate");
  assert.equal(response.body.existing.id, "existing-1");
});

test("POST /api/memory rejects empty text", async () => {
  const { app, models } = buildTestApp({ authenticatedUser: USER_A });
  models.User.rows.push({ _id: "user_a", ltmEnabled: true });

  const response = await request(app).post("/api/memory").send({ text: "" });
  assert.equal(response.status, 400);
});

test("PUT /api/memory/:id rejects a non-UUID id and empty text", async () => {
  const { app } = buildTestApp({ authenticatedUser: USER_A });

  const badId = await request(app).put("/api/memory/not-a-uuid").send({ text: "x" });
  assert.equal(badId.status, 400);

  const badBody = await request(app).put(`/api/memory/${FACT_ID}`).send({ text: "" });
  assert.equal(badBody.status, 400);
});
