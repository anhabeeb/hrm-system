ALTER TABLE backup_jobs ADD COLUMN requested_by TEXT;
ALTER TABLE backup_jobs ADD COLUMN requested_at TEXT;
ALTER TABLE backup_jobs ADD COLUMN failed_at TEXT;
ALTER TABLE backup_jobs ADD COLUMN cancelled_at TEXT;
ALTER TABLE backup_jobs ADD COLUMN expires_at TEXT;
ALTER TABLE backup_jobs ADD COLUMN checksum_sha256 TEXT;
ALTER TABLE backup_jobs ADD COLUMN manifest_json TEXT;
ALTER TABLE backup_jobs ADD COLUMN table_count INTEGER;
ALTER TABLE backup_jobs ADD COLUMN row_count INTEGER;
ALTER TABLE backup_jobs ADD COLUMN included_tables_json TEXT;
ALTER TABLE backup_jobs ADD COLUMN excluded_tables_json TEXT;
ALTER TABLE backup_jobs ADD COLUMN redaction_summary_json TEXT;
ALTER TABLE backup_jobs ADD COLUMN failure_code TEXT;
ALTER TABLE backup_jobs ADD COLUMN failure_message TEXT;
ALTER TABLE backup_jobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE backup_jobs ADD COLUMN updated_at TEXT;
ALTER TABLE backup_jobs ADD COLUMN metadata_json TEXT;

CREATE TABLE IF NOT EXISTS restore_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  backup_job_id TEXT,
  source_file_storage_key TEXT,
  source_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  restore_mode TEXT NOT NULL DEFAULT 'dry_run',
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  validated_at TEXT,
  restored_at TEXT,
  cancelled_at TEXT,
  total_tables INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  restored_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  conflict_rows INTEGER NOT NULL DEFAULT 0,
  checksum_verified INTEGER NOT NULL DEFAULT 0,
  manifest_verified INTEGER NOT NULL DEFAULT 0,
  confirmation_token_hash TEXT,
  confirmation_expires_at TEXT,
  failure_code TEXT,
  failure_message TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS restore_job_rows (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  restore_job_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_number INTEGER,
  source_id TEXT,
  target_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  action TEXT NOT NULL DEFAULT 'skip',
  error_code TEXT,
  error_message TEXT,
  warnings_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_company_status_requested ON backup_jobs(company_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_company_requested_by ON backup_jobs(company_id, requested_by, requested_at);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_company_idempotency ON backup_jobs(company_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_company_status_requested ON restore_jobs(company_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_restore_jobs_company_requested_by ON restore_jobs(company_id, requested_by, requested_at);
CREATE INDEX IF NOT EXISTS idx_restore_job_rows_company_job_status ON restore_job_rows(company_id, restore_job_id, status);
