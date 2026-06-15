-- Payroll adjustment approval engine integration.
-- Additive only: payroll runs/items/payslips are not modified directly here.

CREATE TABLE IF NOT EXISTS payroll_adjustment_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  requester_employee_id TEXT,
  requester_user_id TEXT,
  department_id TEXT,
  position_id TEXT,
  level INTEGER,
  outlet_id TEXT,
  payroll_run_id TEXT,
  payroll_item_id TEXT,
  payslip_id TEXT,
  adjustment_type TEXT NOT NULL,
  adjustment_direction TEXT NOT NULL,
  amount NUMERIC,
  currency TEXT DEFAULT 'MVR',
  effective_payroll_month TEXT,
  reason TEXT NOT NULL,
  current_value_json TEXT,
  requested_value_json TEXT,
  approval_request_id TEXT,
  approval_status TEXT,
  approval_current_step TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  owner_reviewed_at TEXT,
  owner_reviewed_by TEXT,
  final_approved_at TEXT,
  final_approved_by TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  approval_submitted_at TEXT,
  approval_completed_at TEXT,
  applied_at TEXT,
  applied_by TEXT,
  apply_error_code TEXT,
  apply_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  CHECK (level IS NULL OR level BETWEEN 1 AND 4),
  CHECK (status IN (
    'DRAFT',
    'PENDING',
    'PENDING_OWNER_REVIEW',
    'PENDING_FINAL_APPROVAL',
    'PENDING_EXECUTION',
    'PENDING_MANUAL_REVIEW',
    'APPROVED',
    'APPLIED',
    'REJECTED',
    'CANCELLED',
    'FAILED_TO_APPLY'
  ))
);

CREATE TABLE IF NOT EXISTS payroll_adjustment_applied_ledger (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  payroll_adjustment_request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  payroll_run_id TEXT,
  payroll_item_id TEXT,
  payslip_id TEXT,
  adjustment_type TEXT NOT NULL,
  adjustment_direction TEXT NOT NULL,
  amount NUMERIC,
  currency TEXT,
  effective_payroll_month TEXT,
  ledger_status TEXT NOT NULL DEFAULT 'posted',
  metadata_json TEXT,
  applied_at TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_company ON payroll_adjustment_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee ON payroll_adjustment_requests(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_requester_employee ON payroll_adjustment_requests(company_id, requester_employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_department ON payroll_adjustment_requests(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_outlet ON payroll_adjustment_requests(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_status ON payroll_adjustment_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_approval ON payroll_adjustment_requests(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_month ON payroll_adjustment_requests(company_id, effective_payroll_month);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_adjustments_one_active_approval
ON payroll_adjustment_requests(company_id, approval_request_id)
WHERE approval_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_adjustments_pending_guard
ON payroll_adjustment_requests(company_id, employee_id, adjustment_type, COALESCE(effective_payroll_month, ''), COALESCE(payroll_run_id, ''), COALESCE(payroll_item_id, ''))
WHERE status IN ('DRAFT', 'PENDING', 'PENDING_OWNER_REVIEW', 'PENDING_FINAL_APPROVAL', 'PENDING_EXECUTION', 'PENDING_MANUAL_REVIEW');

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_adjustment_ledger_once
ON payroll_adjustment_applied_ledger(company_id, payroll_adjustment_request_id);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustment_ledger_employee ON payroll_adjustment_applied_ledger(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustment_ledger_run ON payroll_adjustment_applied_ledger(company_id, payroll_run_id);

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_payroll_adjustments_view', 'payroll.adjustments.view', 'payroll', 'adjustments_view', 'View payroll adjustment requests.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_create', 'payroll.adjustments.create', 'payroll', 'adjustments_create', 'Create own payroll adjustment requests.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_create_for_others', 'payroll.adjustments.createForOthers', 'payroll', 'adjustments_create_for_others', 'Create payroll adjustment requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_submit', 'payroll.adjustments.submit', 'payroll', 'adjustments_submit', 'Submit payroll adjustment requests for approval.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_review', 'payroll.adjustments.review', 'payroll', 'adjustments_review', 'Review payroll adjustment request steps.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_approve', 'payroll.adjustments.approve', 'payroll', 'adjustments_approve', 'Approve payroll adjustment request steps.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_reject', 'payroll.adjustments.reject', 'payroll', 'adjustments_reject', 'Reject payroll adjustment request steps.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_final_approve', 'payroll.adjustments.finalApprove', 'payroll', 'adjustments_final_approve', 'Final-approve payroll adjustment requests.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_cancel', 'payroll.adjustments.cancel', 'payroll', 'adjustments_cancel', 'Cancel own payroll adjustment requests.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_cancel_any', 'payroll.adjustments.cancelAny', 'payroll', 'adjustments_cancel_any', 'Cancel payroll adjustment requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_apply', 'payroll.adjustments.apply', 'payroll', 'adjustments_apply', 'Apply approved payroll adjustment requests through execution controls.', '2026-01-01T00:00:00Z'),
  ('perm_payroll_adjustments_audit_view', 'payroll.adjustments.audit.view', 'payroll', 'adjustments_audit_view', 'View payroll adjustment approval timeline and audit.', '2026-01-01T00:00:00Z');

INSERT INTO approval_workflows (
  id, company_id, code, workflow_key, workflow_name, name, description, module, operation_type,
  status, is_enabled, is_default, created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_payroll_adjustment_default', 'company_seed_default', 'PAYROLL_ADJUSTMENT_DEFAULT',
  'payroll_adjustment_default', 'Payroll Adjustment Default', 'Payroll Adjustment Default',
  'Operation ownership driven payroll adjustment approval workflow.', 'payroll', 'PAYROLL_ADJUSTMENT',
  'ACTIVE', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows
   WHERE company_id = 'company_seed_default'
     AND operation_type = 'PAYROLL_ADJUSTMENT'
     AND code = 'PAYROLL_ADJUSTMENT_DEFAULT'
);

INSERT INTO approval_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, fallback_behavior, is_final_step, allow_self_approval, is_active,
  required_role_key, required_permission_key, created_at, updated_at, created_by, updated_by
)
SELECT
  'step_payroll_adjustment_owner_review', 'company_seed_default', 'workflow_payroll_adjustment_default',
  1, 'OWNER_REVIEW', 'Owner Review', 'OPERATION_OWNER',
  'payroll.adjustments.review', 'HOLD_FOR_MANUAL_ASSIGNMENT', 0, 0, 1,
  'operation_owner', 'payroll.adjustments.review', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_steps
   WHERE company_id = 'company_seed_default'
     AND workflow_id = 'workflow_payroll_adjustment_default'
     AND step_code = 'OWNER_REVIEW'
);

INSERT INTO approval_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, fallback_behavior, is_final_step, allow_self_approval, is_active,
  required_role_key, required_permission_key, created_at, updated_at, created_by, updated_by
)
SELECT
  'step_payroll_adjustment_final_approval', 'company_seed_default', 'workflow_payroll_adjustment_default',
  2, 'FINAL_APPROVAL', 'Final Approval', 'OPERATION_FINAL_APPROVER',
  'payroll.adjustments.finalApprove', 'HOLD_FOR_MANUAL_ASSIGNMENT', 1, 0, 1,
  'operation_final_approver', 'payroll.adjustments.finalApprove', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_steps
   WHERE company_id = 'company_seed_default'
     AND workflow_id = 'workflow_payroll_adjustment_default'
     AND step_code = 'FINAL_APPROVAL'
);
