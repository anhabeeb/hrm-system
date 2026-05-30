import {
  LEAVE_POLICY_STATUSES,
  LEAVE_REQUEST_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./leave.constants";
import type {
  LeaveActionInput,
  LeaveBalanceAdjustInput,
  LeaveBalanceFilters,
  LeaveCalendarFilters,
  LeavePolicyFilters,
  LeavePolicyInput,
  LeavePolicyUpdateInput,
  LeaveRequestFilters,
  LeaveRequestInput,
  LeaveRequestUpdateInput,
  LeaveTypeFilters,
  LeaveTypeUpdateInput,
} from "./leave.types";
import { ValidationError } from "../../utils/errors";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const asOptionalString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return asString(value);
};

const asNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const asBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return undefined;
};

const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) =>
  Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));

export const isValidDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

const requireDate = (value: unknown, message = "Please choose a valid date."): string => {
  const date = asString(value);
  if (!date || !isValidDate(date)) throw new ValidationError(message);
  return date;
};

export const validateDateRange = (startDate: string, endDate: string) => {
  if (startDate > endDate) {
    throw new ValidationError("Start date must be before or equal to end date.");
  }
};

const requireReason = (value: unknown): string => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};

export const validateLeaveTypeFilters = (query: Record<string, unknown>): LeaveTypeFilters => ({
  is_enabled: asString(query.is_enabled),
  is_statutory: asString(query.is_statutory),
  is_paid: asString(query.is_paid),
  search: asString(query.search),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateLeaveTypeUpdate = (payload: unknown): LeaveTypeUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const defaultDays = asNumber(payload.default_days);
  if (defaultDays !== undefined && (!Number.isInteger(defaultDays) || defaultDays < 0)) {
    throw new ValidationError("Please enter a valid number of leave days.");
  }
  return {
    is_enabled: asBoolean(payload.is_enabled),
    default_days: payload.default_days === null ? null : defaultDays,
    requires_attachment: asBoolean(payload.requires_attachment),
    affects_payroll: asBoolean(payload.affects_payroll),
    reason: requireReason(payload.reason),
  };
};

export const validatePolicyFilters = (query: Record<string, unknown>): LeavePolicyFilters => ({
  employee_type: asString(query.employee_type),
  leave_type_id: asString(query.leave_type_id),
  status: asString(query.status),
  effective_from: asString(query.effective_from),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validatePolicyCreate = (payload: unknown): LeavePolicyInput => {
  if (!isObject(payload)) throw new ValidationError();
  const policyName = asString(payload.policy_name);
  const leaveTypeId = asString(payload.leave_type_id);
  const entitlementDays = asNumber(payload.entitlement_days);
  const effectiveFrom = requireDate(payload.effective_from, "Please choose a valid effective date.");
  const status = asString(payload.status);
  if (!policyName) throw new ValidationError("Policy name is required.");
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  if (entitlementDays === undefined || entitlementDays < 0) throw new ValidationError("Please enter a valid entitlement amount.");
  if (status && !LEAVE_POLICY_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid policy status.");
  return {
    policy_name: policyName,
    employee_type: asOptionalString(payload.employee_type),
    leave_type_id: leaveTypeId,
    entitlement_days: entitlementDays,
    carry_forward_days: asNumber(payload.carry_forward_days) ?? 0,
    allow_negative_balance: asBoolean(payload.allow_negative_balance) ?? false,
    max_continuous_days: payload.max_continuous_days === null ? null : asNumber(payload.max_continuous_days),
    effective_from: effectiveFrom,
    effective_to: asOptionalString(payload.effective_to),
    status,
    reason: requireReason(payload.reason),
  };
};

export const validatePolicyUpdate = (payload: unknown): LeavePolicyUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const status = asString(payload.status);
  if (status && !LEAVE_POLICY_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid policy status.");
  const entitlementDays = asNumber(payload.entitlement_days);
  if (entitlementDays !== undefined && entitlementDays < 0) throw new ValidationError("Please enter a valid entitlement amount.");
  return {
    policy_name: asString(payload.policy_name),
    employee_type: asOptionalString(payload.employee_type),
    leave_type_id: asString(payload.leave_type_id),
    entitlement_days: entitlementDays,
    carry_forward_days: asNumber(payload.carry_forward_days),
    allow_negative_balance: asBoolean(payload.allow_negative_balance),
    max_continuous_days: payload.max_continuous_days === null ? null : asNumber(payload.max_continuous_days),
    effective_from: payload.effective_from ? requireDate(payload.effective_from, "Please choose a valid effective date.") : undefined,
    effective_to: asOptionalString(payload.effective_to),
    status,
    reason: requireReason(payload.reason),
  };
};

export const validateBalanceFilters = (query: Record<string, unknown>): LeaveBalanceFilters => ({
  employee_id: asString(query.employee_id),
  outlet_id: asString(query.outlet_id),
  department_id: asString(query.department_id),
  leave_type_id: asString(query.leave_type_id),
  year: asNumber(query.year),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateBalanceAdjust = (payload: unknown): LeaveBalanceAdjustInput => {
  if (!isObject(payload)) throw new ValidationError();
  const leaveTypeId = asString(payload.leave_type_id);
  const year = asNumber(payload.year);
  const adjustmentDays = asNumber(payload.adjustment_days);
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  if (!year || !Number.isInteger(year)) throw new ValidationError("Please select a valid leave year.");
  if (adjustmentDays === undefined || !Number.isFinite(adjustmentDays)) throw new ValidationError("Please enter a valid adjustment amount.");
  return {
    leave_type_id: leaveTypeId,
    year,
    adjustment_days: adjustmentDays,
    reason: requireReason(payload.reason),
  };
};

export const validateRequestFilters = (query: Record<string, unknown>): LeaveRequestFilters => {
  const status = asString(query.status);
  if (status && !LEAVE_REQUEST_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid leave status.");
  const sortBy = asString(query.sort_by) ?? "created_at";
  const allowedSort = ["created_at", "start_date", "end_date", "employee_name", "leave_type_name", "status"];
  return {
    status,
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    department_id: asString(query.department_id),
    leave_type_id: asString(query.leave_type_id),
    date_from: asString(query.date_from),
    date_to: asString(query.date_to),
    employee_type: asString(query.employee_type),
    page: page(query.page),
    page_size: pageSize(query.page_size),
    sort_by: allowedSort.includes(sortBy) ? sortBy : "created_at",
    sort_direction: asString(query.sort_direction)?.toLowerCase() === "asc" ? "asc" : "desc",
  };
};

export const validateLeaveRequestCreate = (payload: unknown): LeaveRequestInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const leaveTypeId = asString(payload.leave_type_id);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!leaveTypeId) throw new ValidationError("Leave type is required.");
  const startDate = requireDate(payload.start_date, "Please choose a valid leave start date.");
  const endDate = requireDate(payload.end_date, "Please choose a valid leave end date.");
  validateDateRange(startDate, endDate);
  return {
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    start_date: startDate,
    end_date: endDate,
    reason: asOptionalString(payload.reason),
  };
};

export const validateLeaveRequestUpdate = (payload: unknown): LeaveRequestUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const startDate = payload.start_date ? requireDate(payload.start_date, "Please choose a valid leave start date.") : undefined;
  const endDate = payload.end_date ? requireDate(payload.end_date, "Please choose a valid leave end date.") : undefined;
  if (startDate && endDate) validateDateRange(startDate, endDate);
  return {
    employee_id: asString(payload.employee_id),
    leave_type_id: asString(payload.leave_type_id),
    start_date: startDate,
    end_date: endDate,
    reason: asOptionalString(payload.reason),
  };
};

export const validateLeaveAction = (payload: unknown): LeaveActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};

export const validateCalendarFilters = (query: Record<string, unknown>): LeaveCalendarFilters => ({
  date_from: asString(query.date_from),
  date_to: asString(query.date_to),
  outlet_id: asString(query.outlet_id),
  employee_id: asString(query.employee_id),
  leave_type_id: asString(query.leave_type_id),
  status: asString(query.status),
});
