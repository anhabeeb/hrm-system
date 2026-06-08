import type { Context } from "hono";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AppError } from "../../utils/errors";
import { ok } from "../../utils/response";
import { safeAttachmentHeader } from "../../utils/security";
import * as service from "./report-exports.service";
import { validateExportCreate, validateExportListFilters, validateExportPreview } from "./report-exports.validators";

const actor = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const request = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const requiredParam = (value: string | undefined, label: string) => {
  if (!value) throw new AppError(`Missing ${label}.`, "REPORT_EXPORT_NOT_FOUND", 404);
  return value;
};

const jsonBody = async (c: Context<AppContext>) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};

export const catalog = (c: Context<AppContext>) =>
  ok(service.getExportCatalog(actor(c)), "Export catalog loaded successfully.", request(c));

export const jobs = async (c: Context<AppContext>) =>
  ok(await service.listExportJobs(c.env, actor(c), validateExportListFilters(c.req.query())), "Export history loaded successfully.", request(c));

export const getJob = async (c: Context<AppContext>) =>
  ok(await service.getExportJob(c.env, actor(c), requiredParam(c.req.param("id"), "export job")), "Export job loaded successfully.", request(c));

export const preview = async (c: Context<AppContext>) =>
  ok(await service.previewExport(c.env, actor(c), validateExportPreview(await jsonBody(c))), "Export preview generated successfully.", request(c));

export const createJob = async (c: Context<AppContext>) =>
  ok(await service.createExportJob(c.env, actor(c), validateExportCreate(await jsonBody(c))), "Export job created successfully.", request(c));

export const generate = async (c: Context<AppContext>) => {
  const result = await service.generateExport(c.env, actor(c), requiredParam(c.req.param("id"), "export job"));
  const { csv: _csv, data: _data, ...payload } = result;
  return ok(payload, "Export job generated successfully.", request(c));
};

export const download = async (c: Context<AppContext>) => {
  const result = await service.downloadExport(c.env, actor(c), requiredParam(c.req.param("id"), "export job"));
  const fileName = result.export_job.file_name ?? "report-export.csv";
  return new Response(result.csv ?? "", {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": safeAttachmentHeader(fileName, "report-export.csv"),
      "cache-control": "no-store",
      "x-request-id": c.get("requestId"),
    },
  });
};

export const cancel = async (c: Context<AppContext>) =>
  ok(await service.cancelExportJob(c.env, actor(c), requiredParam(c.req.param("id"), "export job")), "Export job cancelled successfully.", request(c));

export const print = async (c: Context<AppContext>) =>
  ok(await service.printReport(c.env, actor(c), decodeURIComponent(requiredParam(c.req.param("reportKey"), "report key")), c.req.query()), "Print data loaded successfully.", request(c));

export const printEmployee = async (c: Context<AppContext>) =>
  ok(await service.printEmployeeProfile(c.env, actor(c), requiredParam(c.req.param("employeeId"), "employee")), "Employee profile print data loaded successfully.", request(c));
