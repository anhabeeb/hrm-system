import { z } from "zod";

import type { AttendanceReportFilters } from "./attendance-reports.types";
import { ValidationError } from "../../utils/errors";

const reportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a valid report date.");
const reportMonth = z.string().regex(/^\d{4}-\d{2}$/, "Please choose a valid report month.");
const safeId = z.string().trim().min(1).max(128);

const toBool = (value: unknown) => value === true || value === "true" || value === "1" || value === 1;

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

const ensureRange = (filters: AttendanceReportFilters, report: string) => {
  if (filters.date) {
    filters.from_date = filters.date;
    filters.to_date = filters.date;
  }
  if (filters.month) {
    filters.from_date = `${filters.month}-01`;
    filters.to_date = `${filters.month}-31`;
  }
  if (!filters.from_date || !filters.to_date) {
    throw new ValidationError(`${report} requires a bounded date range.`);
  }
  if (filters.from_date > filters.to_date) {
    throw new ValidationError("Report start date must be before or equal to end date.");
  }
  return filters;
};

const base = z.object({
  date: reportDate.optional(),
  from_date: reportDate.optional(),
  to_date: reportDate.optional(),
  month: reportMonth.optional(),
  employee_id: safeId.optional(),
  outlet_id: safeId.optional(),
  department_id: safeId.optional(),
  position_id: safeId.optional(),
  attendance_status: z.string().trim().max(64).optional(),
  source: z.string().trim().max(64).optional(),
  device_id: safeId.optional(),
  exception_type: z.string().trim().max(128).optional(),
  status: z.string().trim().max(64).optional(),
  late_only: z.preprocess(toBool, z.boolean()).optional(),
  early_checkout_only: z.preprocess(toBool, z.boolean()).optional(),
  missing_checkin_only: z.preprocess(toBool, z.boolean()).optional(),
  missing_checkout_only: z.preprocess(toBool, z.boolean()).optional(),
  absent_only: z.preprocess(toBool, z.boolean()).optional(),
  overtime_only: z.preprocess(toBool, z.boolean()).optional(),
  leave_related_only: z.preprocess(toBool, z.boolean()).optional(),
  holiday_related_only: z.preprocess(toBool, z.boolean()).optional(),
  include_details: z.preprocess(toBool, z.boolean()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

export const validateAttendanceReportFilters = (
  query: Record<string, string | undefined>,
  report: "daily" | "monthly" | "employee_detail" | "exceptions" | "device_punches" | "summary",
): AttendanceReportFilters => {
  const parsed = parse(base, query);
  if (report === "monthly" && !parsed.month && (!parsed.from_date || !parsed.to_date)) {
    throw new ValidationError("Monthly attendance report requires a month or date range.");
  }
  if (report === "employee_detail" && !parsed.employee_id) {
    throw new ValidationError("Employee attendance report requires an employee.");
  }
  if (report === "summary") {
    if (!parsed.from_date && !parsed.to_date && !parsed.date) {
      const today = new Date().toISOString().slice(0, 10);
      parsed.from_date = today;
      parsed.to_date = today;
    }
    return ensureRange(parsed, "Attendance summary report");
  }
  return ensureRange(parsed, `${report.replace("_", " ")} report`);
};

