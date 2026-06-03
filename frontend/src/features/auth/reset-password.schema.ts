import { z } from "zod";

import { isStrongPassword } from "@/components/forms/PasswordStrengthHint";

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "Reset token is required."),
    new_password: z.string().min(1, "New password is required.").refine(isStrongPassword, "Please use a stronger password."),
    confirm_password: z.string().min(1, "Please confirm the new password."),
  })
  .refine((value) => value.new_password === value.confirm_password, {
    message: "Passwords must match.",
    path: ["confirm_password"],
  });
