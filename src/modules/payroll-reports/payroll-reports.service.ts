import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, PermissionError } from "../../utils/errors";
import { PAYROLL_REPORT_BY_KEY, PAYROLL_REPORT_DEFINITIONS } from "./payroll-reports.definitions";
import * as repository from "./payroll-reports.repository";
import type { PayrollReportFilters, PayrollReportResult } from "./payroll-reports.types";

const reportPermissionMessage = "You do not have permission to view this payroll report.";

const canViewReport = (actor: AuthActor, permissionKey: string) =>
  permissionService.hasPermission(actor, "payroll_reports.view") &&
  permissionService.hasPermission(actor, permissionKey);

const canViewSensitiveAmounts = (actor: AuthActor) =>
  permissionService.hasAnyPermission(actor, [
    "payroll_reports.sensitive_amounts.view",
    "payroll.view",
    "payroll.process",
  ]);

const requirePayrollEnabled = async (env: Env, actor: AuthActor) => {
  const enabled = await settingsService.isFeatureEnabled(env, actor.companyId, "payroll", actor);
  if (!enabled) {
    throw new AppError("Payroll Management is disabled. Enable it in Settings to use this module.", "PAYROLL_MANAGEMENT_DISABLED", 403);
  }
};

const payrollSubFeatureEnabled = (env: Env, actor: AuthActor, key: settingsService.PayrollSubFeatureKey) =>
  settingsService.isPayrollSubFeatureEnabled(env, actor.companyId, key);

const requirePayrollSubFeature = async (env: Env, actor: AuthActor, key: settingsService.PayrollSubFeatureKey, message: string, code: string) => {
  if (!(await payrollSubFeatureEnabled(env, actor, key))) {
    throw new AppError(message, code, 403);
  }
};

const requireReport = (actor: AuthActor, reportKey: string) => {
  const definition = PAYROLL_REPORT_BY_KEY.get(reportKey);
  if (!definition) {
    throw new AppError("Please select a valid payroll report.", "PAYROLL_REPORT_NOT_FOUND", 404);
  }
  if (!canViewReport(actor, definition.required_permission)) {
    throw new PermissionError(reportPermissionMessage, "PAYROLL_REPORT_PERMISSION_DENIED");
  }
  return definition;
};

const reportScope = (actor: AuthActor) => ({
  company_id: actor.companyId,
  outlet_ids: actor.isSuperAdmin || actor.isAdmin ? [] : actor.outletIds,
  scope_type: actor.isSuperAdmin || actor.isAdmin ? "company" as const : "outlet" as const,
});

const attendancePayrollDeductionsEnabled = async (env: Env, actor: AuthActor) => {
  const attendanceEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor);
  if (!attendanceEnabled) return false;
  const attendanceSettings = await settingsService.getAttendanceSettings(env, actor.companyId).catch(() => ({})) as Record<string, unknown>;
  const configured =
    attendanceSettings["attendance.payroll_deductions_enabled"] ??
    attendanceSettings.absent_day_deduction_enabled ??
    attendanceSettings.deduct_absent_days;
  return configured !== false;
};

const requireAttendanceForPayrollReport = async (env: Env, actor: AuthActor, reportKey: string) => {
  const attendanceEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor);
  if (!attendanceEnabled) {
    throw new AppError("Attendance Management is disabled. Enable it in Settings to use this module.", "ATTENDANCE_MANAGEMENT_DISABLED", 403);
  }
  if (reportKey === "attendance-deductions" && !(await attendancePayrollDeductionsEnabled(env, actor))) {
    throw new AppError("Attendance Payroll Deductions are disabled. Enable them in Attendance Settings to use this report.", "ATTENDANCE_PAYROLL_DEDUCTIONS_DISABLED", 403);
  }
};

const safeRows = (
  rows: Array<Record<string, unknown>>,
  sensitiveColumns: Set<string>,
  canViewSensitive: boolean,
) => {
  if (canViewSensitive) return rows;
  return rows.map((row) => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!sensitiveColumns.has(key)) sanitized[key] = value;
    }
    sanitized.amounts_restricted = 1;
    return sanitized;
  });
};

const result = async (
  env: Env,
  actor: AuthActor,
  reportKey: string,
  filters: PayrollReportFilters,
  rows: Array<Record<string, unknown>>,
  pagination: PayrollReportResult["pagination"],
): Promise<PayrollReportResult> => {
  const definition = requireReport(actor, reportKey);
  const canViewSensitive = canViewSensitiveAmounts(actor);
  const sensitiveColumns = new Set(definition.columns.filter((column) => column.sensitive).map((column) => column.key));
  const currency = await repository.getCurrency(env, actor.companyId);
  const columns = canViewSensitive ? definition.columns : definition.columns.filter((column) => !column.sensitive);

  return {
    data: safeRows(rows, sensitiveColumns, canViewSensitive),
    meta: {
      report_key: definition.report_key,
      report_name: definition.name,
      description: definition.description,
      columns,
      generated_by: actor.actorUserId,
      scope: reportScope(actor),
      applied_filters: filters,
      row_count: rows.length,
      currency,
      export_ready: true,
      sensitive: definition.sensitive,
      restricted: !canViewSensitive && definition.columns.some((column) => column.sensitive),
    },
    filters,
    pagination,
    generated_at: new Date().toISOString(),
  };
};

