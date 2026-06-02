import type { AuthActor } from "../../types/api.types";
import * as permissionService from "../../services/permission.service";
import { sanitizeSensitivePayload } from "../../utils/sanitize";

export const hasReportPermission = (context: AuthActor, permissionKey: string): boolean =>
  permissionService.hasPermission(context, permissionKey);

export const canViewSensitiveExport = (context: AuthActor): boolean =>
  permissionService.hasAnyPermission(context, ["export.sensitive", "reports.export"]) || permissionService.isSuperAdmin(context);

export const canViewSensitiveDocuments = (context: AuthActor): boolean =>
  permissionService.hasPermission(context, "documents.view_sensitive");

export const maskSensitiveValue = (value: unknown): unknown => {
  return sanitizeSensitivePayload(value);
};

export const sanitizeDocumentReportRow = <T extends Record<string, unknown>>(row: T, canViewSensitive: boolean): T => {
  const sanitized: Record<string, unknown> = { ...row };
  delete sanitized.file_key;
  delete sanitized.storage_location;
  delete sanitized.path;

  const isSensitive = sanitized.is_sensitive === 1 || sanitized.is_sensitive === true || sanitized.is_sensitive === "1";
  if (isSensitive && !canViewSensitive) {
    sanitized.file_name = "Sensitive document";
  }

  return sanitized as T;
};
