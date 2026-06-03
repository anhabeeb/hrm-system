export interface BackupCreateInput {
  backup_type: string;
  reason: string;
}

export interface RestoreRequestInput {
  backup_id?: string;
  restore_scope: string;
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
