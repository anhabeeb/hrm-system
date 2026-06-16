import type { Context } from "hono";
import type { AppContext, AuthActor } from "../../types/api.types";
import { ok, created } from "../../utils/response";
import { IMPORT_EXPORT_MESSAGES } from "./import-export.constants";
import { exportJobs, getTemplate, importJobs, listTemplates } from "./import-export.service";
import { validateExportCreate, validateImportUpload, validateListFilters, validateReason } from "./import-export.validators";

const auth = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const requestId = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const json = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

export const createExport = async (c: Context<AppContext>) => created(await exportJobs.createExportJob(c.env, auth(c), validateExportCreate(await json(c))), IMPORT_EXPORT_MESSAGES.exportCreated, requestId(c));
export const listExports = async (c: Context<AppContext>) => ok(await exportJobs.listExports(c.env, auth(c), validateListFilters(c.req.query())), IMPORT_EXPORT_MESSAGES.exportsLoaded, requestId(c));
export const getExport = async (c: Context<AppContext>) => ok(await exportJobs.getExport(c.env, auth(c), c.req.param("id") ?? ""), "Export job loaded successfully.", requestId(c));
export const downloadExport = async (c: Context<AppContext>) => exportJobs.downloadExport(c.env, auth(c), c.req.param("id") ?? "");
export const cancelExport = async (c: Context<AppContext>) => ok(await exportJobs.cancelExportJob(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason), IMPORT_EXPORT_MESSAGES.exportCancelled, requestId(c));
export const retryExport = async (c: Context<AppContext>) => ok(await exportJobs.retryExportJob(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason), IMPORT_EXPORT_MESSAGES.retryRequested, requestId(c));

export const uploadImport = async (c: Context<AppContext>) => created(await importJobs.uploadImport(c.env, auth(c), validateImportUpload(await json(c))), IMPORT_EXPORT_MESSAGES.uploaded, requestId(c));
export const listImports = async (c: Context<AppContext>) => ok(await importJobs.listImports(c.env, auth(c), validateListFilters(c.req.query())), IMPORT_EXPORT_MESSAGES.importsLoaded, requestId(c));
export const getImport = async (c: Context<AppContext>) => ok(await importJobs.getImport(c.env, auth(c), c.req.param("id") ?? ""), "Import job loaded successfully.", requestId(c));
export const validateImport = async (c: Context<AppContext>) => {
  const result = await importJobs.validateImport(c.env, auth(c), c.req.param("id") ?? "");
  return ok(result, result.invalid_rows > 0 ? IMPORT_EXPORT_MESSAGES.validationErrors : IMPORT_EXPORT_MESSAGES.validationOk, requestId(c));
};
export const applyImport = async (c: Context<AppContext>) => {
  const result = await importJobs.applyImport(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason);
  return ok(result, IMPORT_EXPORT_MESSAGES.applied, requestId(c));
};
export const cancelImport = async (c: Context<AppContext>) => ok(await importJobs.cancelImport(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason), IMPORT_EXPORT_MESSAGES.cancelled, requestId(c));
export const templates = (c: Context<AppContext>) => ok(listTemplates(), IMPORT_EXPORT_MESSAGES.templatesLoaded, requestId(c));
export const templateDetail = (c: Context<AppContext>) => ok(getTemplate(c.req.param("templateKey") ?? ""), IMPORT_EXPORT_MESSAGES.templateLoaded, requestId(c));
