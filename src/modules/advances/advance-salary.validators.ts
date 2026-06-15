import { z } from "zod";

import {
  ADVANCE_SALARY_DEDUCTION_STATUSES,
  ADVANCE_SALARY_PAYMENT_STATUSES,
  ADVANCE_SALARY_REQUEST_TYPES,
  ADVANCE_SALARY_STATUSES,
  type AdvanceSalaryActionInput,
  type AdvanceSalaryFilters,
  type AdvanceSalaryInput,
  type AdvanceSalaryPaymentInput,
} from "./advance-salary.types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./advances.constants";
import { ValidationError } from "../../utils/errors";

const optionalId = z.string().trim().min(1).max(160).optional().nullable();
const optionalMonth = z.string().trim().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM format.").optional().nullable();
const optionalDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.").optional().nullable();
const reason = z.string().trim().min(3, "A reason is required.").max(1000);
const sensitivePayloadKey = /(password|password_hash|token|session_token|reset_token|totp_secret|secret|api_key|device_secret)/i;

const parse = <T>(schema: z.ZodType<T>, input: unknown, message = "Please review the advance salary request and try again."): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) fieldErrors[issue.path.join(".") || "form"] = issue.message;
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: "Sensitive fields cannot be stored in advance salary payloads." });
    }
    rejectSensitivePayload(nested, ctx, [...path, key]);
  }
};

export const validateAdvanceSalaryInput = (input: unknown): AdvanceSalaryInput =>
  parse(
    z.object({
      employee_id: optionalId,
      request_type: z.enum(ADVANCE_SALARY_REQUEST_TYPES),
      requested_amount: z.coerce.number().finite().positive("Requested amount must be greater than zero."),
      currency: z.string().trim().min(3).max(8).optional().nullable(),
      requested_payment_date: optionalDate,
      repayment_start_month: optionalMonth,
      repayment_months: z.coerce.number().int().positive().max(60).optional().nullable(),
      reason,
      employee_note: z.string().trim().max(1000).optional().nullable(),
      repayment_policy_json: z.record(z.string(), z.unknown()).optional().nullable(),
    }).superRefine((value, ctx) => rejectSensitivePayload(value.repayment_policy_json, ctx, ["repayment_policy_json"])),
    input,
  );

export const validateAdvanceSalaryAction = (input: unknown): AdvanceSalaryActionInput =>
  parse(z.object({ reason, notes: z.string().trim().max(2000).optional().nullable() }), input);

export const validateAdvanceSalaryPayment = (input: unknown): AdvanceSalaryPaymentInput =>
  parse(z.object({
    reason,
    payment_date: optionalDate,
    payment_method: z.string().trim().max(80).optional().nullable(),
    payment_reference: z.string().trim().max(160).optional().nullable(),
    bank_name: z.string().trim().max(160).optional().nullable(),
  }), input);

export const validateAdvanceSalaryFilters = (query: Record<string, unknown>): AdvanceSalaryFilters => {
  const parsed = parse(
    z.object({
      employee_id: z.string().trim().max(160).optional(),
      department_id: z.string().trim().max(160).optional(),
      outlet_id: z.string().trim().max(160).optional(),
      request_type: z.enum(ADVANCE_SALARY_REQUEST_TYPES).optional(),
      status: z.enum(ADVANCE_SALARY_STATUSES).optional(),
      payment_status: z.enum(ADVANCE_SALARY_PAYMENT_STATUSES).optional(),
      deduction_status: z.enum(ADVANCE_SALARY_DEDUCTION_STATUSES).optional(),
      approval_status: z.string().trim().max(60).optional(),
      payroll_month: z.string().trim().regex(/^\d{4}-\d{2}$/).optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    }),
    query,
  );
  return { ...parsed, page: parsed.page ?? 1, page_size: parsed.page_size ?? DEFAULT_PAGE_SIZE };
};
