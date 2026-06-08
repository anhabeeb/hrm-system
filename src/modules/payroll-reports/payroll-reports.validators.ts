import { ValidationError } from "../../utils/errors";
import type { PayrollReportFilters } from "./payroll-reports.types";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const DAY_MS = 86_400_000;
const SORT_ALLOWLIST = new Set([
  "payroll_month",
  "employee_code",
  "employee_name",
  "payroll_status",
  "payslip_status",
  "created_at",
  "finalized_at",
  "net_payable_salary",
  "gross_salary",
]);

const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asBoolean = (value: unknown) => {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
};
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

const employeeType = (value: unknown): PayrollReportFilters["employee_type"] => {
  const input = asString(value);
  if (!input) return undefined;
  if (["local", "foreign", "all"].includes(input)) return input as PayrollReportFilters["employee_type"];
  throw new ValidationError("Please choose a valid employee type filter.");
};

const sortBy = (value: unknown) => {
  const input = asString(value);
  return input && SORT_ALLOWLIST.has(input) ? input : undefined;
};

const sortDirection = (value: unknown): PayrollReportFilters["sort_direction"] => {
  const input = asString(value)?.toLowerCase();
  return input === "asc" ? "asc" : "desc";
};

export const validatePayrollReportFilters = (
  input: Record<string, unknown>,
  options: { periodRequired?: boolean } = {},
): PayrollReportFilters => {
  const payrollMonth = asString(input.payroll_month) ?? asString(input.month);
  const defaultTo = today();
  const defaultFrom = options.periodRequired && !payrollMonth ? addDays(defaultTo, -365) : undefined;
  const fromDate = asString(input.from_date) ?? defaultFrom;
  const toDate = asString(input.to_date) ?? (fromDate ? defaultTo : undefined);

  if (fromDate && toDate && fromDate > toDate) {
    throw new ValidationError("Start date must be before end date.");
  }

  const page = Math.max(1, Math.trunc(asNumber(input.page) ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(input.page_size) ?? DEFAULT_PAGE_SIZE)));

  return {
    payroll_month: payrollMonth,
    payroll_period_id: asString(input.payroll_period_id),
    payroll_run_id: asString(input.payroll_run_id),
    from_date: fromDate,
    to_date: toDate,
    month: payrollMonth,
    year: asString(input.year),
    employee_id: asString(input.employee_id),
    outlet_id: asString(input.outlet_id),
    department_id: asString(input.department_id),
    position_id: asString(input.position_id),
    employee_type: employeeType(input.employee_type),
    payroll_status: asString(input.payroll_status),
    payslip_status: asString(input.payslip_status),
    approval_status: asString(input.approval_status),
    deduction_type: asString(input.deduction_type),
    component_type: asString(input.component_type),
    payment_status: asString(input.payment_status),
    variance_threshold: asNumber(input.variance_threshold),
    include_archived: asBoolean(input.include_archived) ?? false,
    search: asString(input.search),
    page,
    page_size: pageSize,
    sort_by: sortBy(input.sort_by),
    sort_direction: sortDirection(input.sort_direction),
  };
};
