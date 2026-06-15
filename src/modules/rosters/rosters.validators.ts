import { z } from "zod";

import { ValidationError } from "../../utils/errors";
import { ROSTER_CONFLICT_SEVERITIES, ROSTER_CONFLICT_STATUSES, ROSTER_CONFLICT_TYPES, ROSTER_STATUSES } from "./rosters.constants";
import type {
  RosterChangeFilters,
  RosterChangeRequestInput,
  RosterActionInput,
  RosterBulkInput,
  RosterConflictFilters,
  RosterListFilters,
  RosterPublishInput,
  RosterShiftInput,
  RosterShiftUpdateInput,
  ShiftTemplateFilters,
  ShiftTemplateInput,
  ShiftTemplateUpdateInput,
} from "./rosters.types";
import { ROSTER_CHANGE_TYPES, ROSTER_CHANGE_STATUSES } from "./rosters.types";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm format.");
const safeString = z.string().trim().min(1).max(160);
const optionalId = safeString.optional().nullable();
const optionalText = z.string().trim().max(2000).optional().nullable();
const reason = z.string().trim().min(3, "A reason is required.").max(1000);
const sensitivePayloadKey = /(password|password_hash|token|session_token|reset_token|totp_secret|secret)/i;

const parse = <T>(schema: z.ZodType<T>, input: unknown, message = "Please review the roster form and try again."): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fieldErrors[issue.path.join(".") || "form"] = issue.message;
  }
  throw new ValidationError(message, fieldErrors);
};

const dateRange = <T extends { date_from?: string; date_to?: string }>(value: T, ctx: z.RefinementCtx) => {
  if (value.date_from && value.date_to && value.date_to < value.date_from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["date_to"], message: "End date must be on or after start date." });
  }
};

const rejectSensitivePayload = (value: unknown, ctx: z.RefinementCtx, path: (string | number)[] = ["requested_value_json"]) => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitivePayload(item, ctx, [...path, index]));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (sensitivePayloadKey.test(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: "Sensitive fields cannot be stored in roster change payloads." });
    }
    rejectSensitivePayload(nested, ctx, [...path, key]);
  }
};

export const validateShiftTemplateInput = (input: unknown): ShiftTemplateInput =>
  parse(
    z.object({
      outlet_id: optionalId,
      department_id: optionalId,
      name: safeString,
      code: z.string().trim().max(40).optional().nullable(),
      start_time: timeString,
      end_time: timeString,
      break_minutes: z.coerce.number().int().min(0).max(1440).optional(),
      crosses_midnight: z.coerce.boolean().optional(),
      notes: optionalText,
    }),
    input,
  );

export const validateShiftTemplateUpdateInput = (input: unknown): ShiftTemplateUpdateInput =>
  parse(
    z.object({
      outlet_id: optionalId,
      department_id: optionalId,
      name: safeString.optional(),
      code: z.string().trim().max(40).optional().nullable(),
      start_time: timeString.optional(),
      end_time: timeString.optional(),
      break_minutes: z.coerce.number().int().min(0).max(1440).optional(),
      crosses_midnight: z.coerce.boolean().optional(),
      notes: optionalText,
      reason: reason.optional(),
    }),
    input,
  );

export const validateRosterShiftInput = (input: unknown): RosterShiftInput =>
  parse(
    z.object({
      outlet_id: safeString,
      department_id: optionalId,
      position_id: optionalId,
      employee_id: safeString,
      shift_template_id: optionalId,
      roster_date: dateString,
      start_time: timeString.optional(),
      end_time: timeString.optional(),
      break_minutes: z.coerce.number().int().min(0).max(1440).optional(),
      notes: optionalText,
      reason: reason.optional(),
      override_warnings: z.coerce.boolean().optional(),
    }),
    input,
  );

export const validateRosterShiftUpdateInput = (input: unknown): RosterShiftUpdateInput =>
  parse(
    z.object({
      outlet_id: safeString.optional(),
      department_id: optionalId,
      position_id: optionalId,
      employee_id: safeString.optional(),
      shift_template_id: optionalId,
      roster_date: dateString.optional(),
      start_time: timeString.optional(),
      end_time: timeString.optional(),
      break_minutes: z.coerce.number().int().min(0).max(1440).optional(),
      status: z.enum(ROSTER_STATUSES).optional(),
      notes: optionalText,
      reason: reason.optional(),
      override_warnings: z.coerce.boolean().optional(),
    }),
    input,
  );

