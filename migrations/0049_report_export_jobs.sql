-- Phase 11D: Export / Print Reports.
-- Additive only: export job history and indexes for safe report file generation.

CREATE TABLE IF NOT EXISTS report_export_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  report_key TEXT NOT NULL,
  report_category TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'csv',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  failure_code TEXT,
  failure_message TEXT,
  filters_json TEXT,
  columns_json TEXT,
  row_count INTEGER,
  file_name TEXT,
  file_size INTEGER,
  file_storage_key TEXT,
  download_url TEXT,
  expires_at TEXT,
  sensitive_export INTEGER NOT NULL DEFAULT 0,
  redaction_level TEXT NOT NULL DEFAULT 'standard',
  idempotency_key TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_company_requested_by_requested_at
  ON report_export_jobs(company_id, requested_by, requested_at);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_company_report_key_requested_at
  ON report_export_jobs(company_id, report_key, requested_at);

CREATE INDEX IF NOT EXISTS idx_report_export_jobs_company_status_requested_at
  ON report_export_jobs(company_id, status, requested_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_export_jobs_company_idempotency
  ON report_export_jobs(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

