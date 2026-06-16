import { ValidationError } from "../../utils/errors";
import { REPORT_DEFINITIONS } from "./reports.constants";
import type { ReportFilters, ReportGenerateInput } from "./reports.types";

const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export const validateReportFilters = (input: Record<string, unknown>): ReportFilters => {
  const dateFrom = asString(input.date_from);
  const dateTo = asString(input.date_to);
  if (dateFrom && dateTo && dateFrom > dateTo) throw new ValidationError("Start date must be before end date.");
  const payrollMonth = asString(input.payroll_month);
  if (payrollMonth && !/^\d{4}-\d{2}$/.test(payrollMonth)) throw new ValidationError("Please enter a valid payroll month.");
  const days = asNumber(input.days);
  const page = Math.max(1, Math.trunc(asNumber(input.page) ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(asNumber(input.page_size) ?? 25)));
  return {
    date_from: dateFrom,
    date_to: dateTo,
    outlet_id: asString(input.outlet_id),
    employee_id: asString(input.employee_id),
    department_id: asString(input.department_id),
    position_id: asString(input.position_id),
    employee_type: asString(input.employee_type),
    employment_status: asString(input.employment_status),
    nationality: asString(input.nationality),
    joined_from: asString(input.joined_from),
    joined_to: asString(input.joined_to),
    leave_type_id: asString(input.leave_type_id),
    status: asString(input.status),
    payroll_month: payrollMonth,
    module: asString(input.module),
    action: asString(input.action),
    device_id: asString(input.device_id),
    document_type: asString(input.document_type),
    days: days === undefined ? undefined : Math.max(1, Math.trunc(days)),
    page,
    page_size: pageSize,
  };
};

export const validateGenerateReport = (payload: unknown): ReportGenerateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const reportKey = asString(payload.report_key);
  if (!reportKey || !REPORT_DEFINITIONS.some((report) => report.report_key === reportKey)) {
    throw new ValidationError("Please select a valid report.");
  }
  const format = asString(payload.format) ?? "xlsx";
  if (!["xlsx", "pdf"].includes(format)) {
    throw new ValidationError("Only Excel and PDF report exports are supported.");
  }
  return {
    report_key: reportKey,
    filters: validateReportFilters(isObject(payload.filters) ? payload.filters : {}),
    format: format as ReportGenerateInput["format"],
  };
};
