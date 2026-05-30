CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  password_algo TEXT NOT NULL DEFAULT 'argon2id',
  password_updated_at TEXT,
  password_reset_required INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_password_reset_at TEXT,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(company_id, email)
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  role_key TEXT NOT NULL,
  role_name TEXT NOT NULL,
  description TEXT,
  is_system_role INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(company_id, role_key)
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  permission_key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS user_outlets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'view_only',
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, outlet_id)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  is_allowed INTEGER NOT NULL,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  device_id TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_two_factor (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'totp',
  secret_encrypted TEXT,
  backup_codes_hash_json TEXT,
  enabled_at TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile_update_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  employee_id TEXT,
  request_type TEXT NOT NULL,
  old_value_json TEXT,
  requested_value_json TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile_update_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT,
  document_type TEXT,
  uploaded_at TEXT NOT NULL
);
