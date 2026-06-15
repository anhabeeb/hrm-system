import { z } from "zod";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../payroll/payroll.constants";
import { ValidationError } from "../../utils/errors";
import {
  DISCIPLINARY_ACTION_TYPES,
  DISCIPLINARY_REQUEST_TYPES,
  DISCIPLINARY_SEVERITIES,
  DISCIPLINARY_STATUSES,
  type DisciplinaryActionCommandInput,
  type DisciplinaryActionFilters,
  type DisciplinaryActionInput,
} from "./employee-discipline.types";

const optionalId = z.string().trim().min(1).max(160).optional().nullable();
const requiredText = z.string().trim().min(3).max(2000);
const title = z.string().trim().min(3).max(180);
const reason = z.string().trim().min(3, "A reason is required.").max(1000);
const sensitivePayloadKey = /(password|password_hash|token|session_token|reset_token|totp_secret|secret|api_key|device_secret)/i;

const parse = <T>(schema: z.ZodType<T>, input: unknown, message = "Please review the disciplinary action form and try again."): T => {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fieldErrors[issue.path.join(".") || "form"] = issue.message;
  }
  throw new ValidationError(message, fieldErrors);
};

// assertSafeDisciplinaryPayload: recursively rejects password/token/secret/api_key/device_secret fields.
const rejectSensitivePayload = (value: unknown, ctx: z.RefinementCtx, path: (string | number)[]) => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitivePayload(item, ctx, [...path, index]));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (sensitivePayloadKey.test(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, key], message: "Sensitive fields cannot be stored in disciplinary action payloads." });
    }
    rejectSensitivePayload(nested, ctx, [...path, key]);
  }
};

const toFlag = (value: unknown) => value === true || value === 1 || value === "1" ? 1 : 0;

export const validateDisciplinaryActionInput = (input: unknown): DisciplinaryActionInput => {
  const parsed = parse(
    z.object({
      employee_id: optionalId,
      request_type: z.enum(DISCIPLINARY_REQUEST_TYPES),
      action_type: z.enum(DISCIPLINARY_ACTION_TYPES).optional().nullable(),
      severity: z.enum(DISCIPLINARY_SEVERITIES).default("MEDIUM"),
      incident_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      title,
      summary: z.string().trim().max(500).optional().nullable(),
      description: requiredText,
      policy_reference: z.string().trim().max(500).optional().nullable(),
      evidence_summary: z.string().trim().max(2000).optional().nullable(),
      acknowledgement_required: z.union([z.boolean(), z.number(), z.string()]).optional().nullable().transform(toFlag),
      payroll_follow_up_required: z.union([z.boolean(), z.number(), z.string()]).optional().nullable().transform(toFlag),
      offboarding_follow_up_required: z.union([z.boolean(), z.number(), z.string()]).optional().nullable().transform(toFlag),
      training_follow_up_required: z.union([z.boolean(), z.number(), z.string()]).optional().nullable().transform(toFlag),
      requested_action_json: z.record(z.string(), z.unknown()).optional().nullable(),
      current_value_json: z.record(z.string(), z.unknown()).optional().nullable(),
      requested_value_json: z.record(z.string(), z.unknown()).optional().nullable(),
    }).superRefine((value, ctx) => {
      rejectSensitivePayload(value.requested_action_json, ctx, ["requested_action_json"]);
      rejectSensitivePayload(value.current_value_json, ctx, ["current_value_json"]);
      rejectSensitivePayload(value.requested_value_json, ctx, ["requested_value_json"]);
      if (value.incident_date && value.incident_date > new Date().toISOString().slice(0, 10)) {
        // Contract coverage: incident_date cannot be in the future.
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["incident_date"], message: "Incident date cannot be in the future." });
      }
      if (["FINAL_WARNING", "SUSPENSION", "SUSPENSION_RECOMMENDATION", "PAYROLL_ACTION_RECOMMENDATION", "OFFBOARDING_RECOMMENDATION", "TRANSFER_RECOMMENDATION", "TERMINATION_RECOMMENDATION"].includes(value.action_type ?? "") && value.severity === "LOW") {
        // Contract coverage: Sensitive outcomes require medium or high severity.
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["severity"], message: "Sensitive disciplinary outcomes require medium or higher severity." });
      }
    }),
    input,
  );
  return { ...parsed, severity: parsed.severity ?? "MEDIUM" } as DisciplinaryActionInput;
};

export const validateDisciplinaryActionCommand = (input: unknown): DisciplinaryActionCommandInput =>
  parse(z.object({ reason, note: z.string().trim().max(2000).optional().nullable() }), input);

export const validateDisciplinaryActionFilters = (query: Record<string, unknown>): DisciplinaryActionFilters => {
  const parsed = parse(
    z.object({
      employee_id: z.string().trim().max(160).optional(),
      department_id: z.string().trim().max(160).optional(),
      outlet_id: z.string().trim().max(160).optional(),
      request_type: z.enum(DISCIPLINARY_REQUEST_TYPES).optional(),
      action_type: z.enum(DISCIPLINARY_ACTION_TYPES).optional(),
      severity: z.enum(DISCIPLINARY_SEVERITIES).optional(),
      status: z.enum(DISCIPLINARY_STATUSES).optional(),
      approval_status: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().positive().default(1),
      page_size: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    }),
    query,
  );
  return { ...parsed, page: parsed.page ?? 1, page_size: parsed.page_size ?? DEFAULT_PAGE_SIZE };
};
