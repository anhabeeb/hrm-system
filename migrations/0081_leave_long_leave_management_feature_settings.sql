-- Adds explicit module switches for Leave Management and Long Leave Management.
-- This is additive, idempotent, and does not modify existing leave or payroll history.

INSERT OR IGNORE INTO feature_settings (
  id,
  company_id,
  feature_key,
  feature_name,
  is_enabled,
  status,
  applies_to_all_outlets,
  allowed_outlet_ids_json,
  allowed_role_ids_json,
  affects_payroll,
  affects_attendance,
  affects_leave,
  affects_roster,
  offline_enabled,
  audit_enabled,
  effective_from,
  created_at,
  updated_at
)
SELECT
  c.id || '_feature_leave_management',
  c.id,
  'leave_management',
  'Leave Management',
  1,
  'enabled',
  1,
  NULL,
  NULL,
  0,
  0,
  1,
  0,
  0,
  1,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
WHERE c.deleted_at IS NULL;

INSERT OR IGNORE INTO feature_settings (
  id,
  company_id,
  feature_key,
  feature_name,
  is_enabled,
  status,
  applies_to_all_outlets,
  allowed_outlet_ids_json,
  allowed_role_ids_json,
  affects_payroll,
  affects_attendance,
  affects_leave,
  affects_roster,
  offline_enabled,
  audit_enabled,
  effective_from,
  created_at,
  updated_at
)
SELECT
  c.id || '_feature_long_leave_management',
  c.id,
  'long_leave_management',
  'Long Leave Management',
  1,
  'enabled',
  1,
  NULL,
  NULL,
  1,
  0,
  1,
  0,
  0,
  1,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
WHERE c.deleted_at IS NULL;
