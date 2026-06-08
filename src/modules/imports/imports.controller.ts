import type { Context } from "hono";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AppError } from "../../utils/errors";
import { ok } from "../../utils/response";
import * as service from "./imports.service";
import { validateCreateImportJob, validateImportListFilters, validateImportRowsFilters, validatePreviewImport } from "./imports.validators";

const actor = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const request = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const param = (value: string | undefined, label: string) => {
  if (!value) throw new AppError(`Missing ${label}.`, "IMPORT_JOB_NOT_FOUND", 404);
  return value;
};
const body = async (c: Context<AppContext>) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};

export const templates = (c: Context<AppContext>) =>
  ok(service.listTemplates(actor(c)), "Import templates loaded successfully.", request(c));

export const templateDetail = (c: Context<AppContext>) =>
  ok(service.getTemplateDetail(actor(c), param(c.req.param("importType"), "import type")), "Import template loaded successfully.", request(c));

export const templateCsv = (c: Context<AppContext>) => {
  const result = service.getTemplateCsv(actor(c), param(c.req.param("importType"), "import type"));
  return new Response(result.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${result.data.import_type}-template.csv"`,
      "cache-control": "no-store",
      "x-request-id": c.get("requestId"),
    },
  });
};

export const jobs = async (c: Context<AppContext>) =>
  ok(await service.listImportJobs(c.env, actor(c), validateImportListFilters(c.req.query())), "Import history loaded successfully.", request(c));

export const getJob = async (c: Context<AppContext>) =>
  ok(await service.getImportJob(c.env, actor(c), param(c.req.param("id"), "import job")), "Import job loaded successfully.", request(c));

export const createJob = async (c: Context<AppContext>) =>
  ok(await service.createImportJob(c.env, actor(c), validateCreateImportJob(await body(c))), "Import job created and validated successfully.", request(c));

export const preview = async (c: Context<AppContext>) =>
  ok(await service.previewImport(c.env, actor(c), validatePreviewImport(await body(c))), "Import preview generated successfully.", request(c));

export const validateJob = async (c: Context<AppContext>) =>
  ok(await service.validateImportJob(c.env, actor(c), param(c.req.param("id"), "import job")), "Import validation refreshed successfully.", request(c));

export const applyJob = async (c: Context<AppContext>) =>
  ok(await service.applyImportJob(c.env, actor(c), param(c.req.param("id"), "import job")), "Import job applied successfully.", request(c));

export const cancelJob = async (c: Context<AppContext>) =>
  ok(await service.cancelImportJob(c.env, actor(c), param(c.req.param("id"), "import job")), "Import job cancelled successfully.", request(c));

export const rows = async (c: Context<AppContext>) =>
  ok(await service.listImportRows(c.env, actor(c), param(c.req.param("id"), "import job"), validateImportRowsFilters(c.req.query())), "Import rows loaded successfully.", request(c));

export const errors = async (c: Context<AppContext>) =>
  ok(await service.listImportErrors(c.env, actor(c), param(c.req.param("id"), "import job"), validateImportRowsFilters(c.req.query())), "Import row errors loaded successfully.", request(c));
