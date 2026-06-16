import { z } from "zod";
import { ValidationError } from "../../utils/errors";
import type { ReportExportCreateInput, ReportExportListFilters, ReportExportPreviewInput } from "./report-exports.types";

const format = z.enum(["xlsx", "pdf"]);
const reportKey = z.string().trim().min(3).max(160);
const filters = z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])).default({});

const parse = <T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> => {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw new ValidationError(result.error.issues[0]?.message ?? "Please review the export request.");
  return result.data;
};

export const validateExportPreview = (input: unknown): ReportExportPreviewInput =>
  parse(z.object({
    report_key: reportKey,
    format: format.optional().default("xlsx"),
    filters,
  }), input);

export const validateExportCreate = (input: unknown): ReportExportCreateInput =>
  parse(z.object({
    report_key: reportKey,
    format,
    filters,
    idempotency_key: z.string().trim().max(200).optional(),
  }), input);

export const validateExportListFilters = (input: Record<string, unknown>): ReportExportListFilters => {
  const parsed = parse(z.object({
    report_category: z.string().trim().max(80).optional(),
    report_key: z.string().trim().max(160).optional(),
    format: z.string().trim().max(20).optional(),
    status: z.string().trim().max(40).optional(),
    requested_by: z.string().trim().max(128).optional(),
    from_date: z.string().trim().max(40).optional(),
    to_date: z.string().trim().max(40).optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(25),
  }), input);
  if (parsed.from_date && parsed.to_date && parsed.from_date > parsed.to_date) {
    throw new ValidationError("Export history start date must be before end date.");
  }
  return parsed;
};

