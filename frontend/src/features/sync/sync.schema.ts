import { z } from "zod";

export const syncConflictResolutionSchema = z.object({
  resolution: z.enum(["accept", "reject", "merge", "ignore"]),
  reason: z.string().trim().min(1, "Reason is required."),
  resolution_notes: z.string().trim().optional(),
});

export const forceResyncSchema = z.object({
  device_id: z.string().trim().min(1, "Device is required."),
  outlet_id: z.string().trim().optional(),
  reason: z.string().trim().min(1, "Reason is required."),
});

export type SyncConflictResolutionValues = z.infer<typeof syncConflictResolutionSchema>;
export type ForceResyncValues = z.infer<typeof forceResyncSchema>;
