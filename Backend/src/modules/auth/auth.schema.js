const { z } = require("zod");
const { email } = require("../../shared/validation/common.schema");

const otpRequestSchema = z.object({ email });

const otpVerifySchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Enter the 6-digit code from your email."),
});

module.exports = { otpRequestSchema, otpVerifySchema };
