ALTER TABLE leave_requests ADD COLUMN document_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_requests ADD COLUMN document_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE leave_requests ADD COLUMN document_required_reason TEXT;
ALTER TABLE leave_requests ADD COLUMN policy_rule_id TEXT;
ALTER TABLE leave_requests ADD COLUMN policy_snapshot_json TEXT;

CREATE INDEX IF NOT EXISTS idx_leave_requests_company_document_status
  ON leave_requests(company_id, document_status, status);

UPDATE leave_type_policy_rules
SET
  annual_entitlement_days = 10,
  leave_type_key = 'frl',
  paid_status = 'paid',
  paid_percentage = 100,
  payroll_impact_enabled = 0,
  salary_deduction_enabled = 0,
  deduction_mode = 'none',
  deduction_component = 'leave_policy',
  deduction_component_keys_json = NULL,
  deduction_pay_component_keys = NULL,
  deduction_daily_rate_method = 'payroll_working_days',
  deduction_custom_divisor = NULL,
  document_requirement = 'after_consecutive_days',
  document_required_mode = 'after_consecutive_days',
  document_after_days = 2,
  document_required_after_consecutive_days = 2,
  document_after_used_days = NULL,
  document_required_after_used_days = NULL,
  allow_no_document_until_used_days = NULL,
  require_document_for_backdated_request = 0,
  require_document_for_extension = 0,
  approval_required = 1,
  approval_workflow_key = 'leave_request',
  payroll_source_label = 'family_responsibility_leave_policy',
  notes = 'Paid leave. No salary deduction. Documents are required only when a request exceeds 2 consecutive days.',
  updated_at = COALESCE(updated_at, created_at, '2026-01-01T00:00:00Z')
WHERE leave_type_id IN (
  SELECT id
  FROM leave_types
  WHERE lower(leave_key) IN ('frl', 'family_responsibility_leave')
     OR lower(leave_name) LIKE '%family responsibility%'
);

UPDATE leave_type_policy_rules
SET
  annual_entitlement_days = 30,
  leave_type_key = 'sick_leave',
  paid_status = 'paid',
  paid_percentage = 100,
  payroll_impact_enabled = 0,
  salary_deduction_enabled = 0,
  deduction_mode = 'none',
  document_requirement = 'after_consecutive_or_used_days',
  document_required_mode = 'after_consecutive_or_used_days',
  document_after_days = 2,
  document_required_after_consecutive_days = 2,
  document_after_used_days = 15,
  document_required_after_used_days = 15,
  allow_no_document_until_used_days = 15,
  require_document_for_backdated_request = 0,
  require_document_for_extension = 0,
  approval_required = 1,
  approval_workflow_key = 'leave_request',
  payroll_source_label = 'sick_leave_policy',
  notes = 'Paid leave. First 15 used sick leave days can be submitted without documents if each request is 2 consecutive days or less.',
  updated_at = COALESCE(updated_at, created_at, '2026-01-01T00:00:00Z')
WHERE leave_type_id IN (
  SELECT id
  FROM leave_types
  WHERE lower(leave_key) LIKE '%sick%'
     OR lower(leave_name) LIKE '%sick%'
);
