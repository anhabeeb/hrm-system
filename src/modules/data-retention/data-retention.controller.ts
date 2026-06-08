import type { Context } from "hono";
import type { AppContext, AuthActor } from "../../types/api.types";
import { AppError } from "../../utils/errors";
import { ok } from "../../utils/response";
import * as service from "./data-retention.service";
import { validateArchiveApply, validateArchiveItemAction, validateArchiveItemFilters, validateArchiveListFilters, validateArchivePreview, validateRetentionSettings } from "./data-retention.validators";

const actor = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const request = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const param = (value: string | undefined, label: string) => {
  if (!value) throw new AppError(`Missing ${label}.`, "ARCHIVE_JOB_NOT_FOUND", 404);
  return value;
};
const body = async (c: Context<AppContext>) => {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
};

export const settings = async (c: Context<AppContext>) =>
  ok(await service.getSettings(c.env, actor(c)), "Data retention settings loaded successfully.", request(c));

export const updateSettings = async (c: Context<AppContext>) =>
  ok(await service.updateSettings(c.env, actor(c), validateRetentionSettings(await body(c))), "Data retention settings saved successfully.", request(c));

export const policies = async (c: Context<AppContext>) =>
  ok(await service.getSettings(c.env, actor(c)), "Data retention policies loaded successfully.", request(c));

export const jobs = async (c: Context<AppContext>) =>
  ok(await service.listArchiveJobs(c.env, actor(c), validateArchiveListFilters(c.req.query())), "Archive jobs loaded successfully.", request(c));

export const getJob = async (c: Context<AppContext>) =>
  ok(await service.getArchiveJob(c.env, actor(c), param(c.req.param("id"), "archive job")), "Archive job loaded successfully.", request(c));

export const preview = async (c: Context<AppContext>) =>
  ok(await service.previewArchive(c.env, actor(c), validateArchivePreview(await body(c))), "Archive preview generated successfully.", request(c));

export const apply = async (c: Context<AppContext>) =>
  ok(await service.applyArchiveJob(c.env, actor(c), param(c.req.param("id"), "archive job"), validateArchiveApply(await body(c))), "Archive job applied successfully.", request(c));

export const cancel = async (c: Context<AppContext>) => {
  const payload = validateArchiveItemAction(await body(c));
  return ok(await service.cancelArchiveJob(c.env, actor(c), param(c.req.param("id"), "archive job"), payload.reason), "Archive job cancelled successfully.", request(c));
};

export const items = async (c: Context<AppContext>) =>
  ok(await service.listArchiveItems(c.env, actor(c), param(c.req.param("id"), "archive job"), validateArchiveItemFilters(c.req.query())), "Archive job items loaded successfully.", request(c));

export const archiveItem = async (c: Context<AppContext>) =>
  ok(await service.archiveItem(c.env, actor(c), param(c.req.param("sourceType"), "source type") as any, param(c.req.param("sourceId"), "source id"), validateArchiveItemAction(await body(c))), "Item archived successfully.", request(c));

export const restoreItem = async (c: Context<AppContext>) =>
  ok(await service.restoreArchivedItem(c.env, actor(c), param(c.req.param("sourceType"), "source type") as any, param(c.req.param("sourceId"), "source id"), validateArchiveItemAction(await body(c))), "Item restored successfully.", request(c));

export const summary = async (c: Context<AppContext>) =>
  ok(await service.summary(c.env, actor(c)), "Data retention summary loaded successfully.", request(c));
