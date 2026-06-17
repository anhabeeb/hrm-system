import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { AppError, PermissionError } from "../../utils/errors";
import { HR_REPORT_BY_KEY, HR_REPORT_DEFINITIONS } from "./hr-reports.definitions";
import * as repository from "./hr-reports.repository";
import type { HrReportFilters, HrReportResult } from "./hr-reports.types";

const reportPermissionMessage = "You do not have permission to view this HR report.";

const canViewReport = (actor: AuthActor, permissionKey: string) =>
  permissionService.hasPermission(actor, "hr_reports.view") &&
  permissionService.hasPermission(actor, permissionKey);

const requireReport = (actor: AuthActor, reportKey: string) => {
  const definition = HR_REPORT_BY_KEY.get(reportKey);
  if (!definition) {
    throw new AppError("Please select a valid HR report.", "HR_REPORT_NOT_FOUND", 404);
  }
  if (!canViewReport(actor, definition.required_permission)) {
    throw new PermissionError(reportPermissionMessage, "HR_REPORT_PERMISSION_DENIED");
  }
  return definition;
};

const canViewSensitiveIdentity = (actor: AuthActor) =>
  permissionService.hasAnyPermission(actor, [
    "employees.view_sensitive",
    "documents.view_sensitive",
  ]);

const reportScope = (actor: AuthActor) => ({
  company_id: actor.companyId,
  outlet_ids: actor.isSuperAdmin || actor.isAdmin ? [] : actor.outletIds,
  scope_type: actor.isSuperAdmin || actor.isAdmin ? "company" as const : "outlet" as const,
});

const result = (
  actor: AuthActor,
  reportKey: string,
  filters: HrReportFilters,
  rows: Array<Record<string, unknown>>,
  pagination: HrReportResult["pagination"],
): HrReportResult => {
  const definition = requireReport(actor, reportKey);
  const generatedAt = new Date().toISOString();
  return {
    data: rows,
    meta: {
      report_key: definition.report_key,
      report_name: definition.name,
      description: definition.description,
      columns: definition.columns,
      generated_by: actor.actorUserId,
      scope: reportScope(actor),
      applied_filters: filters,
      row_count: rows.length,
      export_ready: true,
    },
    filters,
    pagination,
    generated_at: generatedAt,
  };
};

const enabledCategories = async (env: Env, actor: AuthActor) => {
  const [leaveEnabled, longLeaveEnabled, assetsEnabled, uniformsEnabled, contractTrackingEnabled] = await Promise.all([
    settingsService.isFeatureEnabled(env, actor.companyId, "leave_management", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "long_leave_management", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "asset_tracking", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "uniform_tracking", actor),
    settingsService.isFeatureEnabled(env, actor.companyId, "contract_tracking", actor),
  ]);
  return {
    leave: leaveEnabled,
    long_leave: longLeaveEnabled,
    assets: assetsEnabled && uniformsEnabled,
    contracts: contractTrackingEnabled,
  };
};

export const catalog = async (env: Env, actor: AuthActor) => {
  const categories = await enabledCategories(env, actor);
  return {
    data: HR_REPORT_DEFINITIONS.filter((definition) => canViewReport(actor, definition.required_permission))
      .filter((definition) => definition.category !== "leave" || categories.leave)
      .filter((definition) => definition.category !== "long_leave" || categories.long_leave)
      .filter((definition) => definition.category !== "assets" || categories.assets)
      .filter((definition) => definition.report_key !== "contracts" || categories.contracts),
    meta: {
      report_key: "catalog",
      report_name: "HR Report Catalog",
      description: "Available HR reports for the current user.",
      categories: ["employee", "compliance", "documents", ...(categories.leave ? ["leave"] : []), ...(categories.long_leave ? ["long_leave"] : []), "lifecycle", ...(categories.assets ? ["assets"] : []), "summary"],
      export_ready: true,
    },
    generated_at: new Date().toISOString(),
  };
};

