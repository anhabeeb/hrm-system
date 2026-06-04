import {
  ALLOWED_MIME_TYPES,
  DANGEROUS_MIME_TYPES,
  DEFAULT_PAGE_SIZE,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  DRIVING_LICENSE_CATEGORIES,
  MAX_DOCUMENT_BYTES,
  MAX_PAGE_SIZE,
} from "./documents.constants";
import type {
  DocumentArchiveInput,
  DocumentCategoryFilters,
  DocumentCategoryInput,
  DocumentDeleteInput,
  DocumentFilters,
  DocumentReplaceInput,
  DocumentUpdateInput,
  DocumentUploadInput,
} from "./documents.types";
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(new Date(`${parsed}T00:00:00Z`).getTime())) throw new ValidationError("Please select a valid document date.");
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
const documentType = (value: unknown) => {
  const parsed = requireString(value, "Document type is required.");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(parsed)) {
    throw new ValidationError("Please select a valid document type.", { document_type: "Please select a valid document type." });
  }
  return parsed;
};
const documentStatus = (value: unknown) => {
  const parsed = asString(value);
  if (!parsed) return undefined;
  if (!(DOCUMENT_STATUSES as readonly string[]).includes(parsed)) {
    throw new ValidationError("Please select a valid document status.", { status: "Please select a valid document status." });
  }
  return parsed;
};
const drivingCategory = (value: unknown) => {
  const parsed = asString(value);
  if (!parsed) return undefined;
  if (!(DRIVING_LICENSE_CATEGORIES as readonly string[]).includes(parsed)) {
    throw new ValidationError("Please select a valid driving license category.", { driving_license_category: "Please select a valid driving license category." });
  }
  return parsed;
};
const validateDrivingLicenseCategory = <T extends { document_type?: string; driving_license_category?: string | null; driving_license_category_other?: string | null }>(input: T): T => {
  if (input.document_type === "driving_license" && !input.driving_license_category) {
    throw new ValidationError("Driving license category is required for driving license documents.", {
      driving_license_category: "Driving license category is required.",
    });
  }
  if (input.document_type && input.document_type !== "driving_license" && (input.driving_license_category || input.driving_license_category_other)) {
    throw new ValidationError("Driving license category can only be used for driving license documents.", {
      driving_license_category: "Driving license category can only be used for driving license documents.",
    });
  }
  if (input.driving_license_category === "other" && !input.driving_license_category_other) {
    throw new ValidationError("Please describe the driving license category.", {
      driving_license_category_other: "Please describe the driving license category.",
    });
  }
  return input;
};

export const validateDocumentFilters = (query: Record<string, unknown>): DocumentFilters => ({
  employee_id: asString(query.employee_id),
  outlet_id: asString(query.outlet_id),
  document_type: asString(query.document_type),
  status: asString(query.status),
  expiry_from: date(query.expiry_from),
  expiry_to: date(query.expiry_to),
  expiring_within_days: asNumber(query.expiring_within_days),
  employee_type: asString(query.employee_type),
  is_sensitive: query.is_sensitive === undefined ? undefined : query.is_sensitive === "true" || query.is_sensitive === true,
  expiring_before: date(query.expiring_before),
  page: page(query.page),
  page_size: pageSize(query.page_size),
});

export const validateDocumentUpload = (payload: unknown): DocumentUploadInput => {
  if (!isObject(payload)) throw new ValidationError();
  return validateDrivingLicenseCategory({
    employee_id: requireString(payload.employee_id, "Employee is required."),
    document_type: documentType(payload.document_type),
    document_number: asString(payload.document_number),
    issue_date: date(payload.issue_date),
    start_date: date(payload.start_date),
    file_name: safeFileName(payload.file_name),
    mime_type: validateMime(payload.mime_type),
    content_base64: validateBase64Size(payload.content_base64),
    expiry_date: date(payload.expiry_date),
    driving_license_category: drivingCategory(payload.driving_license_category),
    driving_license_category_other: asString(payload.driving_license_category_other),
    notes: asString(payload.notes),
    is_sensitive: asBool(payload.is_sensitive) ?? true,
  });
};

export const validateDocumentUpdate = (payload: unknown): DocumentUpdateInput => {
  if (!isObject(payload)) throw new ValidationError();
  if (payload.file_key !== undefined) throw new AppError("Document file changes must be made through the replace document action.", "DOCUMENT_FILE_CHANGE_REQUIRES_REPLACE", 400);
  if (payload.content_base64 !== undefined) throw new AppError("Document file changes must be made through the replace document action.", "DOCUMENT_FILE_CHANGE_REQUIRES_REPLACE", 400);
  return validateDrivingLicenseCategory({
    document_type: payload.document_type === undefined ? undefined : documentType(payload.document_type),
    document_number: payload.document_number === null ? null : asString(payload.document_number),
    issue_date: payload.issue_date === null ? null : date(payload.issue_date),
    start_date: payload.start_date === null ? null : date(payload.start_date),
    file_name: payload.file_name === undefined ? undefined : safeFileName(payload.file_name),
    mime_type: payload.mime_type === undefined ? undefined : validateMime(payload.mime_type),
    expiry_date: payload.expiry_date === null ? null : date(payload.expiry_date),
    status: documentStatus(payload.status),
    driving_license_category: payload.driving_license_category === null ? null : drivingCategory(payload.driving_license_category),
    driving_license_category_other: payload.driving_license_category_other === null ? null : asString(payload.driving_license_category_other),
    notes: payload.notes === null ? null : asString(payload.notes),
    is_sensitive: asBool(payload.is_sensitive),
    reason: asString(payload.reason),
  });
};

export const validateDocumentReplace = (payload: unknown): DocumentReplaceInput => {
  if (!isObject(payload)) throw new ValidationError();
  const input = validateDocumentUpload(payload);
  return { ...input, reason: reason(payload.reason) };
};

export const validateDocumentArchive = (payload: unknown): DocumentArchiveInput => {
  if (!isObject(payload)) throw new ValidationError();
  return { reason: reason(payload.reason) };
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
