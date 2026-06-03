CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  device_id TEXT,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  attendance_method TEXT NOT NULL,
  source TEXT NOT NULL,
  local_id TEXT,
  created_offline INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  approval_status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, device_id, local_id)
);

CREATE TABLE IF NOT EXISTS attendance_daily_summary (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  first_clock_in TEXT,
  last_clock_out TEXT,
  worked_minutes INTEGER DEFAULT 0,
  late_minutes INTEGER DEFAULT 0,
  early_out_minutes INTEGER DEFAULT 0,
  break_minutes INTEGER DEFAULT 0,
  overtime_minutes INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  payroll_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  attendance_event_id TEXT,
  correction_type TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_by TEXT,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_conflicts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT,
  outlet_id TEXT,
  device_id TEXT,
  conflict_type TEXT NOT NULL,
  local_payload_json TEXT,
  server_payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by TEXT,
  resolution_notes TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS biometric_devices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  device_serial TEXT NOT NULL,
  device_type TEXT NOT NULL,
  sync_mode TEXT NOT NULL,
  api_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, device_serial)
);

CREATE TABLE IF NOT EXISTS employee_biometric_links (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  biometric_user_id TEXT NOT NULL,
  enrollment_status TEXT NOT NULL DEFAULT 'enrolled',
  is_active INTEGER NOT NULL DEFAULT 1,
  enrolled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, device_id, biometric_user_id)
);

CREATE TABLE IF NOT EXISTS biometric_attendance_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  outlet_id TEXT,
  biometric_user_id TEXT NOT NULL,
  employee_id TEXT,
  event_time TEXT NOT NULL,
  server_received_at TEXT,
  event_type TEXT NOT NULL,
  verification_method TEXT,
  raw_payload_json TEXT,
  dedupe_key TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, dedupe_key)
);
