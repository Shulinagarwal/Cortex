const { z } = require("zod");

const objectId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a 24-character hexadecimal id.");

const email = z.string().trim().toLowerCase().pipe(z.email("Must be a valid email address."));

const idParamSchema = z.object({ id: objectId });

module.exports = { objectId, email, idParamSchema };
