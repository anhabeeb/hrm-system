CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  entity_type TEXT,
  entity_id TEXT,
  employee_id TEXT,
  actor_user_id TEXT,
  actor_role_id TEXT,
  device_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  old_value_json TEXT,
  new_value_json TEXT,
  reason TEXT,
  effective_date TEXT,
  approval_request_id TEXT,
  sync_batch_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT,
  outlet_id TEXT,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  entity_type TEXT,
  entity_id TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS realtime_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  outlet_id TEXT,
  user_id TEXT,
  device_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  message TEXT,
  sync_token INTEGER,
  delivered_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
