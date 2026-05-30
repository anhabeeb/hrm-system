import type { Context } from "hono";

import * as service from "./sync.service";
import {
  validateConflictResolveInput,
  validateForceResyncInput,
  validateRetryInput,
  validateSyncListFilters,
  validateSyncPullQuery,
  validateSyncPushInput,
} from "./sync.validators";
import type { AppContext, AuthActor, DeviceAuthContext } from "../../types/api.types";
import { AuthError, DeviceAuthError, ValidationError } from "../../utils/errors";
import { ok, paginated } from "../../utils/response";

const actor = (c: Context<AppContext>): AuthActor => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};
const device = (c: Context<AppContext>): DeviceAuthContext => {
  const deviceAuth = c.get("deviceAuth");
  if (!deviceAuth) throw new DeviceAuthError("Device authentication is required.");
  return deviceAuth;
};
const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
const id = (c: Context<AppContext>) => {
  const value = c.req.param("id");
  if (!value) throw new ValidationError("Sync record is required.");
  return value;
};
const filters = (c: Context<AppContext>) =>
  validateSyncListFilters({
    status: c.req.query("status"),
    conflict_type: c.req.query("conflict_type"),
    entity_type: c.req.query("entity_type"),
    employee_id: c.req.query("employee_id"),
    outlet_id: c.req.query("outlet_id"),
    device_id: c.req.query("device_id"),
    date_from: c.req.query("date_from"),
    date_to: c.req.query("date_to"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
    sort_by: c.req.query("sort_by"),
    sort_direction: c.req.query("sort_direction"),
  });

export const getSyncPushMessage = (result: {
  rejected: unknown[];
  conflicts: unknown[];
}) => {
  if (result.conflicts.length > 0) {
    return "Some records need review before they can be applied.";
  }
  if (result.rejected.length > 0) {
    return "Some records could not be synced. Please review the rejected records.";
  }
  return "Sync completed successfully.";
};

export const push = async (c: Context<AppContext>) => {
  const maxRecords = await service.getMaxRecordsPerBatch(c.env, device(c).companyId);
  const result = await service.push(c.env, device(c), validateSyncPushInput(await body(c), maxRecords));
  return ok(
    result,
    getSyncPushMessage(result),
    { requestId: c.get("requestId") },
  );
};

export const pull = async (c: Context<AppContext>) =>
  ok(
    await service.pull(
      c.env,
      device(c),
      validateSyncPullQuery({
        outlet_id: c.req.query("outlet_id"),
        since: c.req.query("since"),
        include: c.req.query("include"),
      }),
    ),
    "Sync updates loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const status = async (c: Context<AppContext>) =>
  ok(await service.status(c.env, actor(c), filters(c)), "Sync status loaded successfully.", { requestId: c.get("requestId") });

export const retry = async (c: Context<AppContext>) =>
  ok(await service.retry(c.env, actor(c), validateRetryInput(await body(c))), "Sync retry requested successfully.", { requestId: c.get("requestId") });

export const forceResync = async (c: Context<AppContext>) =>
  ok(await service.forceResync(c.env, actor(c), validateForceResyncInput(await body(c))), "Force resync requested successfully.", { requestId: c.get("requestId") });

export const listConflicts = async (c: Context<AppContext>) => {
  const result = await service.listConflicts(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Sync conflicts loaded successfully.", { requestId: c.get("requestId") });
};

export const getConflict = async (c: Context<AppContext>) =>
  ok({ conflict: await service.getConflict(c.env, actor(c), id(c)) }, "Sync conflict loaded successfully.", { requestId: c.get("requestId") });

export const resolveConflict = async (c: Context<AppContext>) =>
  ok(await service.resolveConflict(c.env, actor(c), id(c), validateConflictResolveInput(await body(c))), "Sync conflict resolved successfully.", { requestId: c.get("requestId") });

export const listBatches = async (c: Context<AppContext>) => {
  const result = await service.listBatches(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Sync batches loaded successfully.", { requestId: c.get("requestId") });
};

export const getBatch = async (c: Context<AppContext>) =>
  ok(await service.getBatch(c.env, actor(c), id(c)), "Sync batch loaded successfully.", { requestId: c.get("requestId") });

export const health = async (c: Context<AppContext>) =>
  ok({ devices: await service.health(c.env, actor(c), filters(c)) }, "Device health loaded successfully.", { requestId: c.get("requestId") });
