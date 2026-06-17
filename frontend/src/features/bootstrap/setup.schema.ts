import { z } from "zod";

import { isStrongPassword } from "@/components/forms/PasswordStrengthHint";

export const setupSchema = z
  .object({
    company_name: z.string().trim().min(1, "Company name is required."),
    legal_name: z.string().trim().optional(),
    registration_number: z.string().trim().optional(),
    country: z.string().trim().min(1, "Country is required.").default("MV"),
    timezone: z.string().trim().min(1, "Timezone is required.").default("Indian/Maldives"),
    currency: z.string().trim().min(1, "Currency is required.").default("MVR"),
    full_name: z.string().trim().min(1, "Full name is required."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(1, "Password is required.").refine(isStrongPassword, "Please use a stronger password."),
    confirm_password: z.string().min(1, "Please confirm the password."),
    include_outlet: z.boolean().default(true),
    outlet_name: z.string().trim().optional(),
    outlet_code: z.string().trim().optional(),
    is_primary: z.boolean().default(true),
    features: z.object({
      attendance: z.boolean().default(true),
      roster: z.boolean().default(true),
      contract_tracking: z.boolean().default(true),
    }).default({ attendance: true, roster: true, contract_tracking: true }),
    bootstrap_token: z.string().trim().min(1, "Bootstrap token is required."),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords must match.",
    path: ["confirm_password"],
  })
  .refine((value) => !value.include_outlet || Boolean(value.outlet_name?.trim()), {
    message: "Outlet name is required when the first outlet section is enabled.",
    path: ["outlet_name"],
  });
