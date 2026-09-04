const express = require("express");
const Router = express.Router();
const passport = require("passport");

const { validate } = require("../../shared/middleware/validate.middleware");
const { otpRequestSchema, otpVerifySchema } = require("./auth.schema");
const { otpRequestRateLimit } = require("./otpRateLimit.middleware");
const {
  handleOAuthCallback,
  handleOtpRequest,
  handleOtpVerify,
  handleRefresh,
  handleLogout,
} = require("./auth.controller");

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";

Router.post(
  "/otp/request",
  validate({ body: otpRequestSchema }),
  otpRequestRateLimit,
  handleOtpRequest,
);

Router.post(
  "/otp/verify",
  validate({ body: otpVerifySchema }),
  handleOtpVerify,
);

Router.post("/refresh", handleRefresh);
Router.post("/logout", handleLogout);

Router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], state: true }),
);

Router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${frontendUrl}/login?error=oauth_failed`,
    session: false,
  }),
  handleOAuthCallback,
);

Router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"], state: true }),
);

Router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: `${frontendUrl}/login?error=oauth_failed`,
    session: false,
  }),
  handleOAuthCallback,
);

module.exports = Router;
