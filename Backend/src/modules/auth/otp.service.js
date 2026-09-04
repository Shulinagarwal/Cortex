const crypto = require("crypto");
const OtpRequest = require("./otpRequest.model");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");

const generateCode = () =>
  crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");

const createOtpForEmail = async (email) => {
  await OtpRequest.updateMany({ email, consumed: false }, { consumed: true });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await OtpRequest.create({ email, codeHash: hashCode(code), expiresAt, attempts: 0 });

  return { code, expiresInMinutes: OTP_TTL_MINUTES };
};

const verifyOtp = async (email, submittedCode) => {
  const record = await OtpRequest.findOne({ email, consumed: false }).sort({ createdAt: -1 });

  if (!record) return { status: "no_code" };

  if (record.expiresAt.getTime() < Date.now()) {
    record.consumed = true;
    await record.save();
    return { status: "expired" };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    record.consumed = true;
    await record.save();
    return { status: "locked" };
  }

  const submittedHash = Buffer.from(hashCode(String(submittedCode)));
  const storedHash = Buffer.from(record.codeHash);
  const matches =
    submittedHash.length === storedHash.length &&
    crypto.timingSafeEqual(submittedHash, storedHash);

  if (!matches) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) record.consumed = true;
    await record.save();

    return {
      status: record.consumed ? "locked" : "wrong",
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - record.attempts),
    };
  }

  record.consumed = true;
  await record.save();
  return { status: "ok" };
};

module.exports = {
  OTP_LENGTH,
  OTP_TTL_MINUTES,
  MAX_ATTEMPTS,
  hashCode,
  generateCode,
  createOtpForEmail,
  verifyOtp,
};
