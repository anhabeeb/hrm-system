import * as devicesRepository from "../modules/devices/devices.repository";
import type { DeviceAuthContext } from "../types/api.types";
import { DeviceAuthError } from "../utils/errors";
import { hashToken } from "../utils/crypto";

export const authenticateDevice = async (
  env: Env,
  token: string | null,
  requestId: string,
): Promise<DeviceAuthContext> => {
  if (!token) {
    throw new DeviceAuthError("Device token is required.", "DEVICE_TOKEN_REQUIRED");
  }

  const tokenHash = await hashToken(token, env.DEVICE_TOKEN_SECRET);
  const device = await devicesRepository.findDeviceByTokenHash(env, tokenHash);

  if (!device) {
    throw new DeviceAuthError("Device authentication failed.", "DEVICE_AUTH_FAILED");
  }

  if (device.status !== "active") {
    throw new DeviceAuthError(
      "This device is inactive. Please contact your system administrator.",
      "DEVICE_INACTIVE",
    );
  }

  await devicesRepository.touchDevice(env, device.id).catch(() => undefined);

  return {
    requestId,
    companyId: device.company_id,
    deviceId: device.id,
    outletId: device.outlet_id,
    deviceType: device.device_type,
  };
};

export const ensureDeviceOutletAccess = (
  context: DeviceAuthContext,
  outletId: string | null | undefined,
) => {
  if (outletId && context.outletId && outletId !== context.outletId) {
    throw new DeviceAuthError(
      "This device is not allowed to access this outlet.",
      "DEVICE_OUTLET_DENIED",
    );
  }
};
