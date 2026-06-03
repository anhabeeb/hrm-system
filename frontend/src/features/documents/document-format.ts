import { formatDate } from "@/lib/safe-display";
import { maskSensitiveFileName } from "./document-sanitize";
import type { DocumentRecord } from "./documents.types";

export const documentName = (document: DocumentRecord, canViewSensitive: boolean) =>
  maskSensitiveFileName(document.file_name, document.is_sensitive, canViewSensitive);

export const documentExpiry = (document: DocumentRecord) => formatDate(document.expiry_date);
