import { z } from "zod";

import {
  PAYROLL_ADJUSTMENT_DIRECTIONS,
  PAYROLL_ADJUSTMENT_STATUSES,
  PAYROLL_ADJUSTMENT_TYPES,
  type PayrollAdjustmentActionInput,
  type PayrollAdjustmentFilters,
  type PayrollAdjustmentInput,
} from "./payroll-adjustments.types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./payroll.constants";
import { ValidationError } from "../../utils/errors";

const safeString = z.string().trim().min(1).max(160);
const optionalId = z.string().trim().min(1).max(160).optional().nullable();
const optionalMonth = z.string().trim().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM format.").optional().nullable();
const reason = z.string().trim().min(3, "A reason is required.").max(1000);
const sensitivePayloadKey = /(password|password_hash|token|session_token|reset_token|totp_secret|secret|api_key|device_secret)/i;

const parse = <T>(schema: z.ZodType<T>, input: unknown, message = "Please review the payroll adjustment form and try again."): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fieldErrors[issue.path.join(".") || "form"] = issue.message;
  }
  throw new ValidationError(message, fieldErrors);
};

const rejectSensitivePayload = (value: unknown, ctx: z.RefinementCtx, path: (string | number)[]) => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitivePayload(item, ctx, [...path, index]));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (sensitivePayloadKey.test(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: "Sensitive fields cannot be stored in payroll adjustment payloads." });
    }
    rejectSensitivePayload(nested, ctx, [...path, key]);
  }
};

export const validatePayrollAdjustmentInput = (input: unknown): PayrollAdjustmentInput =>
  parse(
    z.object({
      employee_id: optionalId,
      payroll_run_id: optionalId,
      payroll_item_id: optionalId,
      payslip_id: optionalId,
      adjustment_type: z.enum(PAYROLL_ADJUSTMENT_TYPES),
      adjustment_direction: z.enum(PAYROLL_ADJUSTMENT_DIRECTIONS),
      amount: z.coerce.number().finite().optional().nullable(),
      currency: z.string().trim().min(3).max(8).optional().nullable(),
      effective_payroll_month: optionalMonth,
      reason,
      current_value_json: z.record(z.string(), z.unknown()).optional().nullable(),
      requested_value_json: z.record(z.string(), z.unknown()).optional().nullable(),
    }).superRefine((value, ctx) => {
      rejectSensitivePayload(value.current_value_json, ctx, ["current_value_json"]);
      rejectSensitivePayload(value.requested_value_json, ctx, ["requested_value_json"]);
      if (value.adjustment_direction !== "NEUTRAL" && (!value.amount || value.amount === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "Amount must be non-zero for monetary payroll adjustments." });
      }
    }),
    input,
  );

export const validatePayrollAdjustmentAction = (input: unknown): PayrollAdjustmentActionInput =>
  parse(z.object({ reason, notes: z.string().trim().max(2000).optional().nullable() }), input);

export const validatePayrollAdjustmentFilters = (query: Record<string, unknown>): PayrollAdjustmentFilters => {
  const parsed = parse(
    z.object({
      employee_id: safeString.optional(),
      department_id: safeString.optional(),
      outlet_id: safeString.optional(),
      payroll_run_id: safeString.optional(),
      status: z.enum(PAYROLL_ADJUSTMENT_STATUSES).optional(),
      approval_status: z.string().trim().max(60).optional(),
      effective_payroll_month: z.string().trim().regex(/^\d{4}-\d{2}$/).optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    }),
    query,
  );
  return { ...parsed, page: parsed.page ?? 1, page_size: parsed.page_size ?? DEFAULT_PAGE_SIZE };
};
