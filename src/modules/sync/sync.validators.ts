import { z } from "zod";

import {
  DEFAULT_MAX_RECORDS_PER_BATCH,
  SYNC_ACTION_TYPES,
  SYNC_ENTITY_TYPES,
  SYNC_RESOLUTIONS,
} from "./sync.constants";
import type {
  SyncConflictResolveInput,
  SyncForceResyncInput,
  SyncListFilters,
  SyncPullQuery,
  SyncPushInput,
  SyncRetryInput,
} from "./sync.types";
import { ValidationError } from "../../utils/errors";

const parse = <T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> => {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message);
  return result.data;
};

const reason = z
  .string({ required_error: "A reason is required for this action." })
  .trim()
  .min(3, "A reason is required for this action.");
const datetime = z.string().trim().min(1, "Please enter a valid attendance time.");

export const validateSyncPushInput = (
  payload: unknown,
  maxRecords = DEFAULT_MAX_RECORDS_PER_BATCH,
): SyncPushInput =>
  parse(
    z.object({
      batch_id: z.string().trim().min(1, "Batch ID is required."),
      outlet_id: z.string().trim().optional(),
      device_id: z.string().trim().optional(),
      events: z
        .array(
          z.object({
            local_id: z.string().trim().min(1, "Local record ID is required."),
            entity_type: z.string().trim().min(1),
            action_type: z.string().trim().min(1),
            employee_id: z.string().trim().min(1, "Employee is required."),
            event_time: datetime,
            attendance_method: z.enum(["pin", "qr", "kiosk"]).default("kiosk"),
            created_offline: z.boolean().default(true),
          }),
        )
        .max(maxRecords, `Please sync ${maxRecords} or fewer records at a time.`),
    }),
    payload,
  );

export const validateSyncPullQuery = (
  query: Record<string, string | undefined>,
): SyncPullQuery => {
  const input = parse(
    z.object({
      outlet_id: z.string().optional(),
      since: z.coerce.number().int().min(0).default(0),
      include: z.string().optional(),
    }),
    query,
  );

  return {
    outlet_id: input.outlet_id,
    since: input.since,
    include: input.include
      ? input.include.split(",").map((value) => value.trim()).filter(Boolean)
      : ["employees", "attendance", "settings"],
  };
};

export const validateSyncListFilters = (
  query: Record<string, string | undefined>,
): SyncListFilters =>
  parse(
    z.object({
      status: z.string().optional(),
      conflict_type: z.string().optional(),
      entity_type: z.string().optional(),
      employee_id: z.string().optional(),
      outlet_id: z.string().optional(),
      device_id: z.string().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(25),
      sort_by: z.string().optional(),
      sort_direction: z.enum(["asc", "desc"]).default("desc"),
    }),
    query,
  );

export const validateRetryInput = (payload: unknown): SyncRetryInput => {
  const input = parse(
    z.object({
      sync_item_id: z.string().trim().optional(),
      batch_id: z.string().trim().optional(),
      reason,
    }),
    payload,
  );
  if (!input.sync_item_id && !input.batch_id) {
    throw new ValidationError("Please choose a sync item or batch to retry.");
  }
  return input;
};

export const validateForceResyncInput = (payload: unknown): SyncForceResyncInput =>
  parse(
    z.object({
      device_id: z.string().trim().min(1, "Device is required."),
      outlet_id: z.string().trim().optional(),
      reason,
    }),
    payload,
  );

export const validateConflictResolveInput = (
  payload: unknown,
): SyncConflictResolveInput => {
  const input = parse(
    z.object({
      resolution: z.enum(SYNC_RESOLUTIONS),
      reason: z.string().trim().optional(),
      resolution_notes: z.string().trim().optional(),
    }),
    payload,
  );
  const value = input.reason ?? input.resolution_notes;
  if (!value || value.length < 3) {
    throw new ValidationError("A reason is required for this action.");
  }
  return { resolution: input.resolution, reason: value };
};

export const assertSupportedSyncItem = (entityType: string, actionType: string) => {
  if (!(SYNC_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new ValidationError("This offline record type is not supported yet.");
  }
  if (!(SYNC_ACTION_TYPES as readonly string[]).includes(actionType)) {
    throw new ValidationError("This offline record type is not supported yet.");
  }
};
