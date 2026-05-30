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

export const DOCUMENT_AUDIT_ACTIONS = {
  uploaded: "document_uploaded",
  viewed: "document_viewed",
  downloaded: "document_downloaded",
  updated: "document_updated",
  deleted: "document_deleted",
  categoryCreated: "document_category_created",
  categoryUpdated: "document_category_updated",
  sensitiveDenied: "sensitive_document_access_denied",
} as const;
