export interface BackupFilters {
  status?: string;
  type?: string;
  page?: number;
  page_size?: number;
}

export interface BackupJob {
  id: string;
  backup_type?: string;
  status?: string;
  file_name?: string;
  file_size?: number;
  started_by?: string;
  started_at?: string;
  completed_at?: string | null;
  error_message?: string | null;
  created_at?: string;
  file_ready?: boolean | number;
  [key: string]: unknown;
}

export interface RestoreRequest {
  id: string;
  backup_job_id?: string;
  restore_type?: string;
  reason?: string;
  status?: string;
  requested_by?: string;
  approved_by?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface BackupCreatePayload {
  backup_type: string;
  reason: string;
  include_audit_logs?: boolean;
  include_document_metadata?: boolean;
  include_notification_history?: boolean;
}

export interface RestoreRequestPayload {
  backup_id?: string;
  restore_scope: string;
  restore_mode?: string;
  confirmation?: string;
  reason: string;
}

export interface RestoreJobPayload {
  backup_job_id?: string;
  restore_mode: string;
  reason: string;
}

export interface RestoreApplyPayload {
  confirmation: string;
  reason: string;
}

export interface RetentionPolicyPayload {
  retention_days?: number;
  keep_monthly_count?: number;
  keep_yearly_count?: number;
  auto_delete_enabled?: boolean;
  reason: string;
}

export interface BackupRestoreSettingsPayload {
  backup_enabled?: boolean;
  backup_expiry_days?: number;
  max_backup_rows?: number;
  max_backup_size?: number;
  allow_manual_backup?: boolean;
  allow_restore_preview?: boolean;
  allow_restore_apply?: boolean;
  require_super_admin_for_restore?: boolean;
  include_audit_logs?: boolean;
  include_document_metadata?: boolean;
  include_document_file_manifest?: boolean;
  reason: string;
}
