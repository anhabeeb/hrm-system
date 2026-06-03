import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SALARY_LOAN_STATUSES } from "./salary-loans.constants";
import type { SalaryLoanActionInput, SalaryLoanFilters, SalaryLoanInput, SalaryLoanUpdateInput } from "./salary-loans.types";
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
const requireReason = (value: unknown) => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};
const requireMoney = (value: unknown, label: string) => {
  const amount = asNumber(value);
  if (!amount || !Number.isInteger(amount) || amount <= 0) throw new ValidationError(`${label} must be an integer minor unit value.`);
  return amount;
};

export const validateLoanFilters = (query: Record<string, unknown>): SalaryLoanFilters => {
  const status = asString(query.status);
  const startMonth = asString(query.start_month);
  if (status && !SALARY_LOAN_STATUSES.includes(status as any)) throw new ValidationError("Please select a valid salary loan status.");
  if (startMonth && !isMonth(startMonth)) throw new ValidationError("Please select a valid start month.");
  return {
    employee_id: asString(query.employee_id),
    outlet_id: asString(query.outlet_id),
    status,
    start_month: startMonth,
    page: page(query.page),
    page_size: pageSize(query.page_size),
  };
};
export const validateLoanCreate = (payload: unknown): SalaryLoanInput => {
  if (!isObject(payload)) throw new ValidationError();
  const employeeId = asString(payload.employee_id);
  const startMonth = asString(payload.start_month);
  if (!employeeId) throw new ValidationError("Employee is required.");
  if (!startMonth || !isMonth(startMonth)) throw new ValidationError("Please select a valid start month.");
  const loanAmount = requireMoney(payload.loan_amount, "Loan amount");
  const installmentAmount = requireMoney(payload.installment_amount, "Installment amount");
  if (installmentAmount > loanAmount) throw new ValidationError("Installment amount cannot exceed the loan amount.");
  return { employee_id: employeeId, loan_amount: loanAmount, installment_amount: installmentAmount, start_month: startMonth, reason: requireReason(payload.reason) };
};
export const validateLoanUpdate = (payload: unknown): SalaryLoanUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const startMonth = asString(payload.start_month);
  if (startMonth && !isMonth(startMonth)) throw new ValidationError("Please select a valid start month.");
  return {
    employee_id: asString(payload.employee_id),
    loan_amount: payload.loan_amount === undefined ? undefined : requireMoney(payload.loan_amount, "Loan amount"),
    installment_amount: payload.installment_amount === undefined ? undefined : requireMoney(payload.installment_amount, "Installment amount"),
    start_month: startMonth,
    reason: requireReason(payload.reason),
  };
};
export const validateLoanAction = (payload: unknown): SalaryLoanActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: requireReason(payload.reason) };
};
