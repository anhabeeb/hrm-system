import { ValidationError } from "../../utils/errors";
import { DOCUMENT_KYC_DOCUMENT_TYPE_ALIASES, DOCUMENT_KYC_DOCUMENT_TYPES, DOCUMENT_KYC_REQUEST_TYPES, DOCUMENT_KYC_STATUSES, type DocumentKycActionInput, type DocumentKycFilters, type DocumentKycRequestInput } from "./document-kyc.types";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const page = (value: unknown) => Math.max(1, Math.trunc(asNumber(value) ?? 1));
const pageSize = (value: unknown) => Math.min(100, Math.max(1, Math.trunc(asNumber(value) ?? 25)));
const requireString = (value: unknown, label: string) => {
  const parsed = asString(value);
  if (!parsed) throw new ValidationError(`${label} is required.`);
  return parsed;
};
const date = (value: unknown) => {
  const parsed = asString(value);
  if (!parsed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed) || Number.isNaN(new Date(`${parsed}T00:00:00Z`).getTime())) throw new ValidationError("Please select a valid document date.");
  return parsed;
};

const sensitivePayloadKeys = new Set([
  "password",
  "password_hash",
  "token",
  "session_token",
  "reset_token",
  "totp_secret",
  "secret",
  "api_key",
  "device_secret",
]);

export const assertSafeDocumentKycPayload = (value: unknown, path = "payload") => {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeDocumentKycPayload(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (
      sensitivePayloadKeys.has(normalized) ||
      normalized.includes("password") ||
      normalized.includes("token") ||
      normalized.includes("secret") ||
      normalized.includes("api_key")
    ) {
      throw new ValidationError(`Sensitive field ${path}.${key} cannot be stored in document/KYC requests.`);
    }
    assertSafeDocumentKycPayload(nested, `${path}.${key}`);
  }
};

export const canonicalRequestType = (value: string) => {
  if (!(DOCUMENT_KYC_REQUEST_TYPES as readonly string[]).includes(value)) throw new ValidationError("Request type is not valid.");
  if (value === "PROFILE_FIELD_UPDATE") return "GENERAL_KYC_UPDATE";
  if (value === "DOCUMENT_UPLOAD") return "OTHER_DOCUMENT_UPDATE";
  if (value === "DOCUMENT_REPLACEMENT") return "DOCUMENT_RENEWAL";
  if (value === "KYC_UPDATE" || value === "GENERAL_DOCUMENT_KYC_UPDATE") return "GENERAL_KYC_UPDATE";
  return value;
};

export const normalizeDocumentKycDocumentType = (value: unknown) => {
  const parsed = asString(value);
  if (!parsed) return undefined;
  const normalized = parsed.trim().toUpperCase();
  const mapped = DOCUMENT_KYC_DOCUMENT_TYPE_ALIASES[parsed.trim().toLowerCase()] ?? normalized;
  if (!(DOCUMENT_KYC_DOCUMENT_TYPES as readonly string[]).includes(mapped)) {
    throw new ValidationError("Please select a valid document type.");
  }
  return mapped;
};

export const documentRelatedRequestTypes = new Set([
  "PASSPORT_UPDATE",
  "NATIONAL_ID_UPDATE",
  "WORK_PERMIT_UPDATE",
  "VISA_UPDATE",
  "CONTRACT_DOCUMENT_UPDATE",
  "MEDICAL_DOCUMENT_UPDATE",
  "PROFILE_PHOTO_UPDATE",
  "DOCUMENT_RENEWAL",
  "DOCUMENT_CORRECTION",
  "DOCUMENT_VERIFICATION",
  "OTHER_DOCUMENT_UPDATE",
  "DOCUMENT_UPLOAD",
  "DOCUMENT_REPLACEMENT",
]);

