const jwt = require("jsonwebtoken");
const { VerifyUser } = require("../../modules/auth/auth.service");
const { sendError } = require("../utils/apiError");

const isAuthenticated = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "NO_TOKEN", "Not signed in.");
  }

  const token = authHeader.split(" ")[1];

  try {
    req.user = VerifyUser(token);
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return sendError(res, 401, "TOKEN_EXPIRED", "Your session expired. Refreshing...");
    }

    return sendError(res, 401, "INVALID_TOKEN", "Please sign in again.");
  }
};

const restrictedto = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) return sendError(res, 401, "NO_TOKEN", "Not signed in.");
    if (!roles.includes(req.user.role)) {
      return sendError(res, 403, "FORBIDDEN", "You are not allowed to access this resource.");
    }
    return next();
  };
};

module.exports = { isAuthenticated, restrictedto };
