-- Support username-or-email login without tenant context.
-- Uniqueness is enforced in service code to avoid failing existing deployments with legacy duplicates.
CREATE INDEX IF NOT EXISTS idx_users_login_email_global
ON users(email COLLATE NOCASE)
WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_login_username_global
ON users(username COLLATE NOCASE)
WHERE username IS NOT NULL AND deleted_at IS NULL;
