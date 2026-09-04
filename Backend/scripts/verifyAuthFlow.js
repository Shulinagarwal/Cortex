require("dotenv").config();

const mongoose = require("mongoose");
const UserModel = require("../src/modules/user/user.model");
const RefreshToken = require("../src/modules/auth/refreshToken.model");
const OtpRequest = require("../src/modules/auth/otpRequest.model");
const otp = require("../src/modules/auth/otp.service");
const tokens = require("../src/modules/auth/token.service");
const { incrementCounter, getRedis } = require("../src/shared/config/redis");

const line = (s) => console.log("\n=== " + s + " ===");
const ok = (label, pass, extra = "") =>
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);

const EMAIL = `svc1.selftest.${Date.now()}@example.com`;

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const user = await UserModel.create({ fullname: "SVC1 Selftest", email: EMAIL, authProvider: "google" });

  line("FR-AUTH-08/09  OTP lifecycle");
  const { code } = await otp.createOtpForEmail(EMAIL);
  ok("code is 6 digits", /^[0-9]{6}$/.test(code));

  const stored = await OtpRequest.findOne({ email: EMAIL }).sort({ createdAt: -1 });
  ok("raw code is NOT stored", stored.codeHash !== code, `stored=${stored.codeHash.slice(0, 12)}...`);

  const wrong = await otp.verifyOtp(EMAIL, "000000");
  ok("wrong code rejected", wrong.status === "wrong", `attemptsLeft=${wrong.attemptsRemaining}`);

  const good = await otp.verifyOtp(EMAIL, code);
  ok("correct code accepted", good.status === "ok");

  const replay = await otp.verifyOtp(EMAIL, code);
  ok("FR-AUTH-09 single use: replay rejected", replay.status === "no_code", `status=${replay.status}`);

  const { code: code2 } = await otp.createOtpForEmail(EMAIL);
  let last;
  for (let i = 0; i < 5; i += 1) last = await otp.verifyOtp(EMAIL, "111111");
  ok("FR-AUTH-09 attempt cap locks the code", last.status === "locked", `after 5 wrong -> ${last.status}`);
  const afterLock = await otp.verifyOtp(EMAIL, code2);
  ok("correct code fails after lockout", afterLock.status === "no_code", `status=${afterLock.status}`);

  const { code: codeA } = await otp.createOtpForEmail(EMAIL);
  await otp.createOtpForEmail(EMAIL);
  const oldCode = await otp.verifyOtp(EMAIL, codeA);
  ok("requesting a new code invalidates the old one", oldCode.status !== "ok", `status=${oldCode.status}`);

  line("FR-AUTH-02/05/06  token rotation and reuse detection");
  const pair = await tokens.issueTokenPair(user);
  ok("access + refresh issued", Boolean(pair.accessToken && pair.refreshToken));

  const rtRow = await RefreshToken.findOne({ tokenHash: tokens.hashToken(pair.refreshToken) });
  ok("refresh token stored HASHED only", Boolean(rtRow) && rtRow.tokenHash !== pair.refreshToken);

  const r1 = await tokens.rotateRefreshToken(pair.refreshToken);
  ok("FR-AUTH-05 rotation issues a new token", r1.status === "ok" && r1.refreshToken !== pair.refreshToken);

  const oldRow = await RefreshToken.findById(rtRow._id);
  ok("old token marked revoked", oldRow.revoked === true);

  await RefreshToken.findByIdAndUpdate(rtRow._id, {
    rotatedAt: new Date(Date.now() - tokens.RACE_GRACE_MS - 5000),
  });

  const replayResult = await tokens.rotateRefreshToken(pair.refreshToken);
  ok("FR-AUTH-06 replay detected as theft", replayResult.status === "reuse_detected",
     `revoked ${replayResult.revokedCount} session(s)`);

  const afterTheft = await tokens.rotateRefreshToken(r1.refreshToken);
  ok("FR-AUTH-06 the NEWEST token is dead too", afterTheft.status === "invalid",
     `status=${afterTheft.status}`);

  await RefreshToken.updateMany(
    { userId: user._id, revokedReason: "reuse_detected" },
    { rotatedAt: new Date(Date.now() - tokens.RACE_GRACE_MS - 5000) },
  );
  const muchLater = await tokens.rotateRefreshToken(r1.refreshToken);
  ok("a wiped session stays invalid, no repeat theft alert", muchLater.status === "invalid",
     `status=${muchLater.status}`);

  const pairLogout = await tokens.issueTokenPair(user);
  await tokens.revokeRefreshToken(pairLogout.refreshToken);
  await RefreshToken.updateMany(
    { userId: user._id, revokedReason: "logout" },
    { rotatedAt: new Date(Date.now() - tokens.RACE_GRACE_MS - 5000) },
  );
  const afterLogout = await tokens.rotateRefreshToken(pairLogout.refreshToken);
  ok("a logged-out token is invalid, not theft", afterLogout.status === "invalid",
     `status=${afterLogout.status}`);

  const pair2 = await tokens.issueTokenPair(user);
  const [a, b] = await Promise.all([
    tokens.rotateRefreshToken(pair2.refreshToken),
    tokens.rotateRefreshToken(pair2.refreshToken),
  ]);
  const statuses = [a.status, b.status].sort().join("+");
  ok("concurrent refresh = one wins, one races (NOT theft)", statuses === "ok+race", `got ${statuses}`);

  line("FR-AUTH-10  rate limiting on real Redis");
  const key = `otp:selftest:${Date.now()}`;
  const counts = [];
  for (let i = 0; i < 4; i += 1) counts.push(await incrementCounter(key, 60));
  ok("counter increments across calls", counts.join(",") === "1,2,3,4", counts.join(","));
  ok("4th request exceeds a limit of 3", counts[3] > 3);
  await getRedis().del(key);

  await RefreshToken.deleteMany({ userId: user._id });
  await OtpRequest.deleteMany({ email: EMAIL });
  await UserModel.deleteOne({ _id: user._id });
  await mongoose.disconnect();
  console.log("\ncleaned up.\n");
};

run().catch(async (e) => {
  console.error("SELFTEST FAILED:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
