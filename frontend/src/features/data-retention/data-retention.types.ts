export type ArchiveSourceType =
  | "employees"
  | "employee_documents"
  | "attendance"
  | "biometric_logs"
  | "leave"
  | "long_leave"
  | "payroll"
  | "payslips"
  | "notifications"
  | "email_notifications"
  | "expiry_alerts"
  | "imports"
  | "exports"
  | "backup_restore"
  | "audit_logs"
  | "mixed";

export interface RetentionSettings {
  enabled: boolean;
  default_retention_months: number;
  archive_only_mode: boolean;
  purge_enabled: boolean;
  require_backup_before_archive: boolean;
  include_archived_records_in_reports_by_default: boolean;
  allow_restore_from_archive: boolean;
  confirmation_phrase: string;
  source_retention_months: Record<string, number>;
}

export interface ArchiveJob {
  id: string;
  archive_type: string;
  source_type: ArchiveSourceType;
  status: string;
  requested_by?: string | null;
  requested_at: string;
  completed_at?: string | null;
  total_candidates: number;
  eligible_count: number;
  blocked_count: number;
  archived_count: number;
  restored_count: number;
  skipped_count: number;
  failed_count: number;
  failure_code?: string | null;
  failure_message?: string | null;
  filters?: Record<string, unknown>;
  purge_disabled?: boolean;
}

export interface ArchiveJobItem {
  id: string;
  archive_job_id: string;
  source_type: ArchiveSourceType;
  source_table: string;
  source_id: string;
  employee_id?: string | null;
  outlet_id?: string | null;
  department_id?: string | null;
  action: string;
  status: string;
  blocked_reason?: string | null;
  warning_message?: string | null;
  previous_status?: string | null;
  new_status?: string | null;
}

export interface ArchiveListResponse<T> {
  data: T[];
  filters: Record<string, unknown>;
  pagination: { page: number; page_size: number; total: number; total_pages: number };
  generated_at: string;
}

export interface ArchivePreviewPayload {
  source_type: ArchiveSourceType;
  cutoff_date?: string;
  retention_months?: number;
  page_size: number;
  reason?: string;
  idempotency_key?: string;
}

export interface ArchivePreviewResult {
  job: ArchiveJob;
  summary: { total_candidates: number; eligible_count: number; blocked_count: number; purge_disabled: boolean };
  meta: { limited_preview: boolean; preview_limit: number; total_estimate: number | null };
  samples: ArchiveJobItem[];
  warnings: string[];
  blocked_reasons: string[];
  generated_at: string;
}
