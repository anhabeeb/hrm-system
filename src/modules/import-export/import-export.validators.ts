import { AppError, ReasonRequiredError, ValidationError } from "../../utils/errors";
import { EXPORT_FORMATS, EXPORT_TYPES, IMPORT_TYPES, IMPORT_TYPE_ALIASES, MAX_IMPORT_BYTES } from "./import-export.constants";
import type { ExportCreateInput, ImportUploadInput, ListFilters, ReasonInput } from "./import-export.types";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const reason = (payload: Record<string, unknown>) => {
  const parsed = asString(payload.reason);
  if (!parsed || parsed.length < 3) throw new ValidationError("A reason is required for this action.");
  return parsed;
};

export const validateListFilters = (query: Record<string, unknown>): ListFilters => ({
  status: asString(query.status),
  type: asString(query.type),
  page: Math.max(1, Math.trunc(asNumber(query.page) ?? 1)),
  page_size: Math.min(100, Math.max(1, Math.trunc(asNumber(query.page_size) ?? 25))),
});

export const validateExportCreate = (payload: unknown): ExportCreateInput => {
  if (!isObject(payload)) throw new ValidationError();
  const exportType = asString(payload.export_type) ?? "report";
  const format = asString(payload.format) ?? "json";
  if (!(EXPORT_TYPES as readonly string[]).includes(exportType)) throw new AppError("This export type is not supported yet.", "UNSUPPORTED_EXPORT_TYPE", 400);
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) throw new AppError("This export format is not supported yet.", "UNSUPPORTED_EXPORT_FORMAT", 400);
  return {
    export_type: exportType,
    format: format as ExportCreateInput["format"],
    report_key: asString(payload.report_key),
    filters: isObject(payload.filters) ? payload.filters : {},
    reason: asString(payload.reason),
  };
};

export const validateImportUpload = (payload: unknown): ImportUploadInput => {
  if (!isObject(payload)) throw new ValidationError();
  const rawImportType = asString(payload.import_type);
  const importType = rawImportType ? IMPORT_TYPE_ALIASES[rawImportType] ?? rawImportType : undefined;
  if (!importType || !(IMPORT_TYPES as readonly string[]).includes(importType)) throw new ValidationError("Please select a valid import type.");
  const parsedReason = asString(payload.reason);
  if (!parsedReason || parsedReason.length < 3) throw new ReasonRequiredError();
  const mime = asString(payload.mime_type) ?? "";
  if (!["text/csv", "application/json"].includes(mime)) throw new ValidationError("This import file type is not supported.");
  const content = asString(payload.content_base64);
  if (!content) throw new ValidationError("Please attach an import file before uploading.");
  const approxBytes = Math.floor((content.length * 3) / 4);
  if (approxBytes > MAX_IMPORT_BYTES) throw new ValidationError("This import file is too large.");
  return {
    import_type: importType,
    file_name: asString(payload.file_name) ?? "import-file",
    mime_type: mime,
    content_base64: content,
    reason: parsedReason,
  };
};

export const validateReason = (payload: unknown): ReasonInput => {
  if (!isObject(payload)) throw new ValidationError("A reason is required for this action.");
  return { reason: reason(payload) };
};
