import type { Context } from "hono";

import * as service from "./biometric.service";
import {
  validateBiometricBatchInput,
  validateBiometricDeviceInput,
  validateBiometricDeviceUpdateInput,
  validateBiometricListFilters,
  validateBiometricMappingInput,
  validateBiometricMappingUpdateInput,
  validateBiometricPunchInput,
  validateBiometricReasonInput,
  validateUnmatchedMapInput,
} from "./biometric.validators";
import type { AppContext, AuthActor, DeviceAuthContext } from "../../types/api.types";
import { AuthError, DeviceAuthError, ValidationError } from "../../utils/errors";
import { created, ok, paginated } from "../../utils/response";

const body = (c: Context<AppContext>) => c.req.json().catch(() => ({}));
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
const id = (c: Context<AppContext>) => {
  const value = c.req.param("id") || c.req.param("logId");
  if (!value) throw new ValidationError("Biometric record is required.");
  return value;
};
const filters = (c: Context<AppContext>) =>
  validateBiometricListFilters({
    outlet_id: c.req.query("outlet_id"),
    device_id: c.req.query("device_id"),
    employee_id: c.req.query("employee_id"),
    biometric_user_id: c.req.query("biometric_user_id"),
    event_type: c.req.query("event_type"),
    sync_status: c.req.query("sync_status"),
    enrollment_status: c.req.query("enrollment_status"),
    is_active: c.req.query("is_active"),
    device_type: c.req.query("device_type"),
    sync_mode: c.req.query("sync_mode"),
    status: c.req.query("status"),
    search: c.req.query("search"),
    date_from: c.req.query("date_from"),
    date_to: c.req.query("date_to"),
    page: c.req.query("page"),
    page_size: c.req.query("page_size"),
  });

export const getBiometricPunchMessage = (result: Record<string, unknown>) => {
  if (result.deduped) return "Duplicate biometric punch ignored.";
  if (result.unmatched) return "This biometric user is not mapped to an employee.";
  if (result.conflict_created && result.conflict_type === "device_time_warning_placeholder") {
    return "Device time may be incorrect. Please review this biometric punch.";
  }
  if (result.conflict_created) return "This biometric punch needs review.";
  if (result.warning) return "Biometric punch received successfully. Device time may need review.";
  return "Biometric punch received successfully.";
};

export const getBiometricBatchMessage = (result: {
  rejected: unknown[];
  conflicts: unknown[];
  unmatched: unknown[];
}) =>
  result.rejected.length > 0
    ? "Some biometric punches could not be processed. Please review the rejected records."
    : result.conflicts.length > 0 || result.unmatched.length > 0
    ? "Some biometric punches need review."
    : "Biometric punch batch received successfully.";

export const getBiometricReprocessMessage = (
  result: Record<string, unknown>,
  mapped = false,
) => {
  const prefix = mapped ? "Biometric user mapped" : "Biometric log reprocessed";
  if (result.attendance_event_id) {
    return mapped
      ? "Biometric user mapped and punch reprocessed successfully."
      : "Biometric log reprocessed successfully.";
  }
  if (result.deduped) {
    return mapped
      ? "Biometric user mapped. Duplicate biometric punch ignored."
      : "Duplicate biometric punch ignored.";
  }
  if (result.unmatched) {
    return "This biometric user is not mapped to an employee.";
  }
  if (result.conflict_created && result.conflict_type === "payroll_locked") {
    return `${prefix}, but the punch belongs to a locked payroll period and needs review.`;
  }
  if (result.conflict_created) {
    return `${prefix}, but this punch needs review.`;
  }
  return mapped
    ? "Biometric user mapped and punch reprocessed successfully."
    : "Biometric log reprocessed successfully.";
};

export const punch = async (c: Context<AppContext>) => {
  const result = await service.processBiometricPunch(
    c.env,
    device(c),
    validateBiometricPunchInput(await body(c)),
  );
  return ok(result, getBiometricPunchMessage(result), { requestId: c.get("requestId") });
};

export const batch = async (c: Context<AppContext>) => {
  const max = await service.getMaxBiometricBatchSize(c.env, device(c).companyId);
  const result = await service.processBatch(
    c.env,
    device(c),
    validateBiometricBatchInput(await body(c), max),
    "push_api",
  );
  return ok(result, getBiometricBatchMessage(result), { requestId: c.get("requestId") });
};

export const bridgeBatch = async (c: Context<AppContext>) => {
  const max = await service.getMaxBiometricBatchSize(c.env, device(c).companyId);
  const result = await service.processBatch(
    c.env,
    device(c),
    validateBiometricBatchInput(await body(c), max),
    "bridge",
  );
  return ok(
    result,
    result.rejected.length > 0
      ? "Some biometric punches could not be processed. Please review the rejected records."
      : result.conflicts.length > 0 || result.unmatched.length > 0
      ? "Some biometric punches need review."
      : "Biometric bridge batch received successfully.",
    { requestId: c.get("requestId") },
  );
};

