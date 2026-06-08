import { z } from "zod";

import type { EmailListFilters, EmailPreferenceInput, EmailSettingsInput } from "./email-notifications.types";
import { ValidationError } from "../../utils/errors";

const bool = z.preprocess((value) => {
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return value;
}, z.boolean());

const priority = z.enum(["low", "normal", "high", "urgent"]);
const category = z.string().trim().min(1).max(80);
const date = z.string().trim().max(40).optional();

export const validateEmailFilters = (input: Record<string, unknown>): EmailListFilters => {
  const result = z.object({
    status: z.enum(["pending", "queued", "sent", "failed", "skipped_preference", "skipped_no_email", "skipped_disabled", "skipped_config_missing", "duplicate"]).optional(),
    category: category.optional(),
    priority: priority.optional(),
    notification_type: z.string().trim().max(120).optional(),
    recipient_user_id: z.string().trim().max(128).optional(),
    entity_type: z.string().trim().max(120).optional(),
    entity_id: z.string().trim().max(128).optional(),
    from_date: date,
    to_date: date,
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review email notification filters.");
  if (result.data.from_date && result.data.to_date && result.data.to_date < result.data.from_date) {
    throw new ValidationError("The end date must be on or after the start date.");
  }
  return result.data;
};

export const validateEmailPreferences = (input: unknown): EmailPreferenceInput[] => {
  const result = z.object({
    preferences: z.array(z.object({
      category,
      email_enabled: bool,
      minimum_priority_for_email: priority.default("normal"),
      muted_until: z.string().trim().max(40).optional().nullable(),
      digest_enabled: bool.optional().default(false),
    })).min(1).max(40),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review email preferences.");
  return result.data.preferences;
};

export const validateEmailSettings = (input: unknown): EmailSettingsInput => {
  const result = z.object({
    enabled: bool.optional(),
    allowed_categories: z.array(category).min(1).max(30).optional(),
    minimum_priority: priority.optional(),
    send_immediately: bool.optional(),
    admin_failure_notifications: bool.optional(),
    reason: z.string().trim().min(1, "A reason is required.").max(500),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review email notification settings.");
  return result.data;
};

export const validateProcessPending = (input: unknown) => {
  const result = z.object({
    limit: z.coerce.number().int().min(1).max(25).default(10),
  }).safeParse(input ?? {});
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review the email processing request.");
  return result.data;
};

export const validatePreviewVariables = (input: unknown): Record<string, unknown> => {
  const result = z.object({
    variables: z.record(z.unknown()).optional().default({}),
  }).safeParse(input ?? {});
  if (!result.success) throw new ValidationError("Please review template preview variables.");
  return result.data.variables;
};
