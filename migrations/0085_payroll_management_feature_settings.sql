-- Payroll Management module metadata and sub-feature defaults.
-- Production safe: additive/idempotent, no destructive data changes.

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
  c.id || '_feature_payroll',
  c.id,
  'payroll',
  'Payroll Management',
  1,
  'enabled',
  1,
  NULL,
  NULL,
  1,
  0,
  0,
  0,
  0,
  1,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
WHERE c.deleted_at IS NULL;

UPDATE feature_settings
SET
  feature_name = 'Payroll Management',
  affects_payroll = 1,
  audit_enabled = 1,
  updated_at = COALESCE(updated_at, created_at, '2026-01-01T00:00:00Z')
WHERE feature_key = 'payroll'
  AND (feature_name IS NULL OR feature_name = 'Payroll');

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
  c.id || '_setting_payroll_default_rules',
  c.id,
  'payroll.default_rules',
  'payroll',
  '{"payroll.salary_processing_enabled":true,"payroll.payslips_enabled":true,"payroll.advances_enabled":true,"payroll.salary_loans_enabled":true,"payroll.overtime_enabled":true,"payroll.benefits_enabled":true,"payroll.manual_deductions_enabled":true,"payroll.attendance_deductions_enabled":true,"payroll.long_leave_deductions_enabled":true,"payroll.approvals_enabled":true,"salary_calculation_basis":"fixed_30_days","custom_salary_days":30,"standard_working_hours":8,"attendance_to_payroll_enabled":true,"deduct_absent_days":true,"deduct_late_minutes":false,"deduct_early_checkout":false,"allow_negative_salary":false,"carry_forward_unpaid_deductions":true,"payroll_lock_enabled":true}',
  NULL,
  NULL,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
WHERE c.deleted_at IS NULL;