export const deviceStatus = async (c: Context<AppContext>) =>
  ok(await service.deviceStatus(c.env, device(c)), "Biometric device status loaded successfully.", { requestId: c.get("requestId") });

export const listDevices = async (c: Context<AppContext>) => {
  const result = await service.listDevices(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Biometric devices loaded successfully.", { requestId: c.get("requestId") });
};

export const getDevice = async (c: Context<AppContext>) =>
  ok({ device: await service.getDevice(c.env, actor(c), id(c)) }, "Biometric device loaded successfully.", { requestId: c.get("requestId") });

export const registerDevice = async (c: Context<AppContext>) =>
  created(
    await service.registerDevice(c.env, actor(c), validateBiometricDeviceInput(await body(c))),
    "Biometric device registered successfully.",
    { requestId: c.get("requestId") },
  );

export const updateDevice = async (c: Context<AppContext>) =>
  ok(
    await service.updateDevice(c.env, actor(c), id(c), validateBiometricDeviceUpdateInput(await body(c))),
    "Biometric device updated successfully.",
    { requestId: c.get("requestId") },
  );

export const enableDevice = async (c: Context<AppContext>) =>
  ok(
    await service.setDeviceStatus(c.env, actor(c), id(c), "active", validateBiometricReasonInput(await body(c))),
    "Biometric device enabled successfully.",
    { requestId: c.get("requestId") },
  );

export const disableDevice = async (c: Context<AppContext>) =>
  ok(
    await service.setDeviceStatus(c.env, actor(c), id(c), "suspended", validateBiometricReasonInput(await body(c))),
    "Biometric device disabled successfully.",
    { requestId: c.get("requestId") },
  );

export const revokeDevice = async (c: Context<AppContext>) =>
  ok(
    await service.setDeviceStatus(c.env, actor(c), id(c), "revoked", validateBiometricReasonInput(await body(c))),
    "Biometric device revoked successfully.",
    { requestId: c.get("requestId") },
  );

export const rotateDeviceToken = async (c: Context<AppContext>) =>
  ok(
    await service.rotateDeviceToken(c.env, actor(c), id(c), validateBiometricReasonInput(await body(c))),
    "Biometric device token rotated successfully.",
    { requestId: c.get("requestId") },
  );

export const listMappings = async (c: Context<AppContext>) => {
  const result = await service.listMappings(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Biometric mappings loaded successfully.", { requestId: c.get("requestId") });
};

export const createMapping = async (c: Context<AppContext>) =>
  created(
    await service.createMapping(c.env, actor(c), validateBiometricMappingInput(await body(c))),
    "Employee biometric mapping saved successfully.",
    { requestId: c.get("requestId") },
  );

export const updateMapping = async (c: Context<AppContext>) =>
  ok(
    await service.updateMapping(c.env, actor(c), id(c), validateBiometricMappingUpdateInput(await body(c))),
    "Employee biometric mapping updated successfully.",
    { requestId: c.get("requestId") },
  );

export const disableMapping = async (c: Context<AppContext>) =>
  ok(
    await service.disableMapping(c.env, actor(c), id(c), validateBiometricReasonInput(await body(c))),
    "Employee biometric mapping disabled successfully.",
    { requestId: c.get("requestId") },
  );

export const listLogs = async (c: Context<AppContext>) => {
  const result = await service.listLogs(c.env, actor(c), filters(c));
  return paginated(result.rows, result.pagination, "Biometric logs loaded successfully.", { requestId: c.get("requestId") });
};

export const getLog = async (c: Context<AppContext>) =>
  ok({ log: await service.getLog(c.env, actor(c), id(c)) }, "Biometric log loaded successfully.", { requestId: c.get("requestId") });

export const unmatched = async (c: Context<AppContext>) => {
  const result = await service.listLogs(c.env, actor(c), filters(c), true);
  return paginated(result.rows, result.pagination, "Unmatched biometric users loaded successfully.", { requestId: c.get("requestId") });
};

export const mapUnmatched = async (c: Context<AppContext>) =>
  {
    const result = await service.mapUnmatchedLog(c.env, actor(c), id(c), validateUnmatchedMapInput(await body(c)));
    return ok(result, getBiometricReprocessMessage(result, true), { requestId: c.get("requestId") });
  };

export const reprocessLog = async (c: Context<AppContext>) =>
  {
    const result = await service.reprocessBiometricLog(c.env, actor(c), id(c), validateBiometricReasonInput(await body(c)));
    return ok(result, getBiometricReprocessMessage(result), { requestId: c.get("requestId") });
  };

export const rejectLog = async (c: Context<AppContext>) =>
  ok(
    await service.rejectBiometricLog(c.env, actor(c), id(c), validateBiometricReasonInput(await body(c))),
    "Biometric punch rejected successfully.",
    { requestId: c.get("requestId") },
  );