export const allowedDocumentKycFieldsByRequestType: Record<string, Set<string>> = {
  PERSONAL_INFO_UPDATE: new Set(["nationality", "id_card_number", "passport_number", "notes"]),
  CONTACT_INFO_UPDATE: new Set(["phone", "email", "address"]),
  EMERGENCY_CONTACT_UPDATE: new Set(["emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship"]),
  ADDRESS_UPDATE: new Set(["address"]),
  BANK_ACCOUNT_UPDATE: new Set(["bank_name", "bank_account_masked", "bank_account_holder"]),
  PASSPORT_UPDATE: new Set(["passport_number", "issuing_country", "issue_date", "expiry_date", "document_number"]),
  NATIONAL_ID_UPDATE: new Set(["id_card_number", "document_number", "issuing_country"]),
  WORK_PERMIT_UPDATE: new Set(["document_number", "issue_date", "expiry_date", "issuing_country"]),
  VISA_UPDATE: new Set(["document_number", "issue_date", "expiry_date", "issuing_country"]),
  CONTRACT_DOCUMENT_UPDATE: new Set(["document_number", "issue_date", "expiry_date"]),
  MEDICAL_DOCUMENT_UPDATE: new Set(["document_number", "issue_date", "expiry_date"]),
  PROFILE_PHOTO_UPDATE: new Set(["document_number"]),
  DEPENDENT_INFO_UPDATE: new Set(["notes"]),
  DOCUMENT_RENEWAL: new Set(["document_number", "issue_date", "expiry_date", "issuing_country"]),
  DOCUMENT_CORRECTION: new Set(["document_number", "issue_date", "expiry_date", "issuing_country", "notes"]),
  DOCUMENT_VERIFICATION: new Set(["document_number", "issue_date", "expiry_date", "issuing_country", "notes"]),
  GENERAL_KYC_UPDATE: new Set(["phone", "address", "nationality", "id_card_number", "passport_number", "bank_name", "bank_account_masked", "emergency_contact_name", "emergency_contact_phone", "notes"]),
  OTHER_DOCUMENT_UPDATE: new Set(["document_number", "issue_date", "expiry_date", "issuing_country", "notes"]),
};

const assertAllowedRequestedFields = (requestType: string, requestedField?: string | null, requestedValue?: Record<string, unknown> | null) => {
  const canonicalType = canonicalRequestType(requestType);
  const allowed = allowedDocumentKycFieldsByRequestType[canonicalType] ?? allowedDocumentKycFieldsByRequestType.GENERAL_KYC_UPDATE;
  if (requestedField && !allowed.has(requestedField)) {
    throw new ValidationError(`Requested field ${requestedField} is not allowed for this request type.`);
  }
  for (const key of Object.keys(requestedValue ?? {})) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Requested field ${key} is not allowed for this request type.`);
    }
  }
};

const parsePayloadObject = (value: unknown, label: string) => {
  if (value === undefined || value === null || value === "") return null;
  if (!isObject(value)) throw new ValidationError(`${label} must be an object.`);
  assertSafeDocumentKycPayload(value, label);
  return value;
};

export const validateDocumentKycFilters = (query: Record<string, unknown>): DocumentKycFilters => {
  const status = asString(query.status);
  if (status && !(DOCUMENT_KYC_STATUSES as readonly string[]).includes(status)) throw new ValidationError("Request status is not valid.");
  return {
    employee_id: asString(query.employee_id),
    request_type: asString(query.request_type),
    status,
    document_type: asString(query.document_type),
    page: page(query.page),
    page_size: pageSize(query.page_size),
  };
};

export const validateDocumentKycRequest = (payload: unknown): DocumentKycRequestInput => {
  if (!isObject(payload)) throw new ValidationError();
  const requestType = requireString(payload.request_type, "Request type");
  const canonicalType = canonicalRequestType(requestType);
  const documentType = normalizeDocumentKycDocumentType(payload.document_type);
  if (documentRelatedRequestTypes.has(requestType) || documentRelatedRequestTypes.has(canonicalType)) {
    if (!documentType) throw new ValidationError("Document type is required for document-related requests.");
  }
  const reason = requireString(payload.reason, "Reason");
  if (reason.length < 3) throw new ValidationError("A reason is required for this request.");
  const requestedValue = parsePayloadObject(payload.requested_value_json, "requested_value_json");
  const requestedField = asString(payload.requested_field) ?? null;
  assertAllowedRequestedFields(canonicalType, requestedField, requestedValue);
  return {
    employee_id: asString(payload.employee_id) ?? null,
    request_type: canonicalType,
    document_type: documentType ?? null,
    document_id: asString(payload.document_id) ?? null,
    requested_field: requestedField,
    current_value_json: parsePayloadObject(payload.current_value_json, "current_value_json"),
    requested_value_json: requestedValue,
    staged_file_key: asString(payload.staged_file_key) ?? null,
    staged_file_name: asString(payload.staged_file_name) ?? null,
    staged_mime_type: asString(payload.staged_mime_type) ?? null,
    staged_file_size: asNumber(payload.staged_file_size) ?? null,
    document_number: asString(payload.document_number) ?? null,
    issue_date: date(payload.issue_date) ?? null,
    expiry_date: date(payload.expiry_date) ?? null,
    issuing_country: asString(payload.issuing_country) ?? null,
    reason,
    employee_note: asString(payload.employee_note) ?? null,
  };
};

export const validateDocumentKycAction = (payload: unknown): DocumentKycActionInput => {
  if (!isObject(payload)) throw new ValidationError();
  const reason = requireString(payload.reason, "Reason");
  if (reason.length < 3) throw new ValidationError("A reason is required for this action.");
  return { reason, note: asString(payload.note) ?? null };
};
