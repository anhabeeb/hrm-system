import { z } from "zod";

import type { ExpiryActionInput, ExpiryAlertListFilters, ExpiryScanFilters, ExpirySettingsInput } from "./expiry-alerts.types";
import { ValidationError } from "../../utils/errors";

const bool = z.preprocess((value) => {
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return value;
}, z.boolean());

const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date format.");
const optionalDate = z.string().trim().max(40).optional();
const severity = z.enum(["info", "warning", "high", "critical"]);
const sourceType = z.enum([
  "employee_document",
  "employee_passport",
  "employee_work_permit",
  "contract",
  "probation",
  "long_leave_return",
  "asset_assignment",
  "uniform_return",
]);

const warningDays = z.array(z.coerce.number().int().min(0).max(365)).min(1).max(12);

export const validateExpiryAlertFilters = (input: Record<string, unknown>): ExpiryAlertListFilters => {
  const result = z.object({
    status: z.enum(["open", "acknowledged", "snoozed", "resolved", "dismissed"]).optional(),
    severity: severity.optional(),
    source_type: sourceType.optional(),
    employee_id: z.string().trim().max(128).optional(),
    outlet_id: z.string().trim().max(128).optional(),
    department_id: z.string().trim().max(128).optional(),
    alert_type: z.enum(["upcoming_expiry", "due_today", "overdue"]).optional(),
    from_date: optionalDate,
    to_date: optionalDate,
    include_closed: bool.optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review expiry alert filters.");
  if (result.data.from_date && result.data.to_date && result.data.to_date < result.data.from_date) {
    throw new ValidationError("The end date must be on or after the start date.");
  }
  return result.data;
};

export const validateExpiryScan = (input: unknown): ExpiryScanFilters => {
  const result = z.object({
    as_of_date: date.default(new Date().toISOString().slice(0, 10)),
    through_date: date.optional(),
    warning_days: warningDays.optional(),
    source_type: sourceType.optional(),
    employee_id: z.string().trim().max(128).optional(),
    outlet_id: z.string().trim().max(128).optional(),
    department_id: z.string().trim().max(128).optional(),
    include_archived_employees: bool.optional(),
    include_inactive_employees: bool.optional(),
  }).safeParse(input ?? {});
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review the expiry scan request.");
  if (result.data.through_date && result.data.through_date < result.data.as_of_date) {
    throw new ValidationError("The scan through date must be on or after the as-of date.");
  }
  return result.data;
};

export const validateExpirySettings = (input: unknown): ExpirySettingsInput => {
  const result = z.object({
    enabled: bool.optional(),
    warning_days: warningDays.optional(),
    overdue_enabled: bool.optional(),
    repeat_frequency: z.enum(["daily", "weekly", "monthly", "none"]).optional(),
    quiet_days: z.coerce.number().int().min(0).max(60).optional(),
    in_app_enabled: bool.optional(),
    email_enabled: bool.optional(),
    minimum_email_severity: severity.optional(),
    notify_roles: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    notify_permissions: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    notify_employee_self: bool.optional(),
    fallback_to_admins: bool.optional(),
    include_archived_employees: bool.optional(),
    include_inactive_employees: bool.optional(),
    source_toggles: z.record(bool).optional(),
    reason: z.string().trim().min(1, "A reason is required.").max(500),
  }).safeParse(input ?? {});
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review expiry alert settings.");
  return result.data;
};

export const validateExpiryAction = (input: unknown): ExpiryActionInput => {
  const result = z.object({
    reason: z.string().trim().max(500).optional(),
    snoozed_until: z.string().trim().max(40).optional(),
  }).safeParse(input ?? {});
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review expiry alert action details.");
  return result.data;
};
