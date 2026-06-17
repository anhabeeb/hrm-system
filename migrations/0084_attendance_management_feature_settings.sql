-- Makes Attendance Management explicit for existing companies and seeds
-- non-destructive sub-feature defaults. Existing attendance records and
-- previously saved settings are preserved.

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
  c.id || '_feature_attendance',
  c.id,
  'attendance',
  'Attendance Management',
  1,
  'enabled',
  1,
  NULL,
  NULL,
  0,
  1,
  0,
  0,
  0,
  1,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
WHERE c.deleted_at IS NULL;

INSERT OR IGNORE INTO company_settings (
  id,
  company_id,
  setting_key,
  setting_group,
  setting_value_json,
  effective_from,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT
  c.id || '_setting_attendance_default_rules',
  c.id,
  'attendance.default_rules',
  'attendance',
  '{"attendance.manual_entry_enabled":true,"attendance.kiosk_enabled":true,"attendance.biometric_enabled":false,"attendance.corrections_enabled":true,"attendance.payroll_deductions_enabled":true,"manual_attendance_enabled":true,"batch_manual_attendance_enabled":true,"attendance_correction_enabled":true,"kiosk_mode_enabled":true,"biometric_enabled":false,"absent_day_deduction_enabled":true,"deduct_absent_days":true,"require_complete_attendance_before_payroll":true,"missing_attendance_counts_as_absent":false}',
  NULL,
  NULL,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
WHERE c.deleted_at IS NULL;
