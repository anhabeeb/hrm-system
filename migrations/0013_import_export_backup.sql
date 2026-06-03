CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  import_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  warning_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  uploaded_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_batch_rows (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  raw_data_json TEXT,
  mapped_data_json TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_entity_type TEXT,
  created_entity_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  export_type TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_key TEXT,
  filters_json TEXT,
  row_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS import_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  template_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  file_key TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  backup_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  storage_location TEXT,
  file_name TEXT,
  file_size INTEGER,
  started_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS restore_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  backup_job_id TEXT,
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  restore_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  maintenance_started_at TEXT,
  maintenance_ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_error_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  module TEXT,
  error_code TEXT,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  request_id TEXT,
  user_id TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL
);
