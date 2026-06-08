import { DEFAULT_PAGE_SIZE, LONG_LEAVE_STATUSES, MAX_PAGE_SIZE } from "./long-leave.constants";
import type {
  LongLeaveActionInput,
  LongLeaveCreateInput,
  LongLeaveExtendInput,
  LongLeaveFilters,
  LongLeaveOverrideInput,
  LongLeaveReturnInput,
  LongLeaveSettingsInput,
  LongLeaveUpdateInput,
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

const allowedSalaryTreatments = ["unpaid", "paid", "partially_paid", "custom"];
const allowedDeductionMethods = ["calendar_days", "working_days", "scheduled_roster_days", "attendance_days"];
const allowedSalaryRules = ["monthly_deduction", "pay_only_worked_days"];
const allowedPayableDaysPolicies = ["monthly_deduction", "pay_only_worked_days"];

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
  if (!employeeId) throw new ValidationError("Employee is required.");
  const startDate = requireDate(payload.start_date, "Please choose a valid long leave start date.");
  const expectedReturnDate = requireDate(payload.expected_return_date, "Please choose a valid expected return date.");
  if (expectedReturnDate < startDate) throw new ValidationError("Expected return date must be after the start date.");
  return {
    employee_id: employeeId,
    leave_request_id: asString(payload.leave_request_id) ?? "",
    start_date: startDate,
    expected_return_date: expectedReturnDate,
    reason: requireReason(payload.reason),
    notes: asString(payload.notes),
    salary_treatment: validateOptionalChoice(payload.salary_treatment, allowedSalaryTreatments, "Please choose a valid salary treatment."),
    deduction_method: validateOptionalChoice(payload.deduction_method, allowedDeductionMethods, "Please choose a valid deduction method."),
    payable_days_policy: validateOptionalChoice(payload.payable_days_policy, allowedPayableDaysPolicies, "Please choose a valid payable-days policy."),
    allow_short_leave_override: asBoolean(payload.allow_short_leave_override),
    allow_local_override: asBoolean(payload.allow_local_override),
  };
};

export const validateLongLeaveUpdate = (payload: unknown): LongLeaveUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const startDate = payload.start_date === undefined ? undefined : requireDate(payload.start_date, "Please choose a valid long leave start date.");
  const expectedReturnDate = payload.expected_return_date === undefined ? undefined : requireDate(payload.expected_return_date, "Please choose a valid expected return date.");
  if (startDate && expectedReturnDate && expectedReturnDate < startDate) throw new ValidationError("Expected return date must be after the start date.");
  return {
    start_date: startDate,
    expected_return_date: expectedReturnDate,
    reason: requireReason(payload.reason),
    notes: asString(payload.notes),
    salary_treatment: validateOptionalChoice(payload.salary_treatment, allowedSalaryTreatments, "Please choose a valid salary treatment."),
    deduction_method: validateOptionalChoice(payload.deduction_method, allowedDeductionMethods, "Please choose a valid deduction method."),
    payable_days_policy: validateOptionalChoice(payload.payable_days_policy, allowedPayableDaysPolicies, "Please choose a valid payable-days policy."),
  };
};

function validateOptionalChoice(value: unknown, allowed: string[], message: string) {
  const text = asString(value);
  if (!text) return undefined;
  if (!allowed.includes(text)) throw new ValidationError(message);
  return text;
}

export const validateLongLeaveAction = (payload: unknown): LongLeaveActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};

export const validateLongLeaveReturn = (payload: unknown): LongLeaveReturnInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    actual_return_date: requireDate(payload.actual_return_date, "Please choose a valid return date."),
    reason: requireReason(payload.reason),
    return_notes: asString(payload.return_notes),
  };
};

export const validateLongLeaveExtend = (payload: unknown): LongLeaveExtendInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    new_expected_return_date: requireDate(payload.new_expected_return_date, "Please choose a valid new expected return date."),
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

export const validateLongLeaveSettings = (payload: unknown): LongLeaveSettingsInput => {
  if (!isObject(payload)) throw new ValidationError();
  const triggerDays = asNumber(payload.trigger_days);
  const maxContinuousDays = payload.max_continuous_days === null ? null : asNumber(payload.max_continuous_days);
  const partialPayRatio = asNumber(payload.partial_pay_ratio);
  if (triggerDays !== undefined && (!Number.isInteger(triggerDays) || triggerDays < 1)) {
    throw new ValidationError("Minimum long leave days must be a positive whole number.");
  }
  if (maxContinuousDays !== undefined && maxContinuousDays !== null && (!Number.isInteger(maxContinuousDays) || maxContinuousDays < 1)) {
    throw new ValidationError("Maximum continuous days must be a positive whole number.");
  }
  if (partialPayRatio !== undefined && (partialPayRatio < 0 || partialPayRatio > 1)) {
    throw new ValidationError("Partial pay ratio must be between 0 and 1.");
  }
  return {
    is_enabled: asBoolean(payload.is_enabled),
    applies_to_foreigners: asBoolean(payload.applies_to_foreigners),
    applies_to_locals: asBoolean(payload.applies_to_locals),
    trigger_days: triggerDays,
    max_continuous_days: maxContinuousDays,
    salary_rule: validateOptionalChoice(payload.salary_rule, allowedSalaryRules, "Please choose a valid salary rule."),
    require_salary_impact_preview: asBoolean(payload.require_salary_impact_preview),
    pay_only_worked_days: asBoolean(payload.pay_only_worked_days),
    deduct_full_salary_if_zero_worked_days: asBoolean(payload.deduct_full_salary_if_zero_worked_days),
    count_holidays_inside_leave: asBoolean(payload.count_holidays_inside_leave),
    pay_holidays_during_long_leave: asBoolean(payload.pay_holidays_during_long_leave),
    pay_weekly_off_days_during_long_leave: asBoolean(payload.pay_weekly_off_days_during_long_leave),
    allow_hr_override: asBoolean(payload.allow_hr_override),
    default_salary_treatment: validateOptionalChoice(payload.default_salary_treatment, allowedSalaryTreatments, "Please choose a valid default salary treatment."),
    default_deduction_method: validateOptionalChoice(payload.default_deduction_method, allowedDeductionMethods, "Please choose a valid default deduction method."),
    require_payroll_review: asBoolean(payload.require_payroll_review),
    require_return_to_work_confirmation: asBoolean(payload.require_return_to_work_confirmation),
    approval_required: asBoolean(payload.approval_required),
    partial_pay_ratio: partialPayRatio,
    reason: requireReason(payload.reason),
  };
};
