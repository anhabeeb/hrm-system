import { z } from "zod";

import type { UpdateCompanyProfileInput } from "./company.types";
import { ValidationError } from "../../utils/errors";

const optionalText = z.string().trim().max(300).nullable().optional();

const schema = z.object({
  company_name: z.string().trim().min(1).max(160).optional(),
  legal_name: optionalText,
  registration_number: optionalText,
  tax_number: optionalText,
  company_email: z.string().trim().email().nullable().optional(),
  company_phone: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().url().nullable().optional().or(z.literal("")),
  country: optionalText,
  timezone: z.string().trim().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Please enter a valid currency code.").optional(),
  address_line_1: optionalText,
  address_line_2: optionalText,
  city: optionalText,
  state_region: optionalText,
  postal_code: optionalText,
  logo_url: z.string().trim().url().nullable().optional().or(z.literal("")),
  reason: z.string().trim().min(3, "A reason is required for this company change."),
});

export const validateCompanyProfileUpdate = (payload: unknown): UpdateCompanyProfileInput => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Please review the company information.");
  }

  const input = result.data as UpdateCompanyProfileInput;
  if (input.company_email) input.company_email = input.company_email.toLowerCase();
  if (input.website === "") input.website = null;
  if (input.logo_url === "") input.logo_url = null;

  if (input.timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
    } catch {
      throw new ValidationError("Please enter a valid timezone.");
    }
  }

  return input;
};