export const summary = async (env: Env, actor: AuthActor, filters: HrReportFilters) => {
  if (!permissionService.hasPermission(actor, "hr_reports.view")) {
    throw new PermissionError(reportPermissionMessage, "HR_REPORT_PERMISSION_DENIED");
  }
  const reportCatalog = await catalog(env, actor);
  const counts = await repository.summary(env, actor, filters);
  return {
    data: {
      available_reports: reportCatalog.data.length,
      ...counts,
    },
    meta: {
      report_key: "summary",
      report_name: "HR Reports Summary",
      description: "Compact availability and HR risk summary for reports.",
      scope: reportScope(actor),
      export_ready: true,
    },
    filters,
    generated_at: new Date().toISOString(),
  };
};

export const runReport = async (
  env: Env,
  actor: AuthActor,
  reportKey: string,
  filters: HrReportFilters,
): Promise<HrReportResult> => {
  requireReport(actor, reportKey);
  let reportRows: Awaited<ReturnType<typeof repository.employeeMaster>>;

  switch (reportKey) {
    case "employee-master":
      reportRows = await repository.employeeMaster(env, actor, filters);
      break;
    case "employee-status":
      reportRows = await repository.employeeStatus(env, actor, filters);
      break;
    case "local-foreign":
      reportRows = await repository.localForeign(env, actor, filters);
      break;
    case "headcount":
      reportRows = await repository.headcount(env, actor, filters);
      break;
    case "new-joiners":
      reportRows = await repository.newJoiners(env, actor, filters);
      break;
    case "probation":
      reportRows = await repository.probation(env, actor, filters);
      break;
    case "contracts":
      if (!(await enabledCategories(env, actor)).contracts) {
        throw new AppError("Contract Tracking is disabled. Enable it in Settings to use this module.", "CONTRACT_TRACKING_DISABLED", 403);
      }
      reportRows = await repository.contracts(env, actor, filters);
      break;
    case "document-compliance":
      reportRows = await repository.documentCompliance(env, actor, filters);
      break;
    case "foreign-compliance":
      reportRows = await repository.foreignCompliance(env, actor, filters, canViewSensitiveIdentity(actor));
      break;
    case "leave-balances":
      if (!(await enabledCategories(env, actor)).leave) {
        throw new AppError("Leave Management is disabled. Enable it in Settings to use this module.", "LEAVE_MANAGEMENT_DISABLED", 403);
      }
      reportRows = await repository.leaveBalances(env, actor, filters);
      break;
    case "leave-requests":
      if (!(await enabledCategories(env, actor)).leave) {
        throw new AppError("Leave Management is disabled. Enable it in Settings to use this module.", "LEAVE_MANAGEMENT_DISABLED", 403);
      }
      reportRows = await repository.leaveRequests(env, actor, filters);
      break;
    case "long-leave":
      if (!(await enabledCategories(env, actor)).long_leave) {
        throw new AppError("Long Leave Management is disabled. Enable it in Settings to use this module.", "LONG_LEAVE_MANAGEMENT_DISABLED", 403);
      }
      reportRows = await repository.longLeave(env, actor, filters);
      break;
    case "assets-uniforms":
      if (!(await enabledCategories(env, actor)).assets) {
        throw new AppError("Asset Tracking and Uniform Tracking must both be enabled before viewing this report.", "ASSETS_UNIFORMS_REPORT_DISABLED", 403);
      }
      reportRows = await repository.assetsUniforms(env, actor, filters);
      break;
    case "compliance-summary":
      reportRows = await repository.complianceSummary(env, actor, filters);
      break;
    case "lifecycle":
      reportRows = await repository.lifecycle(env, actor, filters);
      break;
    case "employee-360-summary":
      reportRows = await repository.employee360Summary(env, actor, filters);
      break;
    default:
      throw new AppError("Please select a valid HR report.", "HR_REPORT_NOT_FOUND", 404);
  }

  return result(actor, reportKey, filters, reportRows.rows, reportRows.pagination);
};
