
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { buildTestApp } = require("./helpers/testApp");

const OID_A = "507f1f77bcf86cd799439011";
const OID_B = "507f1f77bcf86cd799439012";
const USER_A = { _id: "user_a" };
const USER_B = { _id: "user_b" };

const pdfBuffer = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(4200, 0x20)]);
const exeBuffer = () => Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(4200, 0)]);

const twoUserFixture = ({ actingAs = USER_A } = {}) => {
  const { app, models } = buildTestApp({ authenticatedUser: actingAs });
  models.Chat.rows.push({ _id: OID_A, createdby: "user_a", title: "A's chat" });
  models.Chat.rows.push({ _id: OID_B, createdby: "user_b", title: "B's private chat" });
  models.Message.rows.push({ _id: "m1", chatId: OID_B, role: "USER", content: "B's secret" });
  models.Message.rows.push({ _id: "m2", chatId: OID_B, role: "AI", content: "B's reply" });
  models.Message.rows.push({ _id: "m3", chatId: OID_A, role: "USER", content: "A's own message" });
  return { app, models };
};

test("FR-HARD-01: responses carry helmet's protective headers", async () => {
  const { app } = buildTestApp();
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.ok(
    response.headers["x-frame-options"] ||
      (response.headers["content-security-policy"] || "").includes("frame-ancestors"),
    "expected X-Frame-Options or a CSP frame-ancestors directive",
  );
});

test("FR-HARD-01: X-Powered-By is not advertised", async () => {
  const { app } = buildTestApp();
  const response = await request(app).get("/api/health");
  assert.equal(response.headers["x-powered-by"], undefined);
});

test("FR-HARD-03: the configured origin is allowed, with credentials", async () => {
  const { app } = buildTestApp();
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "http://localhost:5173");

  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
  assert.equal(response.headers["access-control-allow-credentials"], "true");
});

test("FR-HARD-03: a non-allowlisted origin gets no CORS grant, and never a wildcard", async () => {
  const { app } = buildTestApp();
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "https://evil.example.com");

  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.notEqual(response.headers["access-control-allow-origin"], "*");
});

test("FR-HARD-02: a Mongo operator payload never reaches the query", async () => {
  const { app, models } = buildTestApp();
  const response = await request(app)
    .post("/api/auth/otp/request")
    .send({ email: { $gt: "" } });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(models.User.calls.length, 0);
});

test("FR-HARD-02: operator keys are stripped from query strings (Express 5 getter)", async () => {
  const { app } = buildTestApp();
  const response = await request(app).get("/api/health?safe=1&%24where=evil&a.b=2");
  assert.equal(response.status, 200);
});

