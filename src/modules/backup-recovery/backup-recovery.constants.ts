export const BACKUP_TYPES = ["company_data", "metadata_only", "metadata", "configuration", "full_metadata"] as const;
export const RESTORE_SCOPES = ["dry_run", "insert_missing", "update_existing", "upsert", "replace_company_data", "metadata_preview", "configuration_preview", "full_restore_placeholder"] as const;
export const RESTORE_MODES = ["dry_run", "insert_missing", "update_existing", "upsert", "replace_company_data"] as const;
export const BACKUP_SCHEMA_VERSION = "12B.1";
export const RESTORE_CONFIRMATION_PHRASE = "RESTORE COMPANY DATA";

export const BACKUP_MESSAGES = {
  created: "Backup job created successfully.",
  completed: "Backup completed successfully.",
  list: "Backup jobs loaded successfully.",
  detail: "Backup job loaded successfully.",
  ready: "Backup file is ready for download.",
  verified: "Backup verified successfully.",
  deleted: "Backup deleted successfully.",
  status: "Backup status loaded successfully.",
  retentionLoaded: "Backup retention policy loaded successfully.",
  retentionUpdated: "Backup retention policy updated successfully.",
  restoreCreated: "Restore request created successfully.",
  restoreList: "Restore requests loaded successfully.",
  restoreApproved: "Restore request approved.",
  restoreRejected: "Restore request rejected.",
  restoreValidated: "Restore validation completed successfully.",
  restoreApplied: "Restore applied successfully.",
  restoreCancelled: "Restore job cancelled.",
  settingsLoaded: "Backup and restore settings loaded successfully.",
  settingsUpdated: "Backup and restore settings updated successfully.",
} as const;
