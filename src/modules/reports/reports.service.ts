import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { AppError, PermissionError } from "../../utils/errors";
import { REPORT_DEFINITIONS } from "./reports.constants";
import { buildReport } from "./report-builder.service";
import { getDashboardSummary } from "./dashboard-summary.service";
import { hasReportPermission } from "./report-permission.service";
import type { ReportFilters, ReportGenerateInput } from "./reports.types";

const findDefinition = (reportKey: string) => REPORT_DEFINITIONS.find((report) => report.report_key === reportKey);

const assertReportAccess = (context: AuthActor, reportKey: string) => {
  const definition = findDefinition(reportKey);
  if (!definition) throw new AppError("Please select a valid report.", "REPORT_NOT_FOUND", 404);
  if (!hasReportPermission(context, definition.required_permission)) {
    throw new PermissionError(definition.sensitive ? "This export contains sensitive data. You do not have permission to access it." : undefined);
  }
  return definition;
};

export const listReports = (context: AuthActor) => ({
  reports: REPORT_DEFINITIONS.filter((report) => permissionService.hasPermission(context, report.required_permission)),
});

export const getCatalog = listReports;

export const generateReport = async (env: Env, context: AuthActor, input: ReportGenerateInput) => {
  const definition = assertReportAccess(context, input.report_key);
  const report = await buildReport(env, context, input.report_key, input.filters);
  if (definition.sensitive) {
    const audit = await auditService.createAuditLog(env, {
      companyId: context.companyId,
      module: "reports",
      action: "sensitive_report_generated",
      severity: "warning",
      entityType: "report",
      entityId: input.report_key,
      actorId: context.actorUserId,
      newValueJson: JSON.stringify({ report_key: input.report_key, filters: input.filters }),
      requestId: context.requestId,
    });
    if (!audit.created) throw new AppError("Report could not be generated because audit logging failed.", "AUDIT_LOG_REQUIRED", 500);
  }
  return report;
};

export const generateByKey = (env: Env, context: AuthActor, reportKey: string, filters: ReportFilters) =>
  buildReport(env, context, assertReportAccess(context, reportKey).report_key, filters);

export { getDashboardSummary };
