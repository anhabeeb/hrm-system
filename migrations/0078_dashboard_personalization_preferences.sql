CREATE TABLE IF NOT EXISTS dashboard_user_preferences (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  dashboard_type TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  density TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(company_id, user_id, dashboard_type)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_preferences_company_user
  ON dashboard_user_preferences(company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_user_preferences_company_type
  ON dashboard_user_preferences(company_id, dashboard_type);
