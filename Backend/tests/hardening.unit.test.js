
const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeValue } = require("../src/shared/middleware/sanitize.middleware");
const {
  sanitizeFilename,
  detectAcceptedType,
  looksLikePlainText,
} = require("../src/modules/document/fileTypeGuard.middleware");
const schemas = {
  ...require("../src/modules/auth/auth.schema"),
  ...require("../src/modules/message/message.schema"),
};

const BACKSLASH = String.fromCharCode(92);
const pdfBuffer = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(4200, 0x20)]);
const exeBuffer = () => Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(4200, 0)]);

test("FR-HARD-02: strips Mongo operator keys from a request body", () => {
  const { value, removed } = sanitizeValue({ email: { $gt: "" }, password: "x" });
  assert.deepEqual(value, { email: {}, password: "x" });
  assert.deepEqual(removed, ["email.$gt"]);
});

test("FR-HARD-02: strips dotted keys at any depth", () => {
  const { value } = sanitizeValue({ a: { b: { "x.y": 1, ok: 2 } } });
  assert.deepEqual(value, { a: { b: { ok: 2 } } });
});

test("FR-HARD-02: strips operators nested inside arrays", () => {
  const { value } = sanitizeValue({ list: [{ $ne: null }, { keep: 1 }] });
  assert.deepEqual(value, { list: [{}, { keep: 1 }] });
});

test("FR-HARD-02: strips prototype-pollution keys", () => {
  const { value } = sanitizeValue(JSON.parse('{"__proto__":{"admin":true},"ok":1}'));
  assert.deepEqual(Object.keys(value), ["ok"]);
  assert.equal({}.admin, undefined);
});

test("FR-HARD-02: leaves legitimate payloads untouched", () => {
  const input = { fullname: "Ada Lovelace", email: "ada@example.com", nested: { n: 1 } };
  const { value, removed } = sanitizeValue(input);
  assert.deepEqual(value, input);
  assert.deepEqual(removed, []);
});

test("FR-HARD-02: bounded recursion depth does not throw on deep input", () => {
  let deep = { $bad: 1 };
  for (let i = 0; i < 500; i += 1) deep = { nest: deep };
  assert.doesNotThrow(() => sanitizeValue(deep));
});

test("FR-HARD-04: otp request rejects a missing email", () => {
  const result = schemas.otpRequestSchema.safeParse({});
  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues.map((i) => i.path[0]), ["email"]);
});

test("FR-HARD-04: otp request rejects a non-string email (operator-injection shape)", () => {
  assert.equal(schemas.otpRequestSchema.safeParse({ email: { $gt: "" } }).success, false);
  assert.equal(schemas.otpRequestSchema.safeParse({ email: {} }).success, false);
});

test("FR-HARD-04: otp request normalises email case and trims whitespace", () => {
  const result = schemas.otpRequestSchema.safeParse({ email: " ADA@Example.COM " });
  assert.equal(result.success, true);
  assert.equal(result.data.email, "ada@example.com");
});

test("FR-HARD-04: otp verify demands exactly six digits", () => {
  const ok = (code) => schemas.otpVerifySchema.safeParse({ email: "a@b.co", code }).success;
  assert.equal(ok("123456"), true);
  assert.equal(ok("004821"), true, "leading zeros must survive");
  assert.equal(ok("12345"), false, "too short");
  assert.equal(ok("1234567"), false, "too long");
  assert.equal(ok("12a456"), false, "not all digits");
  assert.equal(schemas.otpVerifySchema.safeParse({ email: "a@b.co", code: 123456 }).success,
    false, "a number is rejected - 004821 must not become 4821");
});

test("FR-HARD-04: message content cannot be blank or whitespace-only", () => {
  assert.equal(schemas.sendMessageSchema.safeParse({ content: "   " }).success, false);
  assert.equal(schemas.sendMessageSchema.safeParse({ content: "hi" }).success, true);
});

test("FR-HARD-04: a non-ObjectId chatId is rejected before it can reach Mongo", () => {
  assert.equal(schemas.chatIdParamSchema.safeParse({ chatId: "../../etc" }).success, false);
  assert.equal(
    schemas.chatIdParamSchema.safeParse({ chatId: "507f1f77bcf86cd799439011" }).success,
    true,
  );
});

test("FR-HARD-05: a real PDF is accepted", async () => {
  assert.equal(await detectAcceptedType(pdfBuffer()), "application/pdf");
});

test("FR-HARD-05: an .exe renamed to .pdf is rejected on its bytes", async () => {
  await assert.rejects(() => detectAcceptedType(exeBuffer()), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.code, "UNSUPPORTED_FILE_TYPE");
    return true;
  });
});

test("FR-HARD-05: other real formats (png, zip) are rejected", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0)]);
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0)]);
  await assert.rejects(() => detectAcceptedType(png));
  await assert.rejects(() => detectAcceptedType(zip));
});

test("FR-HARD-05: plain text is accepted even though it has no magic bytes", async () => {
  assert.equal(await detectAcceptedType(Buffer.from("Plain notes.\nLine two.\n")), "text/plain");
  assert.equal(await detectAcceptedType(Buffer.from("café — 日本語\n")), "text/plain");
});

test("FR-HARD-05: undetectable binary is rejected rather than assumed to be text", async () => {
  await assert.rejects(() => detectAcceptedType(Buffer.from([0x01, 0x02, 0x00, 0x03, 0xff, 0xfe])));
  await assert.rejects(() => detectAcceptedType(Buffer.alloc(0)));
});

test("FR-HARD-05: text detection rejects NUL bytes and invalid UTF-8", () => {
  assert.equal(looksLikePlainText(Buffer.from("ok text")), true);
  assert.equal(looksLikePlainText(Buffer.from([0x68, 0x00, 0x69])), false);
  assert.equal(looksLikePlainText(Buffer.from([0xff, 0xfe, 0xfd])), false);
});

test("FR-HARD-06: unix path traversal is stripped to a bare basename", () => {
  assert.equal(sanitizeFilename("../../etc/passwd.pdf"), "passwd.pdf");
  assert.equal(sanitizeFilename("/absolute/path/report.pdf"), "report.pdf");
});

test("FR-HARD-06: windows path separators are stripped too", () => {
  const name = ["..", "..", "windows", "system32", "cfg.txt"].join(BACKSLASH);
  assert.equal(sanitizeFilename(name), "cfg.txt");
});

test("FR-HARD-06: no dot-dot sequence survives sanitization", () => {
  for (const raw of ["../../etc/passwd.pdf", "..", "...", "a..b.pdf", "....//x.pdf"]) {
    assert.equal(sanitizeFilename(raw).includes(".."), false, `"${raw}" still contains ..`);
  }
});

test("FR-HARD-06: special characters are neutralised and length is bounded", () => {
  assert.equal(sanitizeFilename("my<script>.pdf"), "my_script_.pdf");
  assert.equal(sanitizeFilename(`${"a".repeat(300)}.pdf`).length, 200);
  assert.equal(sanitizeFilename(""), "upload");
  assert.equal(sanitizeFilename("   "), "upload");
  assert.equal(sanitizeFilename(null), "upload");
});

test("FR-HARD-06: ordinary filenames are left readable", () => {
  assert.equal(sanitizeFilename("Quarterly Report 2026.pdf"), "Quarterly Report 2026.pdf");
});
