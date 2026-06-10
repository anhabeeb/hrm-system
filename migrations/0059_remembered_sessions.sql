-- Track sessions created through the backend-controlled Remember me policy.
ALTER TABLE sessions ADD COLUMN remember_me INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_company_user_remembered
  ON sessions(company_id, user_id, remember_me, revoked_at, expires_at);
