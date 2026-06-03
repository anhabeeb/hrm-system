import { DEFAULT_PAGE_SIZE, LONG_LEAVE_STATUSES, MAX_PAGE_SIZE } from "./long-leave.constants";
import type {
  LongLeaveActionInput,
  LongLeaveCreateInput,
  LongLeaveFilters,
  LongLeaveOverrideInput,
  LongLeaveReturnInput,
} from "./long-leave.types";
import { ValidationError } from "../../utils/errors";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return undefined;
};
const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));

export const isValidDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

const requireDate = (value: unknown, message: string) => {
  const date = asString(value);
  if (!date || !isValidDate(date)) throw new ValidationError(message);
  return date;
};

const requireReason = (value: unknown) => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};

export const validateLongLeaveFilters = (query: Record<string, unknown>): LongLeaveFilters => {
  const status = asString(query.status);
  if (status && !LONG_LEAVE_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid long leave status.");
  return {
    status,
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    date_from: asString(query.date_from),
    date_to: asString(query.date_to),
    page: page(query.page),
    page_size: pageSize(query.page_size),
  };
};

export const validateLongLeaveCreate = (payload: unknown): LongLeaveCreateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const leaveRequestId = asString(payload.leave_request_id);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!leaveRequestId) throw new ValidationError("Leave request is required for long leave.");
  const startDate = requireDate(payload.start_date, "Please choose a valid long leave start date.");
  const expectedReturnDate = requireDate(payload.expected_return_date, "Please choose a valid expected return date.");
  if (expectedReturnDate < startDate) throw new ValidationError("Expected return date must be after the start date.");
  return {
    employee_id: employeeId,
    leave_request_id: leaveRequestId,
    start_date: startDate,
    expected_return_date: expectedReturnDate,
    reason: requireReason(payload.reason),
    allow_short_leave_override: asBoolean(payload.allow_short_leave_override),
  };
};

export const validateLongLeaveAction = (payload: unknown): LongLeaveActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};

export const validateLongLeaveReturn = (payload: unknown): LongLeaveReturnInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    actual_return_date: requireDate(payload.actual_return_date, "Please choose a valid return date."),
    reason: requireReason(payload.reason),
  };
};

export const validateLongLeaveOverride = (payload: unknown): LongLeaveOverrideInput => {
  if (!isObject(payload)) throw new ValidationError();
  const payrollMonth = asString(payload.payroll_month);
  const overrideAmount = asNumber(payload.override_amount);
  if (!payrollMonth || !/^\d{4}-\d{2}$/.test(payrollMonth)) throw new ValidationError("Please select a valid payroll month.");
  if (overrideAmount === undefined || !Number.isInteger(overrideAmount)) {
    throw new ValidationError("Override amount must be an integer minor unit value.");
  }
  return {
    payroll_month: payrollMonth,
    override_amount: overrideAmount,
    reason: requireReason(payload.reason),
  };
};
