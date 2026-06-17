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
  const [leaveEnabled, longLeaveEnabled] = await Promise.all([
    settingsService.isFeatureEnabled(env, actor.companyId, "leave_management", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "long_leave_management", actor),
  ]);
  return {
    leave: leaveEnabled,
    long_leave: longLeaveEnabled,
  };
};

export const catalog = async (env: Env, actor: AuthActor) => {
  const categories = await enabledCategories(env, actor);
  return {
    data: PAYROLL_REPORT_DEFINITIONS.filter((definition) => canViewReport(actor, definition.required_permission))
      .filter((definition) => definition.report_key !== "leave-deductions" || categories.leave)
      .filter((definition) => definition.category !== "long_leave" || categories.long_leave),
    meta: {
      report_key: "catalog",
      report_name: "Payroll / Finance Report Catalog",
      description: "Available payroll and finance reports for the current user.",
      categories: ["payroll", "salary", "deductions", "advances_loans", "attendance", ...(categories.long_leave ? ["long_leave"] : []), "payslips", "approvals", "cost", "audit", "finance_summary"],
      export_ready: true,
      sensitive: true,
    },
    generated_at: new Date().toISOString(),
  };
};

export const summary = async (env: Env, actor: AuthActor, filters: PayrollReportFilters) => {
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
  requireReport(actor, reportKey);
  const canViewSensitive = canViewSensitiveAmounts(actor);
  let reportRows: { rows: Array<Record<string, unknown>>; pagination: PayrollReportResult["pagination"] };

  switch (reportKey) {
    case "monthly-summary":
      reportRows = await repository.monthlySummary(env, actor, filters, canViewSensitive);
      break;
    case "employee-detail":
      reportRows = await repository.employeeDetail(env, actor, filters, canViewSensitive);
      break;
    case "salary-compensation":
      reportRows = await repository.salaryCompensation(env, actor, filters, canViewSensitive);
      break;
    case "salary-changes":
      reportRows = await repository.salaryChanges(env, actor, filters, canViewSensitive);
      break;
    case "deductions":
      reportRows = await repository.deductions(env, actor, filters, canViewSensitive);
      break;
    case "advances":
      reportRows = await repository.advances(env, actor, filters, canViewSensitive);
      break;
    case "salary-loans":
      reportRows = await repository.salaryLoans(env, actor, filters, canViewSensitive);
      break;
    case "attendance-deductions":
      reportRows = await repository.attendanceDeductions(env, actor, filters, canViewSensitive);
      break;
    case "overtime":
      reportRows = await repository.overtime(env, actor, filters, canViewSensitive);
      break;
    case "long-leave-deductions":
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
      reportRows = await repository.payslipStatus(env, actor, filters);
      break;
    case "approval-finalization":
      reportRows = await repository.approvalFinalization(env, actor, filters);
      break;
    case "outlet-cost":
      reportRows = await repository.outletCost(env, actor, filters, canViewSensitive);
      break;
    case "department-cost":
      reportRows = await repository.departmentCost(env, actor, filters, canViewSensitive);
      break;
    case "variance":
      reportRows = await repository.variance(env, actor, filters, canViewSensitive);
      break;
    case "audit":
      reportRows = await repository.audit(env, actor, filters);
      break;
    case "finance-summary":
      reportRows = await repository.financeSummary(env, actor, filters, canViewSensitive);
      break;
    default:
      throw new AppError("Please select a valid payroll report.", "PAYROLL_REPORT_NOT_FOUND", 404);
  }

  return result(env, actor, reportKey, filters, reportRows.rows, reportRows.pagination);
};
