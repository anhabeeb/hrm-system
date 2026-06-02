import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const twoFactorLoginSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});
