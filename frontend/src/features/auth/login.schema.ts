import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username or email is required."),
  password: z.string().min(1, "Password is required."),
});

export const twoFactorLoginSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});
