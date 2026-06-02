export const BACKUP_TYPES = ["metadata", "configuration", "full_metadata"] as const;
export const RESTORE_SCOPES = ["metadata_preview", "configuration_preview", "full_restore_placeholder"] as const;

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
} as const;
