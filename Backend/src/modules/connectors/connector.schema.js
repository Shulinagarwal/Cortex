const { z } = require("zod");

const connectorIdParamSchema = z.object({
  id: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/, "Must be a valid connector id."),
});

module.exports = { connectorIdParamSchema };