export const validateRosterBulkInput = (input: unknown): RosterBulkInput =>
  parse(
    z.object({
      outlet_id: safeString,
      department_id: optionalId,
      position_id: optionalId,
      employee_ids: z.array(safeString).min(1, "Choose at least one employee.").max(200),
      date_from: dateString,
      date_to: dateString,
      days_of_week: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
      shift_template_id: safeString,
      notes: optionalText,
      reason: reason.optional(),
      override_warnings: z.coerce.boolean().optional(),
    }).superRefine(dateRange),
    input,
  );

export const validateRosterPublishInput = (input: unknown): RosterPublishInput =>
  parse(
    z.object({
      outlet_id: safeString,
      department_id: optionalId,
      date_from: dateString,
      date_to: dateString,
      reason,
    }).superRefine(dateRange),
    input,
  );

export const validateRosterActionInput = (input: unknown): RosterActionInput =>
  parse(z.object({ reason, notes: optionalText }), input);

export const validateRosterChangeRequestInput = (input: unknown): RosterChangeRequestInput =>
  parse(
    z.object({
      employee_id: optionalId,
      roster_id: optionalId,
      shift_id: optionalId,
      source_roster_id: optionalId,
      target_roster_id: optionalId,
      source_shift_id: optionalId,
      target_shift_id: optionalId,
      change_type: z.enum(ROSTER_CHANGE_TYPES),
      requested_date: dateString.optional().nullable(),
      requested_start_at: timeString.optional().nullable(),
      requested_end_at: timeString.optional().nullable(),
      requested_break_start: timeString.optional().nullable(),
      requested_break_end: timeString.optional().nullable(),
      requested_value_json: z.record(z.string(), z.unknown()).optional().nullable(),
      reason,
      employee_note: optionalText,
      manager_note: optionalText,
      override_warnings: z.coerce.boolean().optional(),
    }).superRefine((value, ctx) => {
      rejectSensitivePayload(value.requested_value_json, ctx);
      if ((value.change_type === "SHIFT_CREATE" || value.change_type === "SHIFT_UPDATE" || value.change_type === "SHIFT_TIME_CHANGE") && (!value.requested_start_at || !value.requested_end_at)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requested_start_at"], message: "Requested start and end times are required for shift time changes." });
      }
    }),
    input,
    "Please review the roster change request and try again.",
  );

export const validateRosterChangeFilters = (query: Record<string, unknown>): RosterChangeFilters => {
  const parsed = parse(
    z.object({
      employee_id: safeString.optional(),
      department_id: safeString.optional(),
      outlet_id: safeString.optional(),
      status: z.enum(ROSTER_CHANGE_STATUSES).optional(),
      approval_status: z.string().trim().max(60).optional(),
      requested_date: dateString.optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(100).default(25),
    }),
    query,
  );
  return { ...parsed, page: parsed.page ?? 1, page_size: parsed.page_size ?? 25 };
};

export const validateRosterListFilters = (query: Record<string, unknown>): RosterListFilters => {
  const parsed = parse(
    z.object({
      outlet_id: safeString.optional(),
      department_id: safeString.optional(),
      position_id: safeString.optional(),
      employee_id: safeString.optional(),
      date_from: dateString.optional(),
      date_to: dateString.optional(),
      status: z.enum(ROSTER_STATUSES).optional(),
      conflict_status: z.enum(ROSTER_CONFLICT_STATUSES).optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(100).default(25),
    }).superRefine(dateRange),
    query,
  );
  return { ...parsed, page: parsed.page ?? 1, page_size: parsed.page_size ?? 25 };
};

export const validateShiftTemplateFilters = (query: Record<string, unknown>): ShiftTemplateFilters => {
  const parsed = parse(
    z.object({
      outlet_id: safeString.optional(),
      department_id: safeString.optional(),
      status: z.enum(["active", "inactive", "all"]).optional(),
      search: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(100).default(25),
    }),
    query,
  );
  return { ...parsed, page: parsed.page ?? 1, page_size: parsed.page_size ?? 25 };
};

export const validateRosterConflictFilters = (query: Record<string, unknown>): RosterConflictFilters => {
  const parsed = parse(
    z.object({
      outlet_id: safeString.optional(),
      department_id: safeString.optional(),
      employee_id: safeString.optional(),
      severity: z.enum(ROSTER_CONFLICT_SEVERITIES).optional(),
      status: z.enum(ROSTER_CONFLICT_STATUSES).optional(),
      conflict_type: z.enum(ROSTER_CONFLICT_TYPES).optional(),
      date_from: dateString.optional(),
      date_to: dateString.optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(100).default(25),
    }).superRefine(dateRange),
    query,
  );
  return { ...parsed, page: parsed.page ?? 1, page_size: parsed.page_size ?? 25 };
};
