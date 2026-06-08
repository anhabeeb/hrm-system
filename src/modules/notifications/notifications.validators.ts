import { z } from "zod";

import type { NotificationListFilters, NotificationPreferenceInput } from "./notifications.types";
import { ValidationError } from "../../utils/errors";

const bool = z.preprocess((value) => {
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return value;
}, z.boolean());

const date = z.string().trim().max(40).optional();

export const validateNotificationFilters = (input: Record<string, unknown>): NotificationListFilters => {
  const result = z.object({
    status: z.enum(["unread", "read", "archived", "dismissed"]).optional(),
    category: z.string().trim().max(80).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    notification_type: z.string().trim().max(120).optional(),
    entity_type: z.string().trim().max(120).optional(),
    entity_id: z.string().trim().max(128).optional(),
    from_date: date,
    to_date: date,
    unread_only: bool.optional(),
    include_archived: bool.optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review notification filters.");
  if (result.data.from_date && result.data.to_date && result.data.to_date < result.data.from_date) {
    throw new ValidationError("The end date must be on or after the start date.");
  }
  return result.data;
};

export const validatePreferences = (input: unknown): NotificationPreferenceInput[] => {
  const result = z.object({
    preferences: z.array(z.object({
      category: z.string().trim().min(1).max(80),
      enabled: bool,
      minimum_priority: z.enum(["low", "normal", "high", "urgent"]).default("low"),
      muted_until: z.string().trim().max(40).optional().nullable(),
    })).min(1).max(40),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review notification preferences.");
  return result.data.preferences;
};
