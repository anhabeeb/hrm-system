import { ValidationError } from "../../utils/errors";
import {
  EMPLOYEE_STRUCTURE_CHANGE_OPERATIONS,
  EMPLOYEE_STRUCTURE_CHANGE_REQUEST_TYPES,
  EMPLOYEE_TRANSFER_REQUEST_TYPES,
  type EmployeeStructureChangeActionInput,
  type EmployeeStructureChangeFilters,
  type EmployeeStructureChangeInput,
  type EmployeeStructureChangeOperation,
  type EmployeeStructureChangeRequestType,
} from "./employee-structure-change.types";

const clampPageSize = (value?: string | number) => Math.min(Math.max(Number(value) || 25, 1), 100);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asBool = (value: unknown) => value === true || value === "true" || value === 1 || value === "1";
const sensitiveKeys = new Set(["password", "password_hash", "token", "session_token", "reset_token", "totp_secret", "secret", "api_key", "device_secret"]);

export const assertSafeEmployeeStructurePayload = (value: unknown, path = "payload") => {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeEmployeeStructurePayload(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (sensitiveKeys.has(normalized) || normalized.includes("password") || normalized.includes("token") || normalized.includes("secret")) {
      throw new ValidationError(`Sensitive field ${path}.${key} cannot be stored in employee structure change requests.`);
    }
    assertSafeEmployeeStructurePayload(nested, `${path}.${key}`);
  }
};

export const deriveOperationType = (requestType: EmployeeStructureChangeRequestType): EmployeeStructureChangeOperation =>
  (EMPLOYEE_TRANSFER_REQUEST_TYPES as readonly string[]).includes(requestType) ? "EMPLOYEE_TRANSFER" : "EMPLOYEE_STRUCTURE_CHANGE";

export const validateEmployeeStructureChangeFilters = (query: Record<string, string | undefined>): EmployeeStructureChangeFilters => ({
  employee_id: query.employee_id,
  operation_type: query.operation_type,
  request_type: query.request_type,
  status: query.status,
  department_id: query.department_id,
  search: query.search?.trim() || undefined,
  page: Math.max(Number(query.page) || 1, 1),
  page_size: clampPageSize(query.page_size),
});

export const validateEmployeeStructureChangeRequest = (body: unknown): EmployeeStructureChangeInput => {
  const input = (body ?? {}) as Record<string, unknown>;
  assertSafeEmployeeStructurePayload(input, "request");
  const requestType = asString(input.request_type) as EmployeeStructureChangeRequestType | undefined;
  if (!requestType || !EMPLOYEE_STRUCTURE_CHANGE_REQUEST_TYPES.includes(requestType)) {
    throw new ValidationError("Structure change request type is not supported.");
  }
  const operationType = asString(input.operation_type) as EmployeeStructureChangeOperation | undefined;
  if (operationType && !EMPLOYEE_STRUCTURE_CHANGE_OPERATIONS.includes(operationType)) {
    throw new ValidationError("Structure change operation type is not supported.");
  }
  const reason = asString(input.reason);
  if (!reason) throw new ValidationError("A reason is required for employee transfer or structure change requests.");
  const derivedOperation = deriveOperationType(requestType);
  if (operationType && operationType !== derivedOperation) {
    throw new ValidationError("Operation type must match the selected employee structure request type.");
  }
  return {
    employee_id: asString(input.employee_id) ?? null,
    operation_type: derivedOperation,
    request_type: requestType,
    requested_department_id: asString(input.requested_department_id) ?? null,
    requested_position_id: asString(input.requested_position_id) ?? null,
    requested_outlet_id: asString(input.requested_outlet_id) ?? asString(input.requested_store_id) ?? null,
    requested_store_id: asString(input.requested_store_id) ?? null,
    requested_reporting_manager_employee_id: asString(input.requested_reporting_manager_employee_id) ?? null,
    requested_department_head_employee_id: asString(input.requested_department_head_employee_id) ?? null,
    apply_role_template: asBool(input.apply_role_template),
    effective_date: asString(input.effective_date) ?? null,
    reason,
  };
};

export const validateEmployeeStructureChangeAction = (body: unknown): EmployeeStructureChangeActionInput => {
  const input = (body ?? {}) as Record<string, unknown>;
  const reason = asString(input.reason);
  if (!reason) throw new ValidationError("A reason is required.");
  return {
    reason,
    note: asString(input.note) ?? null,
  };
};
