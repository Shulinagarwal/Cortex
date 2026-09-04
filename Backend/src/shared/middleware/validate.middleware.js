const { sendError } = require("../utils/apiError");

const toDetails = (issues) =>
  issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    code: issue.code,
    message: issue.message,
  }));

const validate = (schemas) => (req, res, next) => {
  for (const key of ["body", "params", "query"]) {
    const schema = schemas[key];
    if (!schema) continue;

    const result = schema.safeParse(req[key] ?? {});
    if (!result.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        `Invalid request ${key}.`,
        toDetails(result.error.issues),
      );
    }

    Object.defineProperty(req, key, {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return next();
};

module.exports = { validate, toDetails };
