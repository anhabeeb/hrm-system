CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  device_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_seen_at TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_batches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  event_count INTEGER DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  rejected_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, device_id, batch_id)
);

CREATE TABLE IF NOT EXISTS sync_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  device_id TEXT,
  batch_id TEXT,
  local_id TEXT,
  entity_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  server_entity_id TEXT,
  payload_json TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_offline_at TEXT,
  server_received_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_changes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  change_version INTEGER NOT NULL,
  changed_by TEXT,
  changed_at TEXT NOT NULL,
  payload_summary_json TEXT
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  device_id TEXT,
  employee_id TEXT,
  entity_type TEXT NOT NULL,
  local_id TEXT,
  conflict_type TEXT NOT NULL,
  local_payload_json TEXT,
  server_payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by TEXT,
  resolution_notes TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_sync_state (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  device_id TEXT NOT NULL,
  last_push_at TEXT,
  last_pull_at TEXT,
  last_sync_token INTEGER DEFAULT 0,
  pending_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, device_id)
);

CREATE TABLE IF NOT EXISTS device_health_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  device_id TEXT NOT NULL,
  device_type TEXT NOT NULL,
  health_status TEXT NOT NULL,
  pending_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,
  battery_level INTEGER,
  app_version TEXT,
  network_status TEXT,
  reported_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
