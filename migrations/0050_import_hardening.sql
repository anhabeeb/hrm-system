CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  import_type TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  file_storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  mode TEXT NOT NULL DEFAULT 'validate_only',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  created_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  requested_by TEXT,
  requested_at TEXT NOT NULL,
  validated_at TEXT,
  applied_at TEXT,
  cancelled_at TEXT,
  failure_code TEXT,
  failure_message TEXT,
  idempotency_key TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_job_rows (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  import_job_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  row_data_json TEXT,
  normalized_data_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  warnings_json TEXT,
  target_entity_type TEXT,
  target_entity_id TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, import_job_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_company_type_status
  ON import_jobs(company_id, import_type, status);

CREATE INDEX IF NOT EXISTS idx_import_jobs_company_requested
  ON import_jobs(company_id, requested_by, requested_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_jobs_company_idempotency
  ON import_jobs(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_job_rows_company_job_status
  ON import_job_rows(company_id, import_job_id, status);

CREATE INDEX IF NOT EXISTS idx_import_job_rows_company_job_number
  ON import_job_rows(company_id, import_job_id, row_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_job_rows_company_idempotency
  ON import_job_rows(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
