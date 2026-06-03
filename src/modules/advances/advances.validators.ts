import { ADVANCE_STATUSES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./advances.constants";
import type { AdvanceActionInput, AdvanceFilters, AdvanceInput, AdvanceUpdateInput } from "./advances.types";
import { ValidationError } from "../../utils/errors";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));
const isMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const requireReason = (value: unknown) => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};
const requireMinorUnits = (value: unknown, label = "Amount") => {
  const amount = asNumber(value);
  if (!amount || !Number.isInteger(amount) || amount <= 0) throw new ValidationError(`${label} must be an integer minor unit value.`);
  return amount;
};

export const validateAdvanceFilters = (query: Record<string, unknown>): AdvanceFilters => {
  const status = asString(query.status);
  const dateFrom = asString(query.date_from);
  const dateTo = asString(query.date_to);
  if (status && !ADVANCE_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid advance status.");
  if (dateFrom && !isDate(dateFrom)) throw new ValidationError("Please choose a valid start date.");
  if (dateTo && !isDate(dateTo)) throw new ValidationError("Please choose a valid end date.");
  if (dateFrom && dateTo && dateFrom > dateTo) throw new ValidationError("Start date must be before or equal to end date.");
  return {
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    status,
    deduction_month: asString(query.deduction_month),
    date_from: dateFrom,
    date_to: dateTo,
    page: page(query.page),
    page_size: pageSize(query.page_size),
  };
};

export const validateAdvanceCreate = (payload: unknown): AdvanceInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const paidDate = asString(payload.paid_date);
  const deductionMonth = asString(payload.deduction_month);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!paidDate || !isDate(paidDate)) throw new ValidationError("Please choose a valid paid date.");
  if (!deductionMonth || !isMonth(deductionMonth)) throw new ValidationError("Please select a valid deduction month.");
  return {
    employee_id: employeeId,
    amount: requireMinorUnits(payload.amount),
    paid_date: paidDate,
    deduction_month: deductionMonth,
    reason: requireReason(payload.reason),
  };
};

export const validateAdvanceUpdate = (payload: unknown): AdvanceUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const deductionMonth = asString(payload.deduction_month);
  const paidDate = asString(payload.paid_date);
  if (deductionMonth && !isMonth(deductionMonth)) throw new ValidationError("Please select a valid deduction month.");
  if (paidDate && !isDate(paidDate)) throw new ValidationError("Please choose a valid paid date.");
  return {
    employee_id: asString(payload.employee_id),
    amount: payload.amount === undefined ? undefined : requireMinorUnits(payload.amount),
    paid_date: paidDate,
    deduction_month: deductionMonth,
    reason: requireReason(payload.reason),
  };
};

export const validateAdvanceAction = (payload: unknown): AdvanceActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};
