import { z } from "zod";

import { ValidationError } from "../../utils/errors";
import type { RosterMatrixChangePayload, RosterWeeklyMatrixQuery } from "./roster-weekly-matrix.types";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.");
const safeString = z.string().trim().min(1).max(160);
const optionalId = safeString.optional().nullable();
const optionalText = z.string().trim().max(2000).optional().nullable();
const reason = z.string().trim().min(3, "A reason is required.").max(1000);

const parse = <T>(schema: z.ZodType<T>, input: unknown, message = "Please review the roster matrix form and try again."): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fieldErrors[issue.path.join(".") || "form"] = issue.message;
  }
  throw new ValidationError(message, fieldErrors);
};

export const validateRosterWeeklyMatrixQuery = (query: Record<string, unknown>): RosterWeeklyMatrixQuery =>
  parse(
    z.object({
      week_start: dateString.optional(),
      department_id: safeString.optional(),
      outlet_id: safeString.optional(),
      store_id: safeString.optional(),
      search: z.string().trim().max(120).optional(),
      shift_id: safeString.optional(),
      status: z.enum([
        "SHIFT_ASSIGNED",
        "DAY_OFF",
        "LEAVE",
        "SICK",
        "HOLIDAY",
        "ABSENT_OVERLAY",
        "PENDING_CHANGE",
        "APPROVED_CHANGE",
        "CONFLICT",
        "DOUBLE_BOOKED",
        "OUTSIDE_EMPLOYMENT",
        "NOT_ACTIVE",
        "EMPTY",
      ]).optional(),
    }),
    query,
  );

export const validateRosterMatrixChangePayload = (input: unknown): RosterMatrixChangePayload =>
  parse(
    z.object({
      week_start: dateString.optional(),
      department_id: optionalId,
      outlet_id: optionalId,
      changes: z.array(z.object({
        employee_id: safeString,
        date: dateString,
        action: z.enum(["ASSIGN_SHIFT", "CHANGE_SHIFT", "CLEAR_SHIFT", "MARK_DAY_OFF"]),
        shift_template_id: optionalId,
        assignment_id: optionalId,
        reason: optionalText,
        note: optionalText,
        override_conflicts: z.coerce.boolean().optional(),
      })).min(1, "Add at least one roster change.").max(200),
      reason: reason.optional(),
    }),
    input,
  );

export const validateRosterMatrixScopePayload = (input: unknown): RosterMatrixChangePayload =>
  ({
    ...parse(
    z.object({
      week_start: dateString.optional(),
      department_id: optionalId,
      outlet_id: optionalId,
      changes: z.array(z.object({
        employee_id: safeString,
        date: dateString,
        action: z.enum(["ASSIGN_SHIFT", "CHANGE_SHIFT", "CLEAR_SHIFT", "MARK_DAY_OFF"]),
        shift_template_id: optionalId,
        assignment_id: optionalId,
        reason: optionalText,
        note: optionalText,
        override_conflicts: z.coerce.boolean().optional(),
      })).optional().default([]),
      reason: reason.optional(),
    }),
    input,
    ),
    changes: parse(
      z.object({ changes: z.array(z.unknown()).optional().default([]) }),
      input,
    ).changes as RosterMatrixChangePayload["changes"],
  });
