import * as repository from "./devices.repository";
import type {
  DeviceListFilters,
  DeviceRecord,
  DeviceReasonInput,
  DeviceRegisterInput,
  DeviceUpdateInput,
} from "./devices.types";
import { createAuditLog } from "../../services/audit.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { generateSecureToken, hashToken } from "../../utils/crypto";
import { AppError, NotFoundError, OutletAccessError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const scope = (context: AuthActor) => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (outletId && !permissionService.hasOutletAccess(context, outletId)) {
    throw new OutletAccessError("You do not have access to this outlet.");
  }
};

const sanitizeDevice = (device: DeviceRecord & { outlet_name?: string | null }) => {
  const { device_token_hash: _tokenHash, ...safe } = device;
  return safe;
};

const audit = async (
  env: Env,
  input: {
    context: AuthActor;
    action: string;
    entityId: string;
    outletId?: string | null;
    reason?: string;
    details?: Record<string, unknown>;
    required?: boolean;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: input.context.companyId,
    outletId: input.outletId ?? undefined,
    module: "devices",
    action: input.action,
    entityType: "device",
    entityId: input.entityId,
    actorId: input.context.actorUserId,
    reason: input.reason,
    details: input.details,
    requestId: input.context.requestId,
    ipAddress: input.context.ipAddress,
    userAgent: input.context.userAgent,
  });
  if (!result.created && input.required) {
    throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }
};

export const listDevices = async (
  env: Env,
  context: AuthActor,
  filters: DeviceListFilters,
) => {
  const [total, rows] = await Promise.all([
    repository.countDevices(env, context.companyId, filters, scope(context)),
    repository.listDevices(env, context.companyId, filters, scope(context)),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };
  return { rows, pagination };
};

export const getDevice = async (env: Env, context: AuthActor, id: string) => {
  const device = await repository.findDeviceById(env, context.companyId, id);
  if (!device) throw new NotFoundError("Device not found.");
  assertOutletAccess(context, device.outlet_id);
  return sanitizeDevice(device);
};

export const registerDevice = async (
  env: Env,
  context: AuthActor,
  input: DeviceRegisterInput,
) => {
  assertOutletAccess(context, input.outlet_id);
  const outlet = await repository.findActiveOutlet(env, context.companyId, input.outlet_id);
  if (!outlet || outlet.status !== "active") {
    throw new ValidationError("Please choose an active outlet for this device.");
  }
  const rawToken = input.initial_token ?? generateSecureToken(32);
  const tokenHash = await hashToken(rawToken, env.DEVICE_TOKEN_SECRET);
  const id = createPrefixedId("device");
  await repository.createDevice(env, {
    id,
    companyId: context.companyId,
    outletId: input.outlet_id,
    deviceName: input.device_name,
    deviceType: input.device_type,
    tokenHash,
  });
  await repository.createDeviceSyncState(env, {
    id: createPrefixedId("dev_state"),
    companyId: context.companyId,
    outletId: input.outlet_id,
    deviceId: id,
  });
  await audit(env, {
    context,
    action: "device_registered",
    entityId: id,
    outletId: input.outlet_id,
    reason: input.reason,
    required: true,
  });
  return {
    device_id: id,
    device_token: rawToken,
    token_shown_once: true,
  };
};

export const updateDevice = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: DeviceUpdateInput,
) => {
  const existing = await repository.findDeviceById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Device not found.");
  assertOutletAccess(context, existing.outlet_id);
  if (input.outlet_id) assertOutletAccess(context, input.outlet_id);
  await repository.updateDevice(env, context.companyId, id, {
    outletId: input.outlet_id,
    deviceName: input.device_name,
    deviceType: input.device_type,
  });
  await audit(env, {
    context,
    action: "device_updated",
    entityId: id,
    outletId: input.outlet_id ?? existing.outlet_id,
    details: input as Record<string, unknown>,
    required: true,
  });
  return { updated: true };
};

export const enableDevice = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: DeviceReasonInput,
) => {
  const device = await repository.findDeviceById(env, context.companyId, id);
  if (!device) throw new NotFoundError("Device not found.");
  assertOutletAccess(context, device.outlet_id);
  await repository.updateDeviceStatus(env, context.companyId, id, "active");
  await audit(env, {
    context,
    action: "device_enabled",
    entityId: id,
    outletId: device.outlet_id,
    reason: input.reason,
    required: true,
  });
  return { enabled: true };
};

export const disableDevice = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: DeviceReasonInput,
) => {
  const device = await repository.findDeviceById(env, context.companyId, id);
  if (!device) throw new NotFoundError("Device not found.");
  assertOutletAccess(context, device.outlet_id);
  await repository.updateDeviceStatus(env, context.companyId, id, "disabled");
  await audit(env, {
    context,
    action: "device_disabled",
    entityId: id,
    outletId: device.outlet_id,
    reason: input.reason,
    required: true,
  });
  await broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type: "device.disabled",
    payload: { device_id: id },
    triggeredBy: context.actorUserId,
  }).catch(() => undefined);
  return { disabled: true };
};

export const rotateToken = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: DeviceReasonInput,
) => {
  const device = await repository.findDeviceById(env, context.companyId, id);
  if (!device) throw new NotFoundError("Device not found.");
  assertOutletAccess(context, device.outlet_id);
  const rawToken = generateSecureToken(32);
  await repository.updateDeviceToken(
    env,
    context.companyId,
    id,
    await hashToken(rawToken, env.DEVICE_TOKEN_SECRET),
  );
  await audit(env, {
    context,
    action: "device_token_rotated",
    entityId: id,
    outletId: device.outlet_id,
    reason: input.reason,
    required: true,
  });
  return {
    device_id: id,
    device_token: rawToken,
    token_shown_once: true,
  };
};

export const getHealth = async (
  env: Env,
  context: AuthActor,
  id: string,
  page = 1,
  pageSize = 25,
) => {
  const device = await repository.findDeviceById(env, context.companyId, id);
  if (!device) throw new NotFoundError("Device not found.");
  assertOutletAccess(context, device.outlet_id);
  return repository.listHealthLogs(env, context.companyId, id, page, pageSize);
};

export const healthSummary = (
  env: Env,
  context: AuthActor,
  filters: DeviceListFilters,
) => repository.healthSummary(env, context.companyId, filters, scope(context));
