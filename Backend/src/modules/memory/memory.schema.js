const { z } = require("zod");

const factId = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Must be a valid memory id.",
  );

const factIdParamSchema = z.object({ id: factId });
const updateMemorySchema = z.object({
  text: z.string().trim().min(1, "Memory text is required.").max(500),
});
const updateMemorySettingsSchema = z.object({ enabled: z.boolean() });

module.exports = { factIdParamSchema, updateMemorySchema, updateMemorySettingsSchema };
