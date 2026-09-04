const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const RefreshToken = require("./refreshToken.model");

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);

const RACE_GRACE_MS = 10_000;

const REFRESH_COOKIE_NAME = "cortex_rt";

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const issueAccessToken = (user) =>
  jwt.sign(
    { _id: user._id, fullname: user.fullname, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );

const issueRefreshToken = async (userId, rotatedFromId = null) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const doc = await RefreshToken.create({
    userId,
    tokenHash: hashToken(raw),
    expiresAt,
    rotatedFromId,
  });

  return { raw, doc };
};

const revokeAllForUser = async (userId, reason = "reuse_detected") => {
  const result = await RefreshToken.updateMany(
    { userId, revoked: false },
    { revoked: true, rotatedAt: new Date(), revokedReason: reason },
  );
  return result.modifiedCount ?? 0;
};

const issueTokenPair = async (user) => {
  const accessToken = issueAccessToken(user);
  const { raw: refreshToken } = await issueRefreshToken(user._id);
  return { accessToken, refreshToken };
};

const rotateRefreshToken = async (rawToken) => {
  if (!rawToken) return { status: "invalid" };

  const tokenHash = hashToken(rawToken);

  const current = await RefreshToken.findOneAndUpdate(
    { tokenHash, revoked: false },
    { revoked: true, rotatedAt: new Date(), revokedReason: "rotated" },
    { returnDocument: "after" },
  );

  if (!current) {
    const existing = await RefreshToken.findOne({ tokenHash });
    if (!existing) return { status: "invalid" };

    if (existing.revokedReason === "reuse_detected" || existing.revokedReason === "logout") {
      return { status: "invalid", userId: existing.userId };
    }

    const rotatedAgo = Date.now() - new Date(existing.rotatedAt ?? existing.updatedAt).getTime();
    if (rotatedAgo <= RACE_GRACE_MS) {
      return { status: "race", userId: existing.userId };
    }

    const revokedCount = await revokeAllForUser(existing.userId, "reuse_detected");
    return { status: "reuse_detected", userId: existing.userId, revokedCount };
  }

  if (current.expiresAt.getTime() < Date.now()) {
    return { status: "invalid" };
  }

  const { raw: nextRefreshToken } = await issueRefreshToken(current.userId, current._id);
  return { status: "ok", userId: current.userId, refreshToken: nextRefreshToken };
};

const revokeRefreshToken = async (rawToken) => {
  if (!rawToken) return false;
  const result = await RefreshToken.findOneAndUpdate(
    { tokenHash: hashToken(rawToken), revoked: false },
    { revoked: true, rotatedAt: new Date(), revokedReason: "logout" },
  );
  return Boolean(result);
};

const refreshCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
};

module.exports = {
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
  RACE_GRACE_MS,
  hashToken,
  issueAccessToken,
  issueRefreshToken,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  refreshCookieOptions,
};
