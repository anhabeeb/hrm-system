import { ValidationError } from "../../utils/errors";
import type { HrReportFilters } from "./hr-reports.types";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const DAY_MS = 86_400_000;
const SORT_ALLOWLIST = new Set([
  "employee_code",
  "employee_name",
  "full_name",
  "employment_status",
  "employee_type",
  "joined_at",
  "start_date",
  "end_date",
  "expiry_date",
  "created_at",
  "updated_at",
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

const employeeType = (value: unknown): HrReportFilters["employee_type"] => {
  const input = asString(value);
  if (!input) return undefined;
  if (["local", "foreign", "all"].includes(input)) return input as HrReportFilters["employee_type"];
  throw new ValidationError("Please choose a valid employee type filter.");
};

const sortDirection = (value: unknown): HrReportFilters["sort_direction"] => {
  const input = asString(value)?.toLowerCase();
  return input === "asc" ? "asc" : "desc";
};

const sortBy = (value: unknown) => {
  const input = asString(value);
  return input && SORT_ALLOWLIST.has(input) ? input : undefined;
};

export const validateHrReportFilters = (
  input: Record<string, unknown>,
  options: { historyRequired?: boolean } = {},
): HrReportFilters => {
  const asOfDate = asString(input.as_of_date) ?? today();
  const defaultFrom = options.historyRequired ? addDays(asOfDate, -365) : undefined;
  const fromDate = asString(input.from_date) ?? defaultFrom;
  const toDate = asString(input.to_date) ?? asOfDate;

  if (fromDate && toDate && fromDate > toDate) {
    throw new ValidationError("Start date must be before end date.");
  }

  const page = Math.max(1, Math.trunc(asNumber(input.page) ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(input.page_size) ?? DEFAULT_PAGE_SIZE)));

  return {
    from_date: fromDate,
    to_date: toDate,
    as_of_date: asOfDate,
    month: asString(input.month),
    year: asString(input.year),
    employee_id: asString(input.employee_id),
    outlet_id: asString(input.outlet_id),
    department_id: asString(input.department_id),
    position_id: asString(input.position_id),
    employee_type: employeeType(input.employee_type),
    employment_status: asString(input.employment_status),
    document_status: asString(input.document_status),
    compliance_status: asString(input.compliance_status),
    expiry_status: asString(input.expiry_status),
    leave_type_id: asString(input.leave_type_id),
    leave_status: asString(input.leave_status),
    approval_status: asString(input.approval_status),
    long_leave_status: asString(input.long_leave_status),
    contract_status: asString(input.contract_status),
    probation_status: asString(input.probation_status),
    asset_status: asString(input.asset_status),
    include_archived: asBoolean(input.include_archived) ?? false,
    search: asString(input.search),
    page,
    page_size: pageSize,
    sort_by: sortBy(input.sort_by),
    sort_direction: sortDirection(input.sort_direction),
  };
};
