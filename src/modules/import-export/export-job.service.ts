import type { AuthActor } from "../../types/api.types";
import * as auditService from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import { AppError, NotFoundError, OutletAccessError, PermissionError, ReasonRequiredError } from "../../utils/errors";
import { generateByKey } from "../reports/reports.service";
import type { ReportFilters } from "../reports/reports.types";
import { columnsFromRows, excelContentType, generateExcelWorkbook, generatePdfReport, pdfContentType } from "../../utils/export-file-format";
import * as repository from "./import-export.repository";
import type { ExportCreateInput, ListFilters } from "./import-export.types";

const SENSITIVE_EXPORT_TYPES = new Set(["employees", "payroll", "documents_metadata", "audit_activity", "approvals"]);

const reportKeyForExport = (input: ExportCreateInput) => input.report_key ?? ({
  employees: "employee_summary",
  attendance: "attendance_summary",
  leave: "leave_summary",
  payroll: "payroll_summary",
  assets: "asset_summary",
  documents_metadata: "expiring_documents",
  audit_activity: "audit_activity",
} as Record<string, string | undefined>)[input.export_type];

const hasAny = (context: AuthActor, permissions: string[]) => permissionService.hasAnyPermission(context, permissions);
const hasFullExportAccess = (context: AuthActor) => permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "export.full_company_data");

const assertModulePermission = (context: AuthActor, exportType: string) => {
  const permissions: Record<string, string[]> = {
    employees: ["employees.view"],
    attendance: ["attendance.view"],
    leave: ["leave.view"],
    payroll: ["payroll.view"],
    assets: ["assets.view"],
    uniforms: ["uniforms.view"],
    documents_metadata: ["documents.view"],
    audit_activity: ["audit_logs.view"],
    approvals: ["approvals.view"],
  };
  const required = permissions[exportType];
  if (!required || !hasAny(context, required)) throw new PermissionError();
};

const moduleForExportType: Record<string, string | undefined> = {
  assets: "asset_tracking",
  uniforms: "uniform_tracking",
};

const assertExportModuleEnabled = async (env: Env, context: AuthActor, exportType: string) => {
  const featureKey = moduleForExportType[exportType];
  if (!featureKey) return;
  const enabled = await settingsService.isFeatureEnabled(env, context.companyId, featureKey, context);
  if (!enabled) {
    throw new AppError(
      exportType === "assets"
        ? "Asset Tracking is disabled. Enable it in Settings to use this module."
        : "Uniform Tracking is disabled. Enable it in Settings to use this module.",
      exportType === "assets" ? "ASSET_TRACKING_DISABLED" : "UNIFORM_TRACKING_DISABLED",
      403,
    );
  }
};

const scopedFilters = (context: AuthActor, input: ExportCreateInput) => {
  const filters = { ...input.filters };
  const requestedOutletId = typeof filters.outlet_id === "string" ? filters.outlet_id : undefined;

  if (context.isSuperAdmin || hasFullExportAccess(context)) {
    return { ...filters, scope: requestedOutletId ? "single_outlet" : "company" };
  }

  if (requestedOutletId) {
    if (!context.outletIds.includes(requestedOutletId)) throw new OutletAccessError();
    return { ...filters, scope: "single_outlet", outlet_id: requestedOutletId, outlet_ids: [requestedOutletId] };
  }

  if (context.outletIds.length === 0) throw new OutletAccessError();
  return { ...filters, scope: "accessible_outlets", outlet_ids: context.outletIds };
};

const assertSensitiveExportAllowed = (context: AuthActor, input: ExportCreateInput) => {
  if (!SENSITIVE_EXPORT_TYPES.has(input.export_type)) return;
  if (!input.reason || input.reason.trim().length < 3) throw new ReasonRequiredError();
  if (!permissionService.hasPermission(context, "export.sensitive") && !permissionService.isSuperAdmin(context)) {
    throw new PermissionError("You do not have permission to access this sensitive export.");
  }
};

const canAccessExportJob = (context: AuthActor, job: Record<string, unknown>) => {
  if (hasFullExportAccess(context)) return true;
  if (job.requested_by !== context.actorUserId) return false;
  let filters: Record<string, unknown> = {};
  try {
    filters = typeof job.filters_json === "string" ? JSON.parse(job.filters_json) as Record<string, unknown> : {};
  } catch {
    return false;
  }
  const scope = filters.scope ?? filters.totals_scope;
  if (scope === "company" || !scope) return false;
  if (typeof filters.outlet_id === "string") return context.outletIds.includes(filters.outlet_id);
  if (Array.isArray(filters.outlet_ids)) return filters.outlet_ids.every((id) => typeof id === "string" && context.outletIds.includes(id));
  return false;
};

