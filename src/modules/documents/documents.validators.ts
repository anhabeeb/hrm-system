import { ALLOWED_MIME_TYPES, DANGEROUS_MIME_TYPES, DEFAULT_PAGE_SIZE, MAX_DOCUMENT_BYTES, MAX_PAGE_SIZE } from "./documents.constants";
import type { DocumentCategoryFilters, DocumentCategoryInput, DocumentDeleteInput, DocumentFilters, DocumentUpdateInput, DocumentUploadInput } from "./documents.types";
import { AppError, ValidationError } from "../../utils/errors";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const asBool = (value: unknown) => value === true ? true : value === false ? false : undefined;
const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) => Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(asNumber(value) ?? DEFAULT_PAGE_SIZE)));
const requireString = (value: unknown, message: string) => {
  const parsed = asString(value);
  if (!parsed) throw new ValidationError(message);
  return parsed;
};
const date = (value: unknown) => {
  const parsed = asString(value);
  if (!parsed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(new Date(`${parsed}T00:00:00Z`).getTime())) throw new ValidationError("Please select a valid expiry date.");
  return parsed;
};
const reason = (value: unknown) => {
  const parsed = asString(value);
  if (!parsed || parsed.length < 3) throw new ValidationError("A reason is required for this action.");
  return parsed;
};
const safeFileName = (value: unknown) => {
  const parsed = requireString(value, "File name is required.");
  if (/[\\/:*?"<>|]/.test(parsed)) throw new ValidationError("Please use a safe file name.");
  return parsed;
};
const validateMime = (value: unknown) => {
  const mime = requireString(value, "File type is required.").toLowerCase();
  if ((DANGEROUS_MIME_TYPES as readonly string[]).includes(mime) || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new AppError("This document type is not allowed.", "DOCUMENT_TYPE_NOT_ALLOWED", 400);
  }
  return mime;
};
const validateBase64Size = (value: unknown) => {
  const content = asString(value);
  if (!content) {
    throw new AppError("Please attach a document file before uploading.", "DOCUMENT_CONTENT_REQUIRED", 400);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content) || content.length % 4 !== 0) {
    throw new AppError("The uploaded document content is invalid.", "DOCUMENT_CONTENT_INVALID", 400);
  }
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  const estimatedBytes = Math.floor((content.length * 3) / 4) - padding;
  if (estimatedBytes <= 0) throw new AppError("The uploaded document is empty.", "DOCUMENT_EMPTY", 400);
  if (estimatedBytes > MAX_DOCUMENT_BYTES) throw new ValidationError("This document is too large.");
  return content;
};

export const validateDocumentFilters = (query: Record<string, unknown>): DocumentFilters => ({
  employee_id: asString(query.employee_id),
  outlet_id: asString(query.outlet_id),
  document_type: asString(query.document_type),
  status: asString(query.status),
  is_sensitive: query.is_sensitive === undefined ? undefined : query.is_sensitive === "true" || query.is_sensitive === true,
  expiring_before: date(query.expiring_before),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateDocumentUpload = (payload: unknown): DocumentUploadInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    employee_id: requireString(payload.employee_id, "Employee is required."),
    document_type: requireString(payload.document_type, "Document type is required."),
    file_name: safeFileName(payload.file_name),
    mime_type: validateMime(payload.mime_type),
    content_base64: validateBase64Size(payload.content_base64),
    expiry_date: date(payload.expiry_date),
    is_sensitive: asBool(payload.is_sensitive) ?? true,
  };
};

export const validateDocumentUpdate = (payload: unknown): DocumentUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  if (payload.file_key !== undefined) throw new AppError("Document file changes must be made through the replace document action.", "DOCUMENT_FILE_CHANGE_REQUIRES_REPLACE", 400);
  if (payload.content_base64 !== undefined) throw new AppError("Document file changes must be made through the replace document action.", "DOCUMENT_FILE_CHANGE_REQUIRES_REPLACE", 400);
  return {
    document_type: asString(payload.document_type),
    file_name: payload.file_name === undefined ? undefined : safeFileName(payload.file_name),
    mime_type: payload.mime_type === undefined ? undefined : validateMime(payload.mime_type),
    expiry_date: payload.expiry_date === null ? null : date(payload.expiry_date),
    status: asString(payload.status),
    is_sensitive: asBool(payload.is_sensitive),
    reason: asString(payload.reason),
  };
};

export const validateDocumentDelete = (payload: unknown): DocumentDeleteInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: reason(payload.reason) };
};

export const validateCategoryInput = (payload: unknown): DocumentCategoryInput => {
  if (!isObject(payload)) throw new ValidationError();
  return {
    category_key: requireString(payload.category_key, "Category key is required."),
    category_name: requireString(payload.category_name, "Category name is required."),
    is_sensitive: asBool(payload.is_sensitive),
    requires_expiry_date: asBool(payload.requires_expiry_date),
    applies_to_foreign_employee: asBool(payload.applies_to_foreign_employee),
    applies_to_local_employee: asBool(payload.applies_to_local_employee),
    status: asString(payload.status),
    reason: asString(payload.reason),
  };
};

export const validateCategoryUpdate = (payload: unknown): Partial<DocumentCategoryInput> => {
  if (!isObject(payload)) throw new ValidationError();
  const sensitiveChange = payload.is_sensitive !== undefined || payload.status !== undefined || payload.requires_expiry_date !== undefined;
  if (sensitiveChange) reason(payload.reason);
  return {
    category_key: asString(payload.category_key),
    category_name: asString(payload.category_name),
    is_sensitive: asBool(payload.is_sensitive),
    requires_expiry_date: asBool(payload.requires_expiry_date),
    applies_to_foreign_employee: asBool(payload.applies_to_foreign_employee),
    applies_to_local_employee: asBool(payload.applies_to_local_employee),
    status: asString(payload.status),
    reason: asString(payload.reason),
  };
};

export const validateCategoryFilters = (query: Record<string, unknown>): DocumentCategoryFilters => ({
  status: asString(query.status),
  is_sensitive: query.is_sensitive === undefined ? undefined : query.is_sensitive === "true" || query.is_sensitive === true,
  applies_to_foreign_employee: query.applies_to_foreign_employee === undefined ? undefined : query.applies_to_foreign_employee === "true" || query.applies_to_foreign_employee === true,
  applies_to_local_employee: query.applies_to_local_employee === undefined ? undefined : query.applies_to_local_employee === "true" || query.applies_to_local_employee === true,
  page: page(query.page),
  page_size: pageSize(query.page_size),
});
