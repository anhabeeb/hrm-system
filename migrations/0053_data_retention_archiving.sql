CREATE TABLE IF NOT EXISTS archive_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  archive_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  cancelled_at TEXT,
  filters_json TEXT,
  total_candidates INTEGER NOT NULL DEFAULT 0,
  eligible_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  archived_count INTEGER NOT NULL DEFAULT 0,
  restored_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  confirmation_hash TEXT,
  confirmation_expires_at TEXT,
  idempotency_key TEXT,
  failure_code TEXT,
  failure_message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS archive_job_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  archive_job_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  employee_id TEXT,
  outlet_id TEXT,
  department_id TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  warning_code TEXT,
  warning_message TEXT,
  blocked_reason TEXT,
  previous_status TEXT,
  new_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archive_jobs_company_status_requested ON archive_jobs(company_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_archive_jobs_company_source_status ON archive_jobs(company_id, source_type, status);
CREATE INDEX IF NOT EXISTS idx_archive_jobs_company_requested_by ON archive_jobs(company_id, requested_by, requested_at);
CREATE INDEX IF NOT EXISTS idx_archive_jobs_company_idempotency ON archive_jobs(company_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_archive_job_items_company_job_status ON archive_job_items(company_id, archive_job_id, status);
CREATE INDEX IF NOT EXISTS idx_archive_job_items_company_source ON archive_job_items(company_id, source_type, source_id);

ALTER TABLE employees ADD COLUMN archived_at TEXT;
ALTER TABLE employees ADD COLUMN archived_by TEXT;
ALTER TABLE employees ADD COLUMN archive_reason TEXT;
ALTER TABLE employees ADD COLUMN restored_at TEXT;
ALTER TABLE employees ADD COLUMN restored_by TEXT;
ALTER TABLE employees ADD COLUMN restore_reason TEXT;

ALTER TABLE employee_documents ADD COLUMN archived_at TEXT;
ALTER TABLE employee_documents ADD COLUMN archived_by TEXT;
ALTER TABLE employee_documents ADD COLUMN archive_reason TEXT;
ALTER TABLE employee_documents ADD COLUMN restored_at TEXT;
ALTER TABLE employee_documents ADD COLUMN restored_by TEXT;
ALTER TABLE employee_documents ADD COLUMN restore_reason TEXT;

ALTER TABLE attendance_events ADD COLUMN archived_at TEXT;
ALTER TABLE attendance_events ADD COLUMN archived_by TEXT;
ALTER TABLE attendance_events ADD COLUMN archive_reason TEXT;
ALTER TABLE attendance_events ADD COLUMN restored_at TEXT;
ALTER TABLE attendance_events ADD COLUMN restored_by TEXT;
ALTER TABLE attendance_events ADD COLUMN restore_reason TEXT;

ALTER TABLE biometric_attendance_logs ADD COLUMN archived_at TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN archived_by TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN archive_reason TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN restored_at TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN restored_by TEXT;
ALTER TABLE biometric_attendance_logs ADD COLUMN restore_reason TEXT;

ALTER TABLE leave_requests ADD COLUMN archived_at TEXT;
ALTER TABLE leave_requests ADD COLUMN archived_by TEXT;
ALTER TABLE leave_requests ADD COLUMN archive_reason TEXT;
ALTER TABLE leave_requests ADD COLUMN restored_at TEXT;
ALTER TABLE leave_requests ADD COLUMN restored_by TEXT;
ALTER TABLE leave_requests ADD COLUMN restore_reason TEXT;

ALTER TABLE long_leave_records ADD COLUMN archived_at TEXT;
ALTER TABLE long_leave_records ADD COLUMN archived_by TEXT;
ALTER TABLE long_leave_records ADD COLUMN archive_reason TEXT;
ALTER TABLE long_leave_records ADD COLUMN restored_at TEXT;
ALTER TABLE long_leave_records ADD COLUMN restored_by TEXT;
ALTER TABLE long_leave_records ADD COLUMN restore_reason TEXT;

ALTER TABLE payroll_runs ADD COLUMN archived_at TEXT;
ALTER TABLE payroll_runs ADD COLUMN archived_by TEXT;
ALTER TABLE payroll_runs ADD COLUMN archive_reason TEXT;
ALTER TABLE payroll_runs ADD COLUMN restored_at TEXT;
ALTER TABLE payroll_runs ADD COLUMN restored_by TEXT;
ALTER TABLE payroll_runs ADD COLUMN restore_reason TEXT;

ALTER TABLE payroll_items ADD COLUMN archived_at TEXT;
ALTER TABLE payroll_items ADD COLUMN archived_by TEXT;
ALTER TABLE payroll_items ADD COLUMN archive_reason TEXT;
ALTER TABLE payroll_items ADD COLUMN restored_at TEXT;
ALTER TABLE payroll_items ADD COLUMN restored_by TEXT;
ALTER TABLE payroll_items ADD COLUMN restore_reason TEXT;

ALTER TABLE payslips ADD COLUMN archived_at TEXT;
ALTER TABLE payslips ADD COLUMN archived_by TEXT;
ALTER TABLE payslips ADD COLUMN archive_reason TEXT;
ALTER TABLE payslips ADD COLUMN restored_at TEXT;
ALTER TABLE payslips ADD COLUMN restored_by TEXT;
ALTER TABLE payslips ADD COLUMN restore_reason TEXT;

ALTER TABLE email_notifications ADD COLUMN archived_at TEXT;
ALTER TABLE email_notifications ADD COLUMN archived_by TEXT;
ALTER TABLE email_notifications ADD COLUMN archive_reason TEXT;
ALTER TABLE email_notifications ADD COLUMN restored_at TEXT;
ALTER TABLE email_notifications ADD COLUMN restored_by TEXT;
ALTER TABLE email_notifications ADD COLUMN restore_reason TEXT;

ALTER TABLE expiry_alerts ADD COLUMN archived_at TEXT;
ALTER TABLE expiry_alerts ADD COLUMN archived_by TEXT;
ALTER TABLE expiry_alerts ADD COLUMN archive_reason TEXT;
ALTER TABLE expiry_alerts ADD COLUMN restored_at TEXT;
ALTER TABLE expiry_alerts ADD COLUMN restored_by TEXT;
ALTER TABLE expiry_alerts ADD COLUMN restore_reason TEXT;

ALTER TABLE import_jobs ADD COLUMN archived_at TEXT;
ALTER TABLE import_jobs ADD COLUMN archived_by TEXT;
ALTER TABLE import_jobs ADD COLUMN archive_reason TEXT;
ALTER TABLE import_jobs ADD COLUMN restored_at TEXT;
ALTER TABLE import_jobs ADD COLUMN restored_by TEXT;
ALTER TABLE import_jobs ADD COLUMN restore_reason TEXT;

ALTER TABLE report_export_jobs ADD COLUMN archived_at TEXT;
ALTER TABLE report_export_jobs ADD COLUMN archived_by TEXT;
ALTER TABLE report_export_jobs ADD COLUMN archive_reason TEXT;
ALTER TABLE report_export_jobs ADD COLUMN restored_at TEXT;
ALTER TABLE report_export_jobs ADD COLUMN restored_by TEXT;
ALTER TABLE report_export_jobs ADD COLUMN restore_reason TEXT;

ALTER TABLE backup_jobs ADD COLUMN archived_at TEXT;
ALTER TABLE backup_jobs ADD COLUMN archived_by TEXT;
ALTER TABLE backup_jobs ADD COLUMN archive_reason TEXT;
ALTER TABLE backup_jobs ADD COLUMN restored_at TEXT;
ALTER TABLE backup_jobs ADD COLUMN restored_by TEXT;
ALTER TABLE backup_jobs ADD COLUMN restore_reason TEXT;

ALTER TABLE restore_jobs ADD COLUMN archive_reason TEXT;
ALTER TABLE restore_jobs ADD COLUMN restored_by TEXT;
ALTER TABLE restore_jobs ADD COLUMN restore_reason TEXT;
