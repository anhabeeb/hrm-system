CREATE TABLE IF NOT EXISTS approval_workflows (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workflow_key TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  module TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  approval_mode TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, workflow_key)
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  required_role_key TEXT,
  required_permission_key TEXT,
  is_required INTEGER NOT NULL DEFAULT 1,
  approval_type TEXT NOT NULL DEFAULT 'single',
  amount_min INTEGER,
  amount_max INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  employee_id TEXT,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step INTEGER DEFAULT 1,
  summary TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_actions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  action TEXT NOT NULL,
  acted_by TEXT NOT NULL,
  comment TEXT,
  old_status TEXT,
  new_status TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_thresholds (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workflow_key TEXT NOT NULL,
  threshold_name TEXT NOT NULL,
  threshold_type TEXT NOT NULL,
  amount_min INTEGER,
  amount_max INTEGER,
  percentage_min REAL,
  percentage_max REAL,
  currency TEXT DEFAULT 'MVR',
  required_roles_json TEXT,
  required_permissions_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_threshold_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  threshold_id TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  changed_by TEXT NOT NULL,
  approved_by TEXT,
  change_reason TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  effective_from TEXT,
  created_at TEXT NOT NULL
);