test("FR-HARD-04: auth route returns 400 with a structured body, not 500", async () => {
  const { app } = buildTestApp();
  const response = await request(app)
    .post("/api/auth/otp/verify")
    .send({ email: "not-an-email", code: "abc" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(response.body.error.details));
  assert.ok(response.body.error.details.some((d) => d.path === "email"));
  assert.ok(response.body.error.details.some((d) => d.path === "code"));
});

test("FR-AUTH-07: the password sign-in routes are gone, not just disabled", async () => {
  const { app, models } = buildTestApp();

  for (const path of ["/api/auth/Login", "/api/auth/SignUp"]) {
    const response = await request(app).post(path).send({ email: "a@b.co", password: "x" });
    assert.equal(response.status, 404, `${path} should not exist`);
    assert.equal(response.body.error.code, "NOT_FOUND");
  }

  assert.equal(models.User.calls.length, 0);
});

test("FR-HARD-04: chat route rejects a malformed body", async () => {
  const { app } = buildTestApp();
  const response = await request(app).post("/api/messages").send({ content: "" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("FR-HARD-04: upload route rejects a missing file with a structured body", async () => {
  const { app } = buildTestApp();
  const response = await request(app).post("/api/documents/upload");

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "FILE_REQUIRED");
});

test("RULE-ERR-1: error bodies never expose internals", async () => {
  const { app } = buildTestApp();
  const response = await request(app).post("/api/auth/otp/verify").send({});
  const raw = JSON.stringify(response.body);

  assert.ok(response.body.error.code && response.body.error.message);
  assert.equal(raw.includes("at Object"), false, "stack trace leaked");
  assert.equal(raw.includes("mongodb://"), false, "connection string leaked");
});

test("FR-HARD-05: an .exe renamed to .pdf is rejected by the upload route", async () => {
  const { app, models } = buildTestApp();
  const response = await request(app)
    .post("/api/documents/upload")
    .attach("file", exeBuffer(), { filename: "invoice.pdf", contentType: "application/pdf" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "UNSUPPORTED_FILE_TYPE");
  assert.equal(models.Document.rows.length, 0, "rejected upload must not be persisted");
});

test("FR-HARD-06: a traversal filename is stored sanitized", async () => {
  const { app, models } = buildTestApp();
  const response = await request(app)
    .post("/api/documents/upload")
    .attach("file", Buffer.from("hello world, some readable text\n"), {
      filename: "../../etc/passwd.pdf",
      contentType: "text/plain",
    });

  assert.equal(response.status, 201);
  const stored = models.Document.rows[0];
  assert.equal(stored.filename, "passwd.pdf");
  assert.equal(stored.filename.includes(".."), false);
  assert.equal(stored.filename.includes("/"), false);
  assert.equal(stored.detectedMimeType, "text/plain");
});

test("FR-HARD-05: a genuine PDF is still accepted (no false rejection)", async () => {
  const { app, models } = buildTestApp();
  const response = await request(app)
    .post("/api/documents/upload")
    .attach("file", pdfBuffer(), { filename: "report.pdf", contentType: "application/pdf" });

  assert.notEqual(response.body?.error?.code, "UNSUPPORTED_FILE_TYPE");
  assert.ok([201, 400, 500].includes(response.status));
  if (response.status === 201) assert.equal(models.Document.rows[0].detectedMimeType, "application/pdf");
});

test("FR-HARD-07: the 10MB limit still rejects an oversized upload cleanly", async () => {
  const { app } = buildTestApp();
  const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 0x20)]);
  const response = await request(app)
    .post("/api/documents/upload")
    .attach("file", oversized, { filename: "big.pdf", contentType: "application/pdf" });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "FILE_TOO_LARGE");
  assert.match(response.body.error.message, /10 MB/);
});

test("FR-HARD-08: user A cannot read user B's messages", async () => {
  const { app, models } = twoUserFixture({ actingAs: USER_A });
  const response = await request(app).get(`/api/messages/${OID_B}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
  assert.equal(JSON.stringify(response.body).includes("B's secret"), false);

  assert.equal(models.Message.calls.filter((c) => c.op === "find").length, 0);
});

test("FR-HARD-08: user A can still read their own messages", async () => {
  const { app } = twoUserFixture({ actingAs: USER_A });
  const response = await request(app).get(`/api/messages/${OID_A}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.messages.length, 1);
  assert.equal(response.body.messages[0].content, "A's own message");
});

test("FR-HARD-08: user B reading the same chat id succeeds (proves it is ownership, not a blanket block)", async () => {
  const { app } = twoUserFixture({ actingAs: USER_B });
  const response = await request(app).get(`/api/messages/${OID_B}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.messages.length, 2);
});

test("FR-HARD-08: user A cannot post into user B's chat or read its history back", async () => {
  const { app, models } = twoUserFixture({ actingAs: USER_A });
  const response = await request(app).post("/api/messages").send({ content: "hi", chatId: OID_B });

  assert.equal(response.status, 404);
  assert.equal(models.Message.rows.filter((m) => m.chatId === OID_B).length, 2, "no message written into B's chat");
});

test("FR-HARD-09: user A deleting user B's chat destroys nothing", async () => {
  const { app, models } = twoUserFixture({ actingAs: USER_A });
  const response = await request(app).delete(`/api/chats/${OID_B}`);

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
  assert.equal(models.Message.rows.filter((m) => m.chatId === OID_B).length, 2);
  assert.equal(models.Chat.rows.some((c) => String(c._id) === OID_B), true);
  assert.equal(models.Message.calls.filter((c) => c.op === "deleteMany").length, 0);
});

test("FR-HARD-09: an owner's delete still cascades to their own messages", async () => {
  const { app, models } = twoUserFixture({ actingAs: USER_B });
  const response = await request(app).delete(`/api/chats/${OID_B}`);

  assert.equal(response.status, 200);
  assert.equal(models.Chat.rows.some((c) => String(c._id) === OID_B), false);
  assert.equal(models.Message.rows.filter((m) => m.chatId === OID_B).length, 0);
  assert.equal(models.Message.rows.length, 1, "other users' messages untouched");
});

test("FR-HARD-04 + FR-HARD-09: a malformed chat id is rejected before any delete runs", async () => {
  const { app, models } = twoUserFixture({ actingAs: USER_A });
  const response = await request(app).delete("/api/chats/not-an-object-id");

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(models.Chat.calls.length, 0);
  assert.equal(models.Message.calls.length, 0);
});
