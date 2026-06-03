import * as attendanceService from "../attendance/attendance.service";
import * as repository from "./kiosk.repository";
import type { KioskClockInput, KioskEmployeeFilters } from "./kiosk.types";
import type { DeviceAuthContext, PaginationMeta } from "../../types/api.types";
import { OutletAccessError } from "../../utils/errors";

const requireOutlet = (device: DeviceAuthContext): string => {
  if (!device.outletId) throw new OutletAccessError("This device is not assigned to an outlet.");
  return device.outletId;
};

export const getStatus = async (env: Env, device: DeviceAuthContext) => {
  const row = await repository.findDevice(env, device.companyId, device.deviceId);
  return {
    device_id: device.deviceId,
    outlet_id: device.outletId,
    device_type: device.deviceType,
    status: row?.status ?? "active",
    last_seen_at: row?.last_seen_at ?? null,
    last_sync_at: row?.last_sync_at ?? null,
    pending_sync_placeholder: 0,
    server_time: new Date().toISOString(),
  };
};

export const listEmployees = async (
  env: Env,
  device: DeviceAuthContext,
  filters: KioskEmployeeFilters,
) => {
  const outletId = requireOutlet(device);
  const [total, rows] = await Promise.all([
    repository.countKioskEmployees(env, device.companyId, outletId, filters),
    repository.listKioskEmployees(env, device.companyId, outletId, filters),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: Math.ceil(total / filters.page_size),
  };
  return { rows, pagination };
};

export const clockIn = (env: Env, device: DeviceAuthContext, input: KioskClockInput) =>
  attendanceService.kioskClock(env, device, input, "clock_in");

export const clockOut = (env: Env, device: DeviceAuthContext, input: KioskClockInput) =>
  attendanceService.kioskClock(env, device, input, "clock_out");

export const today = (env: Env, device: DeviceAuthContext) =>
  repository.kioskToday(env, device.companyId, requireOutlet(device));

export const deviceSummary = async (env: Env, device: DeviceAuthContext) => ({
  ...(await repository.deviceSummary(env, device.companyId, requireOutlet(device))),
  last_sync_at: (await repository.findDevice(env, device.companyId, device.deviceId))?.last_sync_at ?? null,
  server_time: new Date().toISOString(),
});
