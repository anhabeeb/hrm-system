-- Adds independent module switches for approval-bound modules that previously
-- inherited broad employee/payroll settings. This is additive and preserves
-- existing rows so administrators can disable each module explicitly.

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
  c.id || '_feature_' || f.feature_key,
  c.id,
  f.feature_key,
  f.feature_name,
  1,
  'enabled',
  1,
  NULL,
  NULL,
  f.affects_payroll,
  0,
  0,
  f.affects_roster,
  0,
  1,
  NULL,
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z'),
  COALESCE(c.updated_at, c.created_at, '2026-01-01T00:00:00Z')
FROM companies c
CROSS JOIN (
  SELECT 'operation_ownership' AS feature_key, 'Operation Ownership' AS feature_name, 0 AS affects_payroll, 0 AS affects_roster
  UNION ALL SELECT 'payroll_adjustments', 'Payroll Adjustments', 1, 0
  UNION ALL SELECT 'advance_salary', 'Advance Salary', 1, 0
  UNION ALL SELECT 'employee_structure_changes', 'Employee Structure Changes', 0, 0
  UNION ALL SELECT 'resignation_offboarding', 'Resignation / Offboarding', 0, 0
  UNION ALL SELECT 'disciplinary_actions', 'Disciplinary Actions', 0, 0
) f
WHERE c.deleted_at IS NULL;