const audit = async (env: Env, context: AuthActor, action: string, entityId: string, reason?: string) => {
  const result = await auditService.createAuditLog(env, {
    companyId: context.companyId,
    module: "import_export",
    action,
    severity: "warning",
    entityType: "export_job",
    entityId,
    actorId: context.actorUserId,
    reason,
  });
  if (!result.created) throw new AppError("This action could not be completed because audit logging failed.", "AUDIT_LOG_REQUIRED", 500);
};

const assertCanMutateExportJob = (context: AuthActor, job: Record<string, unknown>) => {
  if (!canAccessExportJob(context, job)) {
    throw new AppError("You do not have access to this export job.", "EXPORT_ACCESS_DENIED", 403);
  }
};

const safeExportJob = (job: Record<string, unknown>) => {
  const { file_key: _fileKey, ...safe } = job;
  return { ...safe, file_ready: Boolean(job.file_key) };
};

const loadMutableExportJob = async (env: Env, context: AuthActor, id: string) => {
  const job = await repository.findExportJob(env, context.companyId, id);
  if (!job) throw new NotFoundError("Export job not found.");
  assertCanMutateExportJob(context, job);
  return job;
};

export const createExportJob = async (env: Env, context: AuthActor, input: ExportCreateInput) => {
  await assertExportModuleEnabled(env, context, input.export_type);
  assertModulePermission(context, input.export_type);
  assertSensitiveExportAllowed(context, input);
  const filters = scopedFilters(context, input);
  const reportKey = reportKeyForExport(input);
  const report = reportKey
    ? await generateByKey(env, context, reportKey, filters as ReportFilters)
    : { export_type: input.export_type, rows: [], summary: { note: "This export type is a safe metadata placeholder." } };
  const rows = Array.isArray(report.rows) ? report.rows as Record<string, unknown>[] : [];
  const exportRows = rows.length > 0 ? rows : [report.summary ?? {}];
  const columns = columnsFromRows(exportRows, report.summary ?? {});
  const body = input.format === "pdf"
    ? generatePdfReport(reportKey ?? input.export_type, columns, exportRows)
    : generateExcelWorkbook(reportKey ?? input.export_type, columns, exportRows);
  const jobId = crypto.randomUUID();
  const fileKey = `exports/${context.companyId}/${jobId}.${input.format}`;
  await env.BACKUP_BUCKET.put(fileKey, body, {
    httpMetadata: { contentType: input.format === "pdf" ? pdfContentType : excelContentType },
  });
  await repository.createExportJob(env, jobId, context.companyId, context.actorUserId, { ...input, filters }, fileKey, rows.length);
  const job = await repository.findExportJob(env, context.companyId, jobId);
  await audit(env, context, "export_job_created", jobId, input.reason);
  return { export_job: { ...job, file_key: undefined } };
};

export const listExports = async (env: Env, context: AuthActor, filters: ListFilters) =>
  (await repository.listExportJobs(env, context.companyId, filters)).filter((job) => canAccessExportJob(context, job));

export const getExport = async (env: Env, context: AuthActor, id: string) => {
  const job = await repository.findExportJob(env, context.companyId, id);
  if (!job) throw new NotFoundError("Export job not found.");
  if (!canAccessExportJob(context, job)) throw new AppError("You do not have access to this export job.", "EXPORT_ACCESS_DENIED", 403);
  return safeExportJob(job);
};

export const downloadExport = async (env: Env, context: AuthActor, id: string) => {
  const job = await repository.findExportJob(env, context.companyId, id);
  if (!job) throw new NotFoundError("Export job not found.");
  if (!canAccessExportJob(context, job)) throw new AppError("You do not have access to this export job.", "EXPORT_ACCESS_DENIED", 403);
  if (!job.file_key) throw new AppError("Export file is not ready yet.", "EXPORT_NOT_READY", 409);
  await audit(env, context, "export_downloaded", id, job.reason ?? undefined);
  const object = await env.BACKUP_BUCKET.get(job.file_key);
  if (!object) throw new AppError("Export file is not ready yet.", "EXPORT_NOT_READY", 409);
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "content-disposition": `attachment; filename="export-${id}.${job.file_type}"`,
      "cache-control": "private, no-store",
    },
  });
};

export const cancelExportJob = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const job = await loadMutableExportJob(env, context, id);
  if (!["queued", "processing"].includes(String(job.status))) {
    throw new AppError("Only queued or processing export jobs can be cancelled.", "INVALID_EXPORT_STATUS", 409);
  }
  await audit(env, context, "export_cancelled", id, reason);
  await repository.updateExportStatusUnsafeInternal(env, context.companyId, id, "cancelled");
  return getExport(env, context, id);
};

export const retryExportJob = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const job = await loadMutableExportJob(env, context, id);
  if (job.status !== "failed") {
    throw new AppError("Only failed export jobs can be retried.", "INVALID_EXPORT_STATUS", 409);
  }
  await audit(env, context, "export_retry_requested", id, reason);
  await repository.updateExportStatusUnsafeInternal(env, context.companyId, id, "queued");
  return getExport(env, context, id);
};
