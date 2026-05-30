import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PAYROLL_EXCEPTION_SEVERITIES, PAYROLL_EXCEPTION_STATUSES, PAYROLL_STATUSES } from "./payroll.constants";
import type {
  PayrollActionInput,
  PayrollCalculateInput,
  PayrollExceptionFilters,
  PayrollExceptionResolveInput,
  PayrollItemFilters,
  PayrollListFilters,
} from "./payroll.types";
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
const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));

export const isPayrollMonth = (value: string): boolean => /^\d{4}-\d{2}$/.test(value);
export const requirePayrollMonth = (value: unknown): string => {
  const month = asString(value);
  if (!month || !isPayrollMonth(month)) throw new ValidationError("Please select a valid payroll month.");
  return month;
};
export const requireReason = (value: unknown): string => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};

export const validatePayrollListFilters = (query: Record<string, unknown>): PayrollListFilters => {
  const status = asString(query.status);
  if (status && !PAYROLL_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid payroll status.");
  const sortBy = asString(query.sort_by) ?? "created_at";
  return {
    payroll_month: asString(query.payroll_month),
    status,
    outlet_id: asString(query.outlet_id),
    date_from: asString(query.date_from),
    date_to: asString(query.date_to),
    page: page(query.page),
    page_size: pageSize(query.page_size),
    sort_by: ["payroll_month", "status", "created_at", "updated_at"].includes(sortBy) ? sortBy : "created_at",
    sort_direction: asString(query.sort_direction)?.toLowerCase() === "asc" ? "asc" : "desc",
  };
};

export const validatePayrollCalculateInput = (payload: unknown): PayrollCalculateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeIds = Array.isArray(payload.employee_ids)
    ? payload.employee_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : undefined;
  return {
    payroll_month: requirePayrollMonth(payload.payroll_month),
    outlet_id: asString(payload.outlet_id),
    employee_ids: employeeIds,
    reason: asString(payload.reason),
  };
};

export const validatePayrollAction = (payload: unknown): PayrollActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};

export const validateItemFilters = (query: Record<string, unknown>): PayrollItemFilters => ({
  employee_id: asString(query.employee_id),
  outlet_id: asString(query.outlet_id),
  status: asString(query.status),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateExceptionFilters = (query: Record<string, unknown>): PayrollExceptionFilters => {
  const severity = asString(query.severity);
  const status = asString(query.status);
  if (severity && !PAYROLL_EXCEPTION_SEVERITIES.includes(severity as any)) throw new ValidationError("Please select a valid exception severity.");
  if (status && !PAYROLL_EXCEPTION_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid exception status.");
  return {
    severity,
    status,
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    exception_type: asString(query.exception_type),
    page: page(query.page),
    page_size: pageSize(query.page_size),
  };
};

export const validateExceptionResolve = (payload: unknown): PayrollExceptionResolveInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    reason: requireReason(payload.reason ?? payload.resolution_notes),
    resolution_notes: asString(payload.resolution_notes),
  };
};
