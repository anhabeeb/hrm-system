import { z } from "zod";
import { AppError, ValidationError } from "../../utils/errors";
import type { ImportJobCreateInput, ImportListFilters, ImportPreviewInput, ImportRowsFilters } from "./imports.types";

const importTypes = ["employee_master", "employee_documents", "leave_balances", "salary_compensation", "attendance", "holidays", "assets_uniforms", "advances_loans"] as const;
const modes = ["create_only", "update_only", "upsert", "validate_only"] as const;
const statuses = ["uploaded", "validating", "preview_ready", "validation_failed", "applying", "completed", "partially_completed", "failed", "cancelled", "valid", "invalid", "applied", "skipped", "duplicate"] as const;

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);

const createSchema = z.object({
  import_type: z.enum(importTypes),
  mode: z.enum(modes).default("validate_only"),
  csv_content: z.string().min(1, "CSV content is required."),
  file_name: z.string().trim().max(255).optional(),
  file_size: z.coerce.number().int().min(0).optional(),
  idempotency_key: z.string().trim().max(255).optional(),
});

export const validateCreateImportJob = (payload: unknown): ImportJobCreateInput => {
  const result = createSchema.safeParse(payload);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review the import request.");
  return result.data;
};

export const validatePreviewImport = (payload: unknown): ImportPreviewInput => {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return validateCreateImportJob({ ...record, mode: record.mode ?? "validate_only" });
};

export const validateImportListFilters = (query: Record<string, string | undefined>): ImportListFilters => {
  const result = z.object({
    import_type: z.string().optional(),
    status: z.string().optional(),
    requested_by: z.string().optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    page,
    page_size: pageSize,
  }).safeParse(query);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review import filters.");
  if (result.data.status && !(statuses as readonly string[]).includes(result.data.status)) throw new AppError("Please choose a valid import status.", "IMPORT_JOB_INVALID_STATUS", 400);
  return result.data;
};

export const validateImportRowsFilters = (query: Record<string, string | undefined>): ImportRowsFilters => {
  const result = z.object({
    status: z.string().optional(),
    page,
    page_size: pageSize,
  }).safeParse(query);
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review import row filters.");
  if (result.data.status && !(statuses as readonly string[]).includes(result.data.status)) throw new AppError("Please choose a valid import row status.", "IMPORT_JOB_INVALID_STATUS", 400);
  return result.data;
};
