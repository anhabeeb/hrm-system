export const EXPORT_FORMATS = ["xlsx", "pdf"] as const;
export const EXPORT_TYPES = ["employees", "attendance", "leave", "payroll", "assets", "uniforms", "documents_metadata", "audit_activity", "approvals"] as const;
export const IMPORT_TYPES = ["employees"] as const;
export const IMPORT_TYPE_ALIASES: Record<string, (typeof IMPORT_TYPES)[number]> = {
};
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export const IMPORT_EXPORT_MESSAGES = {
  exportsLoaded: "Export jobs loaded successfully.",
  exportCreated: "Export job created successfully.",
  exportReady: "Export file is ready for download.",
  exportCancelled: "Export job cancelled successfully.",
  retryRequested: "Export retry requested successfully.",
  uploaded: "Import file uploaded successfully.",
  importsLoaded: "Import jobs loaded successfully.",
  validationOk: "Import validation completed successfully.",
  validationErrors: "This import file has validation errors.",
  applied: "Import applied successfully.",
  cancelled: "Import job cancelled successfully.",
  templatesLoaded: "Import templates loaded successfully.",
  templateLoaded: "Import template loaded successfully.",
} as const;
