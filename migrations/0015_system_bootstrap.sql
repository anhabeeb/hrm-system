CREATE TABLE IF NOT EXISTS system_bootstrap (
  id TEXT PRIMARY KEY DEFAULT 'default',
  is_initialized INTEGER NOT NULL DEFAULT 0,
  company_id TEXT,
  initialized_by_user_id TEXT,
  initialized_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO system_bootstrap (
  id,
  is_initialized,
  created_at,
  updated_at
) VALUES (
  'default',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
