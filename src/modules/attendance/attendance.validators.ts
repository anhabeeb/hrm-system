import { z } from "zod";

import {
  ATTENDANCE_EVENT_TYPES,
  ATTENDANCE_METHODS,
  ATTENDANCE_SORT_FIELDS,
  ATTENDANCE_SOURCES,
  ATTENDANCE_SUMMARY_STATUSES,
} from "./attendance.constants";
import type {
  AttendanceEventInput,
  AttendanceListFilters,
  ConflictResolveInput,
  CorrectionRequestInput,
  ManualEntryInput,
  ReviewInput,
} from "./attendance.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

const reason = z.string().trim().min(3, "A reason is required for this action.");
const isoOrDate = z.string().trim().min(1);

export const validateAttendanceListFilters = (
  query: Record<string, string | undefined>,
): AttendanceListFilters =>
  parse(
    z.object({
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      attendance_date: z.string().optional(),
      employee_id: z.string().optional(),
      outlet_id: z.string().optional(),
      device_id: z.string().trim().min(1).max(128).optional(),
      department_id: z.string().optional(),
      position_id: z.string().optional(),
      status: z.string().optional(),
      event_type: z.enum(ATTENDANCE_EVENT_TYPES).optional(),
      attendance_method: z.enum(ATTENDANCE_METHODS).optional(),
      source: z.enum(ATTENDANCE_SOURCES).optional(),
      sync_status: z.string().optional(),
      approval_status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      sort_by: z.enum(ATTENDANCE_SORT_FIELDS).default("attendance_date"),
      sort_direction: z.enum(["asc", "desc"]).default("desc"),
    }),
    query,
  );

export const validateClockInput = (payload: unknown): AttendanceEventInput =>
  parse(
    z.object({
      employee_id: z.string().trim().min(1, "Employee is required."),
      outlet_id: z.string().trim().min(1, "Outlet is required."),
      event_time: isoOrDate.optional(),
      attendance_method: z.enum(ATTENDANCE_METHODS).default("manual"),
      reason: z.string().trim().optional(),
    }),
    payload,
  );

export const validateManualEntryInput = (payload: unknown): ManualEntryInput =>
  parse(
    z.object({
      employee_id: z.string().trim().min(1, "Employee is required."),
      outlet_id: z.string().trim().min(1, "Outlet is required."),
      attendance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid attendance date."),
      clock_in_time: isoOrDate.optional(),
      clock_out_time: isoOrDate.optional(),
      status: z.enum(ATTENDANCE_SUMMARY_STATUSES).optional(),
      reason,
      notes: z.string().trim().optional(),
    }),
    payload,
  );

export const validateCorrectionRequestInput = (
  payload: unknown,
): CorrectionRequestInput =>
  parse(
    z.object({
      employee_id: z.string().trim().min(1, "Employee is required."),
      attendance_event_id: z.string().trim().optional(),
      correction_type: z.string().trim().min(1, "Correction type is required."),
      old_value_json: z.record(z.unknown()).optional(),
      new_value_json: z.record(z.unknown()),
      reason,
    }),
    payload,
  );

export const validateReviewInput = (payload: unknown): ReviewInput => {
  const input = parse(
    z.object({
      reason: z.string().trim().optional(),
      notes: z.string().trim().optional(),
      resolution_notes: z.string().trim().optional(),
    }),
    payload,
  );
  const value = input.reason ?? input.notes ?? input.resolution_notes;
  if (!value || value.length < 3) throw new ValidationError("A reason is required for this action.");
  return { reason: value };
};

export const validateConflictResolveInput = (payload: unknown): ConflictResolveInput => {
  const input = parse(
    z.object({
      resolution: z.enum(["accept", "reject", "merge", "ignore"]),
      reason: z.string().trim().optional(),
      resolution_notes: z.string().trim().optional(),
    }),
    payload,
  );
  const value = input.reason ?? input.resolution_notes;
  if (!value || value.length < 3) throw new ValidationError("A reason is required for this action.");
  return { resolution: input.resolution, reason: value };
};
