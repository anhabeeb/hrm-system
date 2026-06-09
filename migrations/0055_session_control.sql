-- Additive session-control metadata for concurrent-login enforcement.
ALTER TABLE sessions ADD COLUMN device_label TEXT;
ALTER TABLE sessions ADD COLUMN user_agent_summary TEXT;
ALTER TABLE sessions ADD COLUMN ip_summary TEXT;
ALTER TABLE sessions ADD COLUMN revoked_reason TEXT;
ALTER TABLE sessions ADD COLUMN revoked_by TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_company_user_active
  ON sessions(company_id, user_id, revoked_at, expires_at);
