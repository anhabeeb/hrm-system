import { ValidationError } from "../../utils/errors";
import {
  EMPLOYEE_EXIT_OPERATION_TYPES,
  EMPLOYEE_EXIT_REQUEST_TYPES,
  OFFBOARDING_REQUEST_TYPES,
  RESIGNATION_REQUEST_TYPES,
  type EmployeeExitActionInput,
  type EmployeeExitFilters,
  type EmployeeExitRequestInput,
} from "./employee-exit.types";

const pageSize = (value: unknown) => Math.min(Math.max(Number(value) || 25, 1), 100);
const stringOrUndefined = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const stringOrNull = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

const sensitivePayloadKeys = new Set([
  "password",
  "password_hash",
  "token",
  "session_token",
  "reset_token",
  "totp_secret",
  "secret",
  "api_key",
  "device_secret",
]);

export const assertSafeLifecyclePayload = (value: unknown, path = "requested_value_json") => {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeLifecyclePayload(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (sensitivePayloadKeys.has(normalized) || normalized.includes("password") || normalized.includes("token") || normalized.includes("secret")) {
      throw new ValidationError(`Sensitive field ${path}.${key} cannot be stored in resignation or offboarding payloads.`);
    }
    assertSafeLifecyclePayload(nested, `${path}.${key}`);
  }
};

export const validateEmployeeExitFilters = (query: Record<string, unknown>): EmployeeExitFilters => ({
  employee_id: stringOrUndefined(query.employee_id),
  operation_type: stringOrUndefined(query.operation_type),
  request_type: stringOrUndefined(query.request_type),
  status: stringOrUndefined(query.status),
  department_id: stringOrUndefined(query.department_id),
  search: stringOrUndefined(query.search),
  page: Math.max(Number(query.page) || 1, 1),
  page_size: pageSize(query.page_size),
});

const inferOperationType = (requestType: string, provided?: string): "RESIGNATION" | "OFFBOARDING" => {
  if (provided) {
    if (!EMPLOYEE_EXIT_OPERATION_TYPES.includes(provided as any)) throw new ValidationError("Operation type is not supported for employee lifecycle requests.");
    return provided as "RESIGNATION" | "OFFBOARDING";
  }
  if (RESIGNATION_REQUEST_TYPES.includes(requestType as any)) return "RESIGNATION";
  if (OFFBOARDING_REQUEST_TYPES.includes(requestType as any)) return "OFFBOARDING";
  throw new ValidationError("Request type is not supported for resignation or offboarding.");
};

export const validateEmployeeExitRequest = (body: Record<string, unknown>): EmployeeExitRequestInput => {
  const requestType = stringOrUndefined(body.request_type);
  if (!requestType || !EMPLOYEE_EXIT_REQUEST_TYPES.includes(requestType as any)) {
    throw new ValidationError("Please choose a valid resignation or offboarding request type.");
  }
  const operationType = inferOperationType(requestType, stringOrUndefined(body.operation_type));
  if (!stringOrUndefined(body.reason)) throw new ValidationError("A reason is required for resignation or offboarding requests.");
  assertSafeLifecyclePayload(body.current_value_json, "current_value_json");
  assertSafeLifecyclePayload(body.requested_value_json, "requested_value_json");
  const resignationDate = stringOrNull(body.resignation_date);
  const requestedLastWorkingDate = stringOrNull(body.requested_last_working_date);
  if (resignationDate && requestedLastWorkingDate && requestedLastWorkingDate < resignationDate && requestType !== "IMMEDIATE_RESIGNATION") {
    throw new ValidationError("Last working date cannot be before resignation date unless this is an immediate resignation.");
  }
  return {
    employee_id: stringOrNull(body.employee_id),
    operation_type: operationType,
    request_type: requestType as EmployeeExitRequestInput["request_type"],
    reason: stringOrUndefined(body.reason)!,
    resignation_date: resignationDate,
    requested_last_working_date: requestedLastWorkingDate,
    approved_last_working_date: stringOrNull(body.approved_last_working_date),
    notice_period_days: body.notice_period_days == null || body.notice_period_days === "" ? null : Number(body.notice_period_days),
    notice_waiver_requested: Boolean(body.notice_waiver_requested),
    notice_waiver_approved: Boolean(body.notice_waiver_approved),
    exit_interview_required: Boolean(body.exit_interview_required),
    final_settlement_required: body.final_settlement_required === undefined ? true : Boolean(body.final_settlement_required),
    access_disable_required: body.access_disable_required === undefined ? true : Boolean(body.access_disable_required),
    handover_required: Boolean(body.handover_required),
    employee_note: stringOrNull(body.employee_note),
  };
};

export const validateEmployeeExitAction = (body: Record<string, unknown>, reasonRequired = true): EmployeeExitActionInput => {
  const reason = stringOrUndefined(body.reason);
  if (reasonRequired && !reason) throw new ValidationError("A reason is required for this resignation or offboarding action.");
  return { reason: reason ?? "Lifecycle action", note: stringOrNull(body.note) };
};
