import { z } from "zod";

import {
  BIOMETRIC_DEVICE_TYPES,
  BIOMETRIC_EVENT_TYPES,
  BIOMETRIC_FORBIDDEN_PAYLOAD_KEYS,
  BIOMETRIC_SYNC_MODES,
  BIOMETRIC_VERIFICATION_METHODS,
  DEFAULT_BIOMETRIC_BATCH_SIZE,
} from "./biometric.constants";
import type {
  BiometricBatchInput,
  BiometricDeviceInput,
  BiometricDeviceUpdateInput,
  BiometricListFilters,
  BiometricMappingInput,
  BiometricMappingUpdateInput,
  BiometricPunchInput,
  BiometricReasonInput,
} from "./biometric.types";
import { AppError, ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

const reason = z
  .string({ required_error: "A reason is required for this action." })
  .trim()
  .min(3, "A reason is required for this action.");

const assertNoTemplates = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return;
  const stack = [payload as Record<string, unknown>];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const [key, value] of Object.entries(current)) {
      if ((BIOMETRIC_FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(key)) {
        throw new AppError(
          "Biometric templates or images must not be uploaded to this system.",
          "BIOMETRIC_TEMPLATE_NOT_ALLOWED",
          400,
        );
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
      }
    }
  }
};

const punchSchema = z.object({
  biometric_user_id: z.string().trim().optional(),
  external_employee_identifier: z.string().trim().optional(),
  event_time: z.string().trim().min(1, "Attendance time is required."),
  event_type: z.enum(BIOMETRIC_EVENT_TYPES),
  verification_method: z.enum(BIOMETRIC_VERIFICATION_METHODS).default("unknown"),
  device_event_id: z.string().trim().optional(),
  external_event_id: z.string().trim().optional(),
  raw_punch_code: z.string().trim().optional(),
  outlet_id: z.string().trim().optional(),
  raw_payload_json: z.record(z.unknown()).optional(),
  bridge_app_version: z.string().trim().optional(),
  source_device_serial: z.string().trim().optional(),
  source_device_name: z.string().trim().optional(),
}).transform((input) => ({
  ...input,
  biometric_user_id: input.biometric_user_id ?? input.external_employee_identifier ?? "",
  device_event_id: input.device_event_id ?? input.external_event_id,
}));

export const validateBiometricPunchInput = (payload: unknown): BiometricPunchInput => {
  assertNoTemplates(payload);
  const input = parse(punchSchema, payload);
  if (!input.biometric_user_id) {
    throw new ValidationError("Employee device identifier is required.");
  }
  if (Number.isNaN(new Date(input.event_time).getTime())) {
    throw new ValidationError("Please enter a valid biometric punch time.");
  }
  return input;
};

export const validateBiometricBatchInput = (
  payload: unknown,
  maxBatchSize = DEFAULT_BIOMETRIC_BATCH_SIZE,
): BiometricBatchInput => {
  assertNoTemplates(payload);
  return parse(
    z.object({
      batch_id: z.string().trim().min(1, "Batch ID is required."),
      logs: z.array(punchSchema).min(1, "At least one biometric punch is required.").max(maxBatchSize),
      bridge_app_version: z.string().trim().optional(),
      source_device_serial: z.string().trim().optional(),
      source_device_name: z.string().trim().optional(),
    }),
    payload,
  );
};

export const validateBiometricListFilters = (
  query: Record<string, string | undefined>,
): BiometricListFilters =>
  parse(
    z.object({
      outlet_id: z.string().optional(),
      device_id: z.string().optional(),
      employee_id: z.string().optional(),
      biometric_user_id: z.string().optional(),
      event_type: z.string().optional(),
      sync_status: z.string().optional(),
      enrollment_status: z.string().optional(),
      is_active: z.coerce.number().int().min(0).max(1).optional(),
      device_type: z.string().optional(),
      sync_mode: z.string().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
    }),
    query,
  );

export const validateBiometricDeviceInput = (payload: unknown): BiometricDeviceInput =>
  parse(
    z.object({
      outlet_id: z.string().trim().min(1, "Outlet is required."),
      device_name: z.string().trim().min(1, "Device name is required."),
      device_serial: z.string().trim().min(1, "Device serial is required."),
      device_type: z.enum(BIOMETRIC_DEVICE_TYPES),
      sync_mode: z.enum(BIOMETRIC_SYNC_MODES).default("push_api"),
      device_code: z.string().trim().optional(),
      external_device_id: z.string().trim().optional(),
      vendor: z.string().trim().optional(),
      model: z.string().trim().optional(),
    }),
    payload,
  );

export const validateBiometricDeviceUpdateInput = (payload: unknown): BiometricDeviceUpdateInput => {
  const raw = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if ("status" in raw) {
    throw new AppError(
      "Device status changes must be made through the enable or disable action.",
      "DEVICE_STATUS_CHANGE_REQUIRES_STATUS_ENDPOINT",
      400,
    );
  }
  if ("api_token_hash" in raw) {
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
        device_serial: z.string().trim().optional(),
        device_type: z.enum(BIOMETRIC_DEVICE_TYPES).optional(),
        sync_mode: z.enum(BIOMETRIC_SYNC_MODES).optional(),
        device_code: z.string().trim().optional(),
        external_device_id: z.string().trim().optional(),
        vendor: z.string().trim().optional(),
        model: z.string().trim().optional(),
      }),
      payload,
    );
};

export const validateBiometricMappingInput = (payload: unknown): BiometricMappingInput =>
  parse(
    z.object({
      employee_id: z.string().trim().min(1, "Employee is required."),
      device_id: z.string().trim().min(1, "Biometric device is required."),
      biometric_user_id: z.string().trim().min(1, "Biometric user ID is required."),
      enrollment_status: z.string().trim().default("enrolled"),
    }),
    payload,
  );

export const validateBiometricMappingUpdateInput = (payload: unknown): BiometricMappingUpdateInput =>
  parse(
    z.object({
      employee_id: z.string().trim().optional(),
      biometric_user_id: z.string().trim().optional(),
      enrollment_status: z.string().trim().optional(),
    }),
    payload,
  );

export const validateBiometricReasonInput = (payload: unknown): BiometricReasonInput =>
  parse(z.object({ reason }), payload);

export const validateUnmatchedMapInput = (payload: unknown): { employee_id: string; reason: string } =>
  parse(
    z.object({
      employee_id: z.string().trim().min(1, "Employee is required."),
      reason,
    }),
    payload,
  );
