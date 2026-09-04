const { z } = require("zod");
const { objectId } = require("../../shared/validation/common.schema");

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "Message content is required.").max(20000),
  chatId: objectId.optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

const chatIdParamSchema = z.object({ chatId: objectId });

module.exports = { sendMessageSchema, chatIdParamSchema };
