import * as repository from "./attendance-reports.repository";
import type {
  AttendanceReportEnvelope,
  AttendanceReportFilters,
  AttendanceReportKind,
} from "./attendance-reports.types";
import type { AttendanceOutletScope } from "./attendance.types";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";

const scope = (context: AuthActor): AttendanceOutletScope => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

const pagination = (filters: AttendanceReportFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const envelope = <T>(
  context: AuthActor,
  report: AttendanceReportKind,
  filters: AttendanceReportFilters,
  rows: T[],
  sourceTables: string[],
  page?: PaginationMeta,
): AttendanceReportEnvelope<T> => {
  const generatedAt = new Date().toISOString();
  return {
    data: rows,
    meta: {
      report,
      generated_at: generatedAt,
      generated_for_company_id: context.companyId,
      row_count: rows.length,
      source_tables: sourceTables,
    },
    filters,
    pagination: page,
    generated_at: generatedAt,
  };
};

export const dailyReport = async (
  env: Env,
  context: AuthActor,
  filters: AttendanceReportFilters,
) => {
  const total = await repository.countDailyReportRows(env, context.companyId, filters, scope(context));
  const rows = await repository.listDailyReportRows(env, context.companyId, filters, scope(context));
  return envelope(context, "daily", filters, rows, [
    "attendance_daily_summary",
    "attendance_events",
    "roster_shifts",
    "attendance_conflicts",
  ], pagination(filters, total));
};

export const monthlyReport = async (
  env: Env,
  context: AuthActor,
  filters: AttendanceReportFilters,
) => {
  const total = await repository.countMonthlyReportRows(env, context.companyId, filters, scope(context));
  const rows = await repository.listMonthlyReportRows(env, context.companyId, filters, scope(context));
  return envelope(context, "monthly", filters, rows, [
    "attendance_daily_summary",
    "attendance_conflicts",
  ], pagination(filters, total));
};

export const employeeReport = async (
  env: Env,
  context: AuthActor,
  employeeId: string,
  filters: AttendanceReportFilters,
) => {
  await permissionService.canAccessEmployee(env, context, employeeId);
  const reportFilters = { ...filters, employee_id: employeeId };
  const total = await repository.countDailyReportRows(env, context.companyId, reportFilters, scope(context));
  const rows = await repository.listDailyReportRows(env, context.companyId, reportFilters, scope(context));
  const events = filters.include_details
    ? await repository.listEmployeeEvents(env, context.companyId, reportFilters, scope(context))
    : [];
  return envelope(context, "employee_detail", reportFilters, rows.map((row) => ({
    ...row,
    events: filters.include_details
      ? events.filter((event) => event.employee_id === row.employee_id && event.event_date === row.attendance_date)
      : undefined,
  })), [
    "attendance_daily_summary",
    "attendance_events",
    "attendance_corrections",
  ], pagination(reportFilters, total));
};

export const exceptionsReport = async (
  env: Env,
  context: AuthActor,
  filters: AttendanceReportFilters,
) => {
  const total = await repository.countExceptionRows(env, context.companyId, filters, scope(context));
  const rows = await repository.listExceptionRows(env, context.companyId, filters, scope(context));
  return envelope(context, "exceptions", filters, rows, [
    "attendance_conflicts",
    "biometric_attendance_logs",
    "attendance_daily_summary",
  ], pagination(filters, total));
};

export const devicePunchesReport = async (
  env: Env,
  context: AuthActor,
  filters: AttendanceReportFilters,
) => {
  const total = await repository.countDevicePunchRows(env, context.companyId, filters, scope(context));
  const rows = await repository.listDevicePunchRows(env, context.companyId, filters, scope(context));
  return envelope(context, "device_punches", filters, rows, [
    "biometric_attendance_logs",
    "biometric_devices",
    "attendance_events",
  ], pagination(filters, total));
};

export const summaryReport = async (
  env: Env,
  context: AuthActor,
  filters: AttendanceReportFilters,
) => {
  const row = await repository.reportSummary(env, context.companyId, filters, scope(context));
  return envelope(context, "summary", filters, [row], [
    "attendance_daily_summary",
    "attendance_conflicts",
    "biometric_attendance_logs",
    "biometric_devices",
  ]);
};
