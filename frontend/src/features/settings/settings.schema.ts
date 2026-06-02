import { z } from "zod";

export const settingsReasonSchema = z.object({
  reason: z.string().trim().min(3, "A reason is required for this change."),
});

export const companySettingsSchema = settingsReasonSchema.extend({
  company_name: z.string().trim().optional(),
  legal_name: z.string().trim().optional(),
  country: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  currency: z.string().trim().optional(),
});

export type SettingsReasonValues = z.infer<typeof settingsReasonSchema>;
export type CompanySettingsValues = z.infer<typeof companySettingsSchema>;