const enabledCategories = async (env: Env, actor: AuthActor) => {
  const [payrollEnabled, attendanceEnabled, leaveEnabled, longLeaveEnabled, attendanceDeductionsEnabled, salaryProcessingEnabled, manualDeductionsEnabled, advancesEnabled, salaryLoansEnabled, overtimeEnabled, payslipsEnabled, approvalsEnabled, longLeaveDeductionsEnabled] = await Promise.all([
    settingsService.isFeatureEnabled(env, actor.companyId, "payroll", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "leave_management", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "long_leave_management", actor),
    attendancePayrollDeductionsEnabled(env, actor),
    payrollSubFeatureEnabled(env, actor, "payroll.salary_processing_enabled"),
    payrollSubFeatureEnabled(env, actor, "payroll.manual_deductions_enabled"),
    payrollSubFeatureEnabled(env, actor, "payroll.advances_enabled"),
    payrollSubFeatureEnabled(env, actor, "payroll.salary_loans_enabled"),
    payrollSubFeatureEnabled(env, actor, "payroll.overtime_enabled"),
    payrollSubFeatureEnabled(env, actor, "payroll.payslips_enabled"),
    payrollSubFeatureEnabled(env, actor, "payroll.approvals_enabled"),
    payrollSubFeatureEnabled(env, actor, "payroll.long_leave_deductions_enabled"),
  ]);
  return {
    payroll: payrollEnabled,
    salary_processing: payrollEnabled && salaryProcessingEnabled,
    attendance: attendanceEnabled,
    attendance_deductions: payrollEnabled && attendanceDeductionsEnabled && await payrollSubFeatureEnabled(env, actor, "payroll.attendance_deductions_enabled"),
    leave: leaveEnabled,
    long_leave: longLeaveEnabled,
    manual_deductions: payrollEnabled && manualDeductionsEnabled,
    advances: payrollEnabled && advancesEnabled,
    salary_loans: payrollEnabled && salaryLoansEnabled,
    overtime: payrollEnabled && overtimeEnabled,
    payslips: payrollEnabled && payslipsEnabled,
    approvals: payrollEnabled && approvalsEnabled,
    long_leave_deductions: payrollEnabled && longLeaveEnabled && longLeaveDeductionsEnabled,
  };
};

export const catalog = async (env: Env, actor: AuthActor) => {
  await requirePayrollEnabled(env, actor);
  const categories = await enabledCategories(env, actor);
  return {
    data: PAYROLL_REPORT_DEFINITIONS.filter((definition) => canViewReport(actor, definition.required_permission))
      .filter((definition) => definition.category !== "attendance" || categories.attendance)
      .filter((definition) => !["payroll", "salary", "cost", "finance_summary"].includes(definition.category) || categories.salary_processing)
      .filter((definition) => definition.report_key !== "attendance-deductions" || categories.attendance_deductions)
      .filter((definition) => definition.report_key !== "deductions" || categories.manual_deductions)
      .filter((definition) => definition.report_key !== "advances" || categories.advances)
      .filter((definition) => definition.report_key !== "salary-loans" || categories.salary_loans)
      .filter((definition) => definition.report_key !== "overtime" || categories.overtime)
      .filter((definition) => definition.report_key !== "payslip-status" || categories.payslips)
      .filter((definition) => definition.report_key !== "approval-finalization" || categories.approvals)
      .filter((definition) => definition.report_key !== "leave-deductions" || categories.leave)
      .filter((definition) => definition.category !== "long_leave" || categories.long_leave_deductions),
    meta: {
      report_key: "catalog",
      report_name: "Payroll / Finance Report Catalog",
      description: "Available payroll and finance reports for the current user.",
      categories: [...(categories.salary_processing ? ["payroll", "salary"] : []), ...(categories.manual_deductions ? ["deductions"] : []), ...(categories.advances || categories.salary_loans ? ["advances_loans"] : []), ...(categories.attendance ? ["attendance"] : []), ...(categories.long_leave_deductions ? ["long_leave"] : []), ...(categories.payslips ? ["payslips"] : []), ...(categories.approvals ? ["approvals"] : []), ...(categories.salary_processing ? ["cost", "finance_summary"] : []), "audit"],
      export_ready: true,
      sensitive: true,
    },
    generated_at: new Date().toISOString(),
  };
};

