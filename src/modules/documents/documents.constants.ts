export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
export const DANGEROUS_MIME_TYPES = ["text/plain", "text/html", "application/javascript", "application/x-msdownload", "application/x-sh", "image/svg+xml"] as const;

export const DOCUMENT_TYPES = [
  "work_visa",
  "medical_certificate",
  "work_permit",
  "insurance",
  "driving_license",
  "passport",
  "national_id",
  "other",
] as const;

export const DOCUMENT_STATUSES = [
  "active",
  "expired",
  "expiring_soon",
  "replaced",
  "archived",
  "pending_review",
  "rejected",
  "no_expiry",
  "valid",
  "deleted",
] as const;

export const DRIVING_LICENSE_CATEGORIES = [
  "motorcycle",
  "light_vehicle",
  "heavy_vehicle",
  "boat",
  "other",
] as const;

export const FOREIGN_EMPLOYEE_DOCUMENT_TYPES = [
  "passport",
  "work_visa",
  "work_permit",
  "medical_certificate",
  "insurance",
  "driving_license",
] as const;

export const LOCAL_EMPLOYEE_DOCUMENT_TYPES = [
  "national_id",
  "driving_license",
  "insurance",
  "other",
] as const;

export const DOCUMENT_EXPIRING_SOON_DAYS = 60;

export const REQUIRED_EMPLOYEE_DOCUMENT_COLUMNS = [
  "document_number",
  "issue_date",
  "start_date",
  "document_category",
  "driving_license_category",
  "driving_license_category_other",
  "version_number",
  "replaced_by_document_id",
  "previous_document_id",
  "notes",
  "created_by",
  "updated_by",
  "updated_at",
] as const;

export const DOCUMENT_AUDIT_ACTIONS = {
  uploaded: "document_uploaded",
  replaced: "document_replaced",
  archived: "document_archived",
  viewed: "document_viewed",
  downloaded: "document_downloaded",
  updated: "document_updated",
  deleted: "document_deleted",
  categoryCreated: "document_category_created",
  categoryUpdated: "document_category_updated",
  sensitiveDenied: "sensitive_document_access_denied",
} as const;
