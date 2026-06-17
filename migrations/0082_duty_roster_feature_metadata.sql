-- Duty Roster feature metadata normalization.
-- Production-safe: adds missing feature settings and updates display metadata only.
-- Does not disable modules, delete data, or mutate roster records.

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
  c.id || '_feature_roster',
  c.id,
  'roster',
  'Duty Roster',
  1,
  'enabled',
  1,
  NULL,
  NULL,
  0,
  0,
  0,
  1,
  0,
  1,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
WHERE c.deleted_at IS NULL;

UPDATE feature_settings
SET
  feature_name = 'Duty Roster',
  updated_at = COALESCE(updated_at, created_at, '2026-01-01T00:00:00Z')
WHERE feature_key = 'roster'
  AND feature_name <> 'Duty Roster';
