const UserModel = require("../user/user.model");
const { sendError } = require("../../shared/utils/apiError");
const { createOtpForEmail, verifyOtp } = require("./otp.service");
const { sendOtpEmail } = require("../../shared/email/email.service");
const {
  REFRESH_COOKIE_NAME,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  issueAccessToken,
  refreshCookieOptions,
} = require("./token.service");

const OTP_NEUTRAL_RESPONSE = {
  message: "Check your email for a 6-digit code.",
};

const displayNameFromEmail = (email) => {
  const localPart = String(email).split("@")[0] || "there";
  return localPart.slice(0, 100);
};

const sendTokenPair = (res, { accessToken, refreshToken }, extra = {}) => {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  return res.status(200).json({ accessToken, ...extra });
};

const handleOAuthCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  try {
    const pair = await issueTokenPair(req.user);
    res.cookie(REFRESH_COOKIE_NAME, pair.refreshToken, refreshCookieOptions());
    return res.redirect(`${frontendUrl}/oauth-callback`);
  } catch (error) {
    console.error("OAuth callback failed:", error.message);
    return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  }
};

const handleOtpRequest = async (req, res) => {
  const { email } = req.body;

  try {
    const { code, expiresInMinutes } = await createOtpForEmail(email);
    const result = await sendOtpEmail({ to: email, code, expiresInMinutes });

    if (result.sent) {
      console.info("OTP email dispatched for a sign-in request.");
    } else {
      console.error(`OTP email not delivered (${result.reason}) for a sign-in request.`);
    }

    return res.status(200).json(OTP_NEUTRAL_RESPONSE);
  } catch (error) {
    console.error("OTP request failed:", error.message);
    return res.status(200).json(OTP_NEUTRAL_RESPONSE);
  }
};

const handleOtpVerify = async (req, res) => {
  const { email, code } = req.body;

  const result = await verifyOtp(email, code);

  if (result.status === "no_code") {
    return sendError(res, 400, "NO_PENDING_CODE", "Request a new code to sign in.");
  }
  if (result.status === "expired") {
    return sendError(res, 400, "CODE_EXPIRED", "That code has expired. Request a new one.");
  }
  if (result.status === "locked") {
    return sendError(
      res,
      400,
      "CODE_LOCKED",
      "Too many incorrect attempts. Request a new code to try again.",
    );
  }
  if (result.status === "wrong") {
    const left = result.attemptsRemaining;
    return sendError(
      res,
      400,
      "CODE_INCORRECT",
      `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.`,
    );
  }

  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        email,
        fullname: displayNameFromEmail(email),
        authProvider: "email",
      },
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );

  const pair = await issueTokenPair(user);
  return sendTokenPair(res, pair, {
    user: { _id: user._id, fullname: user.fullname, email: user.email },
  });
};

const handleRefresh = async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!rawToken) {
    return sendError(res, 401, "NO_REFRESH_TOKEN", "Not signed in.");
  }

  const result = await rotateRefreshToken(rawToken);

  if (result.status === "reuse_detected") {
    console.warn(
      `Refresh token reuse detected for user ${result.userId}. Revoked ${result.revokedCount} session(s).`,
    );
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    return sendError(
      res,
      401,
      "SESSION_REVOKED",
      "Your session was ended for security reasons. Please sign in again.",
    );
  }

  if (result.status === "race") {
    return sendError(res, 409, "REFRESH_IN_PROGRESS", "Please retry.");
  }

  if (result.status !== "ok") {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    return sendError(res, 401, "INVALID_REFRESH_TOKEN", "Please sign in again.");
  }

  const user = await UserModel.findById(result.userId);
  if (!user) {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    return sendError(res, 401, "UNAUTHENTICATED", "Please sign in again.");
  }

  return sendTokenPair(
    res,
    { accessToken: issueAccessToken(user), refreshToken: result.refreshToken },
    { user: { _id: user._id, fullname: user.fullname, email: user.email } },
  );
};

const handleLogout = async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (rawToken) await revokeRefreshToken(rawToken);

  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  return res.status(200).json({ message: "Signed out." });
};

module.exports = {
  handleOAuthCallback,
  handleOtpRequest,
  handleOtpVerify,
  handleRefresh,
  handleLogout,
};
