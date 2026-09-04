const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");

const cookieParser = require("cookie-parser");

const passport = require("./modules/auth/passport");
const { sanitizeRequest } = require("./shared/middleware/sanitize.middleware");
const { sendError, ApiError } = require("./shared/utils/apiError");

const authRoutes = require("./modules/auth/auth.routes");
const chatRoutes = require("./modules/chat/chat.routes");
const MessageRoutes = require("./modules/message/message.routes");
const userRoutes = require("./modules/user/user.routes");
const documentRoutes = require("./modules/document/document.routes");
const memoryRoutes = require("./modules/memory/memory.routes");
const connectorRoutes = require("./modules/connectors/connector.routes");

const buildAllowedOrigins = (frontendUrl = process.env.FRONTEND_URL) =>
  (frontendUrl || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const buildCorsOptions = (allowedOrigins) => ({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin.replace(/\/+$/, ""))) return callback(null, true);
    return callback(null, false);
  },

  credentials: true,
});

const createApp = () => {
  const app = express();
  const allowedOrigins = buildAllowedOrigins();

  app.use(helmet());
  app.disable("x-powered-by");

  app.use(cors(buildCorsOptions(allowedOrigins)));

  app.use(express.json({ limit: "1mb" }));

  app.use(cookieParser());

  app.use(sanitizeRequest);

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/chats", chatRoutes);
  app.use("/api/messages", MessageRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/memory", memoryRoutes);
  app.use("/api/connectors", connectorRoutes);

  app.use((_req, res) => sendError(res, 404, "NOT_FOUND", "This endpoint does not exist."));

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;

    if (error instanceof ApiError) {
      return sendError(res, error.status, error.code, error.message, error.details);
    }

    console.error("Unhandled error:", error);
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  });

  return app;
};

module.exports = { createApp, buildAllowedOrigins, buildCorsOptions };
