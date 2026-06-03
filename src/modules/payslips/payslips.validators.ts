import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./payslips.constants";
import type { PayslipFilters, PayslipGenerateInput } from "./payslips.types";
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
const requireReason = (value: unknown) => {
  const reason = asString(value);
  if (!reason || reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return reason;
};
export const validatePayslipGenerate = (payload: unknown): PayslipGenerateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const payrollRunId = asString(payload.payroll_run_id);
  if (!payrollRunId) throw new ValidationError("Payroll run is required.");
  return { payroll_run_id: payrollRunId, outlet_id: asString(payload.outlet_id), reason: requireReason(payload.reason) };
};
export const validatePayslipFilters = (query: Record<string, unknown>): PayslipFilters => ({
  payroll_run_id: asString(query.payroll_run_id),
  payroll_month: asString(query.payroll_month),
  employee_id: asString(query.employee_id),
  outlet_id: asString(query.outlet_id),
  status: asString(query.status),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});
