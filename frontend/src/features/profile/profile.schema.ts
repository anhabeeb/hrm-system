import { z } from "zod";

import { isStrongPassword } from "@/components/forms/PasswordStrengthHint";

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required."),
    new_password: z.string().min(1, "New password is required.").refine(isStrongPassword, "Please use a stronger password."),
    confirm_password: z.string().min(1, "Please confirm the new password."),
  })
  .refine((value) => value.new_password === value.confirm_password, {
    message: "Passwords must match.",
    path: ["confirm_password"],
  });

export const kycUpdateSchema = z
  .object({
    full_name: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    emergency_contact: z.string().trim().optional(),
    document_note: z.string().trim().optional(),
    reason: z.string().trim().min(1, "Reason is required."),
  })
  .refine(
    (value) =>
      Boolean(
        value.full_name?.trim() ||
          value.phone?.trim() ||
          value.address?.trim() ||
          value.emergency_contact?.trim() ||
          value.document_note?.trim(),
      ),
    {
      message: "Please request at least one profile change.",
      path: ["full_name"],
    },
  );

export const twoFactorCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit Google Authenticator code."),
});

export const disableTwoFactorSchema = z.object({
  password: z.string().optional(),
  code: z.string().optional(),
}).refine((value) => value.password || value.code, {
  message: "Please confirm with your password or Google Authenticator code.",
  path: ["password"],
});
