const { incrementCounter, getTimeToLive, isRedisConfigured } = require("../../shared/config/redis");
const { sendError } = require("../../shared/utils/apiError");

const WINDOW_SECONDS = 15 * 60;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;

const clientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
};

const otpRequestRateLimit = async (req, res, next) => {
  if (!isRedisConfigured()) {
    console.warn("OTP rate limiting is disabled: Redis is not configured.");
    return next();
  }

  const email = String(req.body?.email || "").toLowerCase();
  const ip = clientIp(req);

  try {
    const [emailCount, ipCount] = await Promise.all([
      incrementCounter(`otp:email:${email}`, WINDOW_SECONDS),
      incrementCounter(`otp:ip:${ip}`, WINDOW_SECONDS),
    ]);

    const overEmail = emailCount > MAX_PER_EMAIL;
    const overIp = ipCount > MAX_PER_IP;

    if (overEmail || overIp) {
      const key = overEmail ? `otp:email:${email}` : `otp:ip:${ip}`;
      const retryAfter = (await getTimeToLive(key)) ?? WINDOW_SECONDS;

      res.set("Retry-After", String(retryAfter));

      const minutes = Math.max(1, Math.ceil(retryAfter / 60));
      return sendError(
        res,
        429,
        "RATE_LIMITED",
        `Too many code requests. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      );
    }

    return next();
  } catch (error) {
    console.error("OTP rate limiting unavailable:", error.message);
    return sendError(
      res,
      503,
      "SERVICE_UNAVAILABLE",
      "Sign-in by code is temporarily unavailable. Please use Google or GitHub.",
    );
  }
};

module.exports = { otpRequestRateLimit, WINDOW_SECONDS, MAX_PER_EMAIL, MAX_PER_IP, clientIp };
