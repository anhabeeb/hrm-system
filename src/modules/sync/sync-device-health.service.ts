import * as devicesRepository from "../devices/devices.repository";
import type { DeviceHeartbeatInput } from "../devices/devices.types";
import { createAuditLog } from "../../services/audit.service";
import type { DeviceAuthContext } from "../../types/api.types";
import { DeviceAuthError } from "../../utils/errors";

export const recordDeviceHeartbeat = async (
  env: Env,
  device: DeviceAuthContext,
  routeDeviceId: string,
  input: DeviceHeartbeatInput,
) => {
  if (routeDeviceId !== device.deviceId) {
    throw new DeviceAuthError("Device authentication is required.");
  }

  await devicesRepository.touchDevice(env, device.deviceId);
  await devicesRepository.createHealthLog(env, {
    companyId: device.companyId,
    outletId: device.outletId,
    deviceId: device.deviceId,
    deviceType: device.deviceType,
    healthStatus: input.health_status,
    pendingCount: input.pending_count ?? 0,
    failedCount: input.failed_count ?? 0,
    conflictCount: input.conflict_count ?? 0,
    batteryLevel: input.battery_level,
    appVersion: input.app_version,
    networkStatus: input.network_status,
  });
  await devicesRepository.upsertDeviceSyncState(env, {
    companyId: device.companyId,
    outletId: device.outletId,
    deviceId: device.deviceId,
    pendingCount: input.pending_count ?? 0,
    failedCount: input.failed_count ?? 0,
    conflictCount: input.conflict_count ?? 0,
  });
  await createAuditLog(env, {
    companyId: device.companyId,
    outletId: device.outletId ?? undefined,
    module: "devices",
    action: "device_heartbeat_received",
    severity: "info",
    entityType: "device",
    entityId: device.deviceId,
    deviceId: device.deviceId,
    details: {
      health_status: input.health_status,
      pending_count: input.pending_count ?? 0,
      failed_count: input.failed_count ?? 0,
      conflict_count: input.conflict_count ?? 0,
      battery_level: input.battery_level,
      app_version: input.app_version,
      network_status: input.network_status,
    },
    requestId: device.requestId,
  }).catch(() => undefined);

  return { received: true };
};
