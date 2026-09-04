class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const sendError = (res, status, code, message, details) => {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ error });
};

const badRequest = (message, details) => new ApiError(400, "VALIDATION_ERROR", message, details);
const unauthorized = (message) => new ApiError(401, "UNAUTHENTICATED", message);
const forbidden = (message) => new ApiError(403, "FORBIDDEN", message);
const notFound = (message) => new ApiError(404, "NOT_FOUND", message);

module.exports = { ApiError, sendError, badRequest, unauthorized, forbidden, notFound };
