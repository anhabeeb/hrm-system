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
}

export interface RestoreRequestPayload {
  backup_id?: string;
  restore_scope: string;
  reason: string;
}

export interface RetentionPolicyPayload {
  retention_days?: number;
  keep_monthly_count?: number;
  keep_yearly_count?: number;
  auto_delete_enabled?: boolean;
  reason: string;
}
