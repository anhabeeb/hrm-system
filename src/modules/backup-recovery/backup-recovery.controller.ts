import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { created, ok } from "../../utils/response";
import { BACKUP_MESSAGES } from "./backup-recovery.constants";
import * as service from "./backup-recovery.service";
import {
  validateBackupCreate,
  validateBackupRestoreSettings,
  validateList,
  validateReason,
  validateRestoreApply,
  validateRestoreJobCreate,
  validateRestoreRequest,
  validateRetentionPolicy,
} from "./backup-recovery.validators";

const auth = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const requestId = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const json = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

export const createBackup = async (c: Context<AppContext>) =>
  created(await service.createBackup(c.env, auth(c), validateBackupCreate(await json(c))), BACKUP_MESSAGES.completed, requestId(c));

export const generateBackup = async (c: Context<AppContext>) =>
  ok(await service.generateBackup(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason), BACKUP_MESSAGES.completed, requestId(c));

export const listBackups = async (c: Context<AppContext>) =>
  ok(await service.listBackups(c.env, auth(c), validateList(c.req.query())), BACKUP_MESSAGES.list, requestId(c));

export const getBackup = async (c: Context<AppContext>) =>
  ok(await service.getBackup(c.env, auth(c), c.req.param("id") ?? ""), BACKUP_MESSAGES.detail, requestId(c));

export const downloadBackup = async (c: Context<AppContext>) =>
  service.downloadBackup(c.env, auth(c), c.req.param("id") ?? "");

export const verifyBackup = async (c: Context<AppContext>) =>
  ok(
    await service.verifyBackup(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason),
    BACKUP_MESSAGES.verified,
    requestId(c),
  );

export const deleteBackup = async (c: Context<AppContext>) =>
  ok(
    await service.deleteBackup(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason),
    BACKUP_MESSAGES.deleted,
    requestId(c),
  );

export const cancelBackup = async (c: Context<AppContext>) =>
  ok(await service.cancelBackupJob(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason), "Backup job cancelled.", requestId(c));

export const status = async (c: Context<AppContext>) =>
  ok(await service.getStatus(c.env, auth(c)), BACKUP_MESSAGES.status, requestId(c));

export const getRetentionPolicy = async (c: Context<AppContext>) =>
  ok(await service.getRetentionPolicy(c.env, auth(c)), BACKUP_MESSAGES.retentionLoaded, requestId(c));

export const updateRetentionPolicy = async (c: Context<AppContext>) =>
  ok(
    await service.updateRetentionPolicy(c.env, auth(c), validateRetentionPolicy(await json(c))),
    BACKUP_MESSAGES.retentionUpdated,
    requestId(c),
  );

export const getSettings = async (c: Context<AppContext>) =>
  ok(await service.getBackupRestoreSettings(c.env, auth(c)), BACKUP_MESSAGES.settingsLoaded, requestId(c));

export const updateSettings = async (c: Context<AppContext>) =>
  ok(await service.updateBackupRestoreSettings(c.env, auth(c), validateBackupRestoreSettings(await json(c))), BACKUP_MESSAGES.settingsUpdated, requestId(c));

export const createRestoreRequest = async (c: Context<AppContext>) =>
  created(
    await service.createRestoreRequest(c.env, auth(c), validateRestoreRequest(await json(c))),
    BACKUP_MESSAGES.restoreCreated,
    requestId(c),
  );

export const listRestoreRequests = async (c: Context<AppContext>) =>
  ok(await service.listRestoreRequests(c.env, auth(c), validateList(c.req.query())), BACKUP_MESSAGES.restoreList, requestId(c));

export const getRestoreRequest = async (c: Context<AppContext>) =>
  ok(await service.getRestoreRequest(c.env, auth(c), c.req.param("id") ?? ""), "Restore request loaded successfully.", requestId(c));

export const approveRestoreRequest = async (c: Context<AppContext>) =>
  ok(
    await service.approveRestoreRequest(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason),
    BACKUP_MESSAGES.restoreApproved,
    requestId(c),
  );

export const rejectRestoreRequest = async (c: Context<AppContext>) =>
  ok(
    await service.rejectRestoreRequest(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason),
    BACKUP_MESSAGES.restoreRejected,
    requestId(c),
  );

export const createRestoreJob = async (c: Context<AppContext>) =>
  created(await service.createRestoreJob(c.env, auth(c), validateRestoreJobCreate(await json(c))), BACKUP_MESSAGES.restoreCreated, requestId(c));

export const listRestoreJobs = async (c: Context<AppContext>) =>
  ok(await service.listRestoreJobs(c.env, auth(c), validateList(c.req.query())), BACKUP_MESSAGES.restoreList, requestId(c));

export const getRestoreJob = async (c: Context<AppContext>) =>
  ok(await service.getRestoreJob(c.env, auth(c), c.req.param("id") ?? ""), "Restore job loaded successfully.", requestId(c));

export const validateRestoreJob = async (c: Context<AppContext>) =>
  ok(await service.validateRestoreJob(c.env, auth(c), c.req.param("id") ?? ""), BACKUP_MESSAGES.restoreValidated, requestId(c));

export const previewRestoreJob = async (c: Context<AppContext>) =>
  ok(await service.previewRestoreJob(c.env, auth(c), c.req.param("id") ?? ""), BACKUP_MESSAGES.restoreValidated, requestId(c));

export const applyRestoreJob = async (c: Context<AppContext>) =>
  ok(await service.applyRestoreJob(c.env, auth(c), c.req.param("id") ?? "", validateRestoreApply(await json(c))), BACKUP_MESSAGES.restoreApplied, requestId(c));

export const cancelRestoreJob = async (c: Context<AppContext>) =>
  ok(await service.cancelRestoreJob(c.env, auth(c), c.req.param("id") ?? "", validateReason(await json(c)).reason), BACKUP_MESSAGES.restoreCancelled, requestId(c));
