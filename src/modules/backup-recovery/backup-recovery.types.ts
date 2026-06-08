export interface BackupCreateInput {
  backup_type: string;
  reason: string;
  include_audit_logs?: boolean;
  include_document_metadata?: boolean;
  include_notification_history?: boolean;
  idempotency_key?: string;
}

export interface RestoreRequestInput {
  backup_id?: string;
  restore_scope: string;
  restore_mode?: string;
  confirmation?: string;
  reason: string;
}

export interface RestoreJobInput {
  backup_job_id?: string;
  restore_mode: string;
  reason: string;
}

export interface RestoreApplyInput {
  confirmation: string;
  reason: string;
}

export interface BackupRestoreSettingsInput {
  backup_enabled?: boolean;
  backup_expiry_days?: number;
  max_backup_rows?: number;
  max_backup_size?: number;
  allow_manual_backup?: boolean;
  allow_restore_preview?: boolean;
  allow_restore_apply?: boolean;
  require_super_admin_for_restore?: boolean;
  include_audit_logs?: boolean;
  include_notification_history?: boolean;
  include_import_export_history?: boolean;
  include_document_metadata?: boolean;
  include_document_file_manifest?: boolean;
  reason: string;
}

export interface RetentionPolicyInput {
  retention_days?: number;
  keep_monthly_count?: number;
  keep_yearly_count?: number;
  auto_delete_enabled?: boolean;
  reason: string;
}

export interface ListFilters {
  status?: string;
  type?: string;
  page: number;
  page_size: number;
}
