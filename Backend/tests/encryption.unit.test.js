const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("base64");

const { encrypt, decrypt } = require("../src/modules/connectors/encryption.util");

test("encrypt/decrypt round-trips a plaintext token exactly", () => {
  const plaintext = "ghp_someRealisticLookingGitHubToken1234567890";
  const encrypted = encrypt(plaintext);
  assert.equal(decrypt(encrypted), plaintext);
});

test("encrypted output never contains the plaintext", () => {
  const plaintext = "super-secret-token-value";
  const encrypted = encrypt(plaintext);
  assert.doesNotMatch(encrypted, /super-secret-token-value/);
});

test("two encryptions of the same plaintext produce different ciphertext (random IV)", () => {
  const a = encrypt("same-value");
  const b = encrypt("same-value");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), "same-value");
  assert.equal(decrypt(b), "same-value");
});

test("tampering with the ciphertext is detected, not silently decrypted wrong", () => {
  const encrypted = encrypt("original-value");
  const [iv, authTag, ciphertext] = encrypted.split(".");
  const tampered = [iv, authTag, ciphertext.slice(0, -4) + "abcd"].join(".");

  assert.throws(() => decrypt(tampered));
});

test("a malformed encrypted value throws instead of returning garbage", () => {
  assert.throws(() => decrypt("not-a-valid-encrypted-string"));
});
