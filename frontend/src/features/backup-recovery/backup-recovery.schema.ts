import { z } from "zod";

export const backupCreateSchema = z.object({
  backup_type: z.enum(["metadata", "configuration", "full_metadata"]),
  reason: z.string().min(3),
});

export const restoreRequestSchema = z.object({
  backup_id: z.string().optional(),
  restore_scope: z.enum(["metadata_preview", "configuration_preview", "full_restore_placeholder"]),
  reason: z.string().min(3),
});
