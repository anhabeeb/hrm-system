import * as permissionService from "../../services/permission.service";
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

export const catalog = (actor: AuthActor) => ({
  data: HR_REPORT_DEFINITIONS.filter((definition) => canViewReport(actor, definition.required_permission)),
  meta: {
    report_key: "catalog",
    report_name: "HR Report Catalog",
    description: "Available HR reports for the current user.",
    categories: ["employee", "compliance", "documents", "leave", "long_leave", "lifecycle", "assets", "summary"],
    export_ready: true,
  },
  generated_at: new Date().toISOString(),
});

export const summary = async (env: Env, actor: AuthActor, filters: HrReportFilters) => {
  if (!permissionService.hasPermission(actor, "hr_reports.view")) {
    throw new PermissionError(reportPermissionMessage, "HR_REPORT_PERMISSION_DENIED");
  }
  const counts = await repository.summary(env, actor, filters);
  return {
    data: {
      available_reports: catalog(actor).data.length,
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
      reportRows = await repository.contracts(env, actor, filters);
      break;
    case "document-compliance":
      reportRows = await repository.documentCompliance(env, actor, filters);
      break;
    case "foreign-compliance":
      reportRows = await repository.foreignCompliance(env, actor, filters, canViewSensitiveIdentity(actor));
      break;
    case "leave-balances":
      reportRows = await repository.leaveBalances(env, actor, filters);
      break;
    case "leave-requests":
      reportRows = await repository.leaveRequests(env, actor, filters);
      break;
    case "long-leave":
      reportRows = await repository.longLeave(env, actor, filters);
      break;
    case "assets-uniforms":
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