export const summary = async (env: Env, actor: AuthActor, filters: PayrollReportFilters) => {
  await requirePayrollEnabled(env, actor);
  if (!permissionService.hasPermission(actor, "payroll_reports.view")) {
    throw new PermissionError(reportPermissionMessage, "PAYROLL_REPORT_PERMISSION_DENIED");
  }
  const canViewSensitive = canViewSensitiveAmounts(actor);
  const counts = await repository.summary(env, actor, filters, canViewSensitive);
  return {
    data: {
      available_reports: (await catalog(env, actor)).data.length,
      ...counts,
      amounts_restricted: canViewSensitive ? 0 : 1,
    },
    meta: {
      report_key: "summary",
      report_name: "Payroll Reports Summary",
      description: "Compact payroll report availability and readiness summary.",
      scope: reportScope(actor),
      currency: await repository.getCurrency(env, actor.companyId),
      export_ready: true,
      sensitive: true,
      restricted: !canViewSensitive,
    },
    filters,
    generated_at: new Date().toISOString(),
  };
};

export const runReport = async (
  env: Env,
  actor: AuthActor,
  reportKey: string,
  filters: PayrollReportFilters,
): Promise<PayrollReportResult> => {
  await requirePayrollEnabled(env, actor);
  requireReport(actor, reportKey);
  const canViewSensitive = canViewSensitiveAmounts(actor);
  let reportRows: { rows: Array<Record<string, unknown>>; pagination: PayrollReportResult["pagination"] };

  switch (reportKey) {
    case "monthly-summary":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.monthlySummary(env, actor, filters, canViewSensitive);
      break;
    case "employee-detail":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.employeeDetail(env, actor, filters, canViewSensitive);
      break;
    case "salary-compensation":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.salaryCompensation(env, actor, filters, canViewSensitive);
      break;
    case "salary-changes":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.salaryChanges(env, actor, filters, canViewSensitive);
      break;
    case "deductions":
      await requirePayrollSubFeature(env, actor, "payroll.manual_deductions_enabled", "Manual Deductions are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_MANUAL_DEDUCTIONS_DISABLED");
      reportRows = await repository.deductions(env, actor, filters, canViewSensitive);
      break;
    case "advances":
      await requirePayrollSubFeature(env, actor, "payroll.advances_enabled", "Advance Salary is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_ADVANCES_DISABLED");
      reportRows = await repository.advances(env, actor, filters, canViewSensitive);
      break;
    case "salary-loans":
      await requirePayrollSubFeature(env, actor, "payroll.salary_loans_enabled", "Salary Loans are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_SALARY_LOANS_DISABLED");
      reportRows = await repository.salaryLoans(env, actor, filters, canViewSensitive);
      break;
    case "attendance-deductions":
      await requirePayrollSubFeature(env, actor, "payroll.attendance_deductions_enabled", "Attendance Payroll Deductions are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_ATTENDANCE_DEDUCTIONS_DISABLED");
      await requireAttendanceForPayrollReport(env, actor, reportKey);
      reportRows = await repository.attendanceDeductions(env, actor, filters, canViewSensitive);
      break;
    case "overtime":
      await requirePayrollSubFeature(env, actor, "payroll.overtime_enabled", "Overtime is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_OVERTIME_DISABLED");
      reportRows = await repository.overtime(env, actor, filters, canViewSensitive);
      break;
    case "long-leave-deductions":
      await requirePayrollSubFeature(env, actor, "payroll.long_leave_deductions_enabled", "Long Leave Deductions are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_LONG_LEAVE_DEDUCTIONS_DISABLED");
      if (!(await enabledCategories(env, actor)).long_leave) {
        throw new AppError("Long Leave Management is disabled. Enable it in Settings to use this module.", "LONG_LEAVE_MANAGEMENT_DISABLED", 403);
      }
      reportRows = await repository.longLeaveDeductions(env, actor, filters, canViewSensitive);
      break;
    case "leave-deductions":
      if (!(await enabledCategories(env, actor)).leave) {
        throw new AppError("Leave Management is disabled. Enable it in Settings to use this module.", "LEAVE_MANAGEMENT_DISABLED", 403);
      }
      reportRows = await repository.leaveDeductions(env, actor, filters, canViewSensitive);
      break;
    case "payslip-status":
      await requirePayrollSubFeature(env, actor, "payroll.payslips_enabled", "Payslips are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_PAYSLIPS_DISABLED");
      reportRows = await repository.payslipStatus(env, actor, filters);
      break;
    case "approval-finalization":
      await requirePayrollSubFeature(env, actor, "payroll.approvals_enabled", "Payroll Approvals are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_APPROVALS_DISABLED");
      reportRows = await repository.approvalFinalization(env, actor, filters);
      break;
    case "outlet-cost":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.outletCost(env, actor, filters, canViewSensitive);
      break;
    case "department-cost":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.departmentCost(env, actor, filters, canViewSensitive);
      break;
    case "variance":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.variance(env, actor, filters, canViewSensitive);
      break;
    case "audit":
      reportRows = await repository.audit(env, actor, filters);
      break;
    case "finance-summary":
      await requirePayrollSubFeature(env, actor, "payroll.salary_processing_enabled", "Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED");
      reportRows = await repository.financeSummary(env, actor, filters, canViewSensitive);
      break;
    default:
      throw new AppError("Please select a valid payroll report.", "PAYROLL_REPORT_NOT_FOUND", 404);
  }

  return result(env, actor, reportKey, filters, reportRows.rows, reportRows.pagination);
};
