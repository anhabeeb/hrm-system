INSERT OR IGNORE INTO approval_workflows (
  id, company_id, workflow_key, workflow_name, module, is_enabled, approval_mode, created_at, updated_at
)
SELECT
  'workflow_salary_increment_' || c.id,
  c.id,
  'salary_increment',
  'Salary & Promotion Changes',
  'salary',
  1,
  'auto_admin_superadmin',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM companies c
WHERE c.deleted_at IS NULL;

INSERT OR IGNORE INTO approval_steps (
  id, company_id, workflow_id, step_order, step_name, required_role_key,
  required_permission_key, is_required, approval_type, amount_min, amount_max, created_at, updated_at
)
SELECT
  'step_salary_increment_' || c.id,
  c.id,
  w.id,
  1,
  'Salary approval',
  NULL,
  'approvals.approve',
  1,
  'single',
  NULL,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM companies c
JOIN approval_workflows w ON w.company_id = c.id AND w.workflow_key = 'salary_increment'
WHERE c.deleted_at IS NULL;

INSERT OR IGNORE INTO company_settings (
  id, company_id, setting_key, setting_group, setting_value_json,
  effective_from, created_by, updated_by, created_at, updated_at
)
SELECT
  'setting_salary_approval_' || c.id,
  c.id,
  'approvals.salary_rules',
  'payroll',
  json_object(
    'salary_change_approval_enabled', true,
    'promotion_salary_change_approval_enabled', true,
    'salary_correction_approval_enabled', true,
    'allow_requester_self_approval', false,
    'allow_super_admin_override', true,
    'auto_apply_when_no_eligible_approver', true,
    'approval_request_expiry_days', 30,
    'approval_applying_recovery_minutes', 5,
    'require_reason_for_approval', true,
    'require_reason_for_rejection', true
  ),
  NULL,
  NULL,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM companies c
WHERE c.deleted_at IS NULL;
