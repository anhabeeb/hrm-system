import type { Context } from "hono";

import type { AppContext, AuthActor } from "../../types/api.types";
import { created, ok } from "../../utils/response";
import { BACKUP_MESSAGES } from "./backup-recovery.constants";
import * as service from "./backup-recovery.service";
import {
  validateBackupCreate,
  validateList,
  validateReason,
  validateRestoreRequest,
  validateRetentionPolicy,
} from "./backup-recovery.validators";

const auth = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const requestId = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const json = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

export const createBackup = async (c: Context<AppContext>) =>
  created(await service.createBackup(c.env, auth(c), validateBackupCreate(await json(c))), BACKUP_MESSAGES.completed, requestId(c));

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
