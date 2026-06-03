import { z } from "zod";

import { DEVICE_HEALTH_STATUSES, DEVICE_TYPES } from "./devices.constants";
import type {
  DeviceHeartbeatInput,
  DeviceListFilters,
  DeviceReasonInput,
  DeviceRegisterInput,
  DeviceUpdateInput,
} from "./devices.types";
import { AppError, ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

const reason = z.string().trim().min(3, "A reason is required for this action.");

export const validateDeviceListFilters = (
  query: Record<string, string | undefined>,
): DeviceListFilters =>
  parse(
    z.object({
      outlet_id: z.string().optional(),
      device_type: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
    }),
    query,
  );

export const validateDeviceRegisterInput = (payload: unknown): DeviceRegisterInput =>
  parse(
    z.object({
      outlet_id: z.string().trim().min(1, "Outlet is required."),
      device_name: z.string().trim().min(1, "Device name is required."),
      device_type: z.enum(DEVICE_TYPES),
      initial_token: z.string().trim().optional(),
      reason: z.string().trim().optional(),
    }),
    payload,
  );

export const validateDeviceUpdateInput = (payload: unknown): DeviceUpdateInput =>
  {
    const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    if ("status" in raw || "last_seen_at" in raw || "last_sync_at" in raw) {
      throw new AppError(
        "Device status changes must be made through the enable or disable action.",
        "DEVICE_STATUS_CHANGE_REQUIRES_STATUS_ENDPOINT",
        400,
      );
    }
    if ("device_token_hash" in raw) {
      throw new AppError(
        "Device token changes must be made through the rotate token action.",
        "DEVICE_TOKEN_CHANGE_REQUIRES_ROTATE_ENDPOINT",
        400,
      );
    }
    return parse(
      z.object({
        outlet_id: z.string().trim().optional(),
        device_name: z.string().trim().optional(),
        device_type: z.enum(DEVICE_TYPES).optional(),
      }),
      payload,
    );
  };

export const validateDeviceReasonInput = (payload: unknown): DeviceReasonInput =>
  parse(z.object({ reason }), payload);

export const validateHeartbeatInput = (payload: unknown): DeviceHeartbeatInput =>
  parse(
    z.object({
      health_status: z.enum(DEVICE_HEALTH_STATUSES),
      pending_count: z.number().int().min(0).default(0),
      failed_count: z.number().int().min(0).default(0),
      conflict_count: z.number().int().min(0).default(0),
      battery_level: z.number().int().min(0).max(100).optional(),
      app_version: z.string().trim().optional(),
      network_status: z.string().trim().optional(),
    }),
    payload,
  );
