import type { Context } from "hono";

import * as service from "./devices.service";
import {
  validateDeviceListFilters,
  validateDeviceReasonInput,
  validateDeviceRegisterInput,
  validateDeviceUpdateInput,
  validateHeartbeatInput,
} from "./devices.validators";
import { recordDeviceHeartbeat } from "../sync/sync-device-health.service";
import type { AppContext, AuthActor, DeviceAuthContext } from "../../types/api.types";
import { AuthError, DeviceAuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

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
  if (!value) throw new ValidationError("Device is required.");
  return value;
};
const filters = (c: Context<AppContext>) =>
  validateDeviceListFilters({
    outlet_id: c.req.query("outlet_id"),
    device_type: c.req.query("device_type"),
    status: c.req.query("status"),
    search: c.req.query("search"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
  });

export const listDevices = async (c: Context<AppContext>) => {
  const result = await service.listDevices(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Devices loaded successfully.", { requestId: c.get("requestId") });
};

export const getDevice = async (c: Context<AppContext>) =>
  ok({ device: await service.getDevice(c.env, actor(c), id(c)) }, "Device loaded successfully.", { requestId: c.get("requestId") });

export const register = async (c: Context<AppContext>) =>
  created(
    await service.registerDevice(c.env, actor(c), validateDeviceRegisterInput(await body(c))),
    "Device registered successfully. Save the device token securely because it will only be shown once.",
    { requestId: c.get("requestId") },
  );

export const update = async (c: Context<AppContext>) =>
  ok(
    await service.updateDevice(c.env, actor(c), id(c), validateDeviceUpdateInput(await body(c))),
    "Device updated successfully.",
    { requestId: c.get("requestId") },
  );

export const enable = async (c: Context<AppContext>) =>
  ok(
    await service.enableDevice(c.env, actor(c), id(c), validateDeviceReasonInput(await body(c))),
    "Device enabled successfully.",
    { requestId: c.get("requestId") },
  );

export const disable = async (c: Context<AppContext>) =>
  ok(
    await service.disableDevice(c.env, actor(c), id(c), validateDeviceReasonInput(await body(c))),
    "Device disabled successfully.",
    { requestId: c.get("requestId") },
  );

export const rotateToken = async (c: Context<AppContext>) =>
  ok(
    await service.rotateToken(c.env, actor(c), id(c), validateDeviceReasonInput(await body(c))),
    "Device token rotated successfully. Save the device token securely because it will only be shown once.",
    { requestId: c.get("requestId") },
  );

export const health = async (c: Context<AppContext>) =>
  ok(
    { logs: await service.getHealth(c.env, actor(c), id(c), Number(c.req.query("page") ?? 1), Number(c.req.query("page_size") ?? 25)) },
    "Device health loaded successfully.",
    { requestId: c.get("requestId") },
  );

export const heartbeat = async (c: Context<AppContext>) =>
  ok(
    await recordDeviceHeartbeat(c.env, device(c), id(c), validateHeartbeatInput(await body(c))),
    "Device heartbeat received.",
    { requestId: c.get("requestId") },
  );
