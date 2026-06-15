-- Advance salary approval engine integration.
-- Additive only: existing advance_payments records remain legacy-compatible.

CREATE TABLE IF NOT EXISTS advance_salary_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  requester_employee_id TEXT,
  requester_user_id TEXT,
  department_id TEXT,
  position_id TEXT,
  level INTEGER,
  outlet_id TEXT,
  payroll_month TEXT,
  payroll_year INTEGER,
  request_type TEXT NOT NULL,
  requested_amount NUMERIC NOT NULL,
  approved_amount NUMERIC,
  paid_amount NUMERIC,
  outstanding_amount NUMERIC,
  currency TEXT DEFAULT 'MVR',
  requested_payment_date TEXT,
  approved_payment_date TEXT,
  actual_payment_date TEXT,
  repayment_start_month TEXT,
  repayment_start_year INTEGER,
  repayment_months INTEGER,
  repayment_amount_per_month NUMERIC,
  repayment_policy_json TEXT,
  reason TEXT NOT NULL,
  employee_note TEXT,
  manager_note TEXT,
  owner_note TEXT,
  final_approver_note TEXT,
  payment_note TEXT,
  evidence_attachment_id TEXT,
  approval_request_id TEXT,
  approval_status TEXT,
  approval_current_step TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  payment_status TEXT NOT NULL DEFAULT 'NOT_READY',
  deduction_status TEXT NOT NULL DEFAULT 'NOT_SCHEDULED',
  operation_owner_department_id TEXT,
  operation_final_department_id TEXT,
  operation_execution_department_id TEXT,
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
  payment_executed_at TEXT,
  payment_executed_by TEXT,
  payment_error_code TEXT,
  payment_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  CHECK (level IS NULL OR level BETWEEN 1 AND 4),
  CHECK (requested_amount > 0),
  CHECK (repayment_months IS NULL OR repayment_months > 0),
  CHECK (status IN ('DRAFT','PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_PAYMENT','PENDING_MANUAL_REVIEW','APPROVED','REJECTED','CANCELLED','PAID','PARTIALLY_DEDUCTED','FULLY_DEDUCTED','FAILED_TO_PAY')),
  CHECK (payment_status IN ('NOT_READY','PENDING_PAYMENT','PAID','FAILED','CANCELLED')),
  CHECK (deduction_status IN ('NOT_SCHEDULED','SCHEDULED','PARTIALLY_DEDUCTED','FULLY_DEDUCTED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS advance_salary_payment_ledger (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  advance_salary_request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT,
  payment_date TEXT NOT NULL,
  payment_method TEXT,
  payment_reference TEXT,
  bank_name TEXT,
  paid_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PAID',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS advance_salary_deduction_schedule (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  advance_salary_request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  payroll_month TEXT NOT NULL,
  payroll_year INTEGER,
  scheduled_amount NUMERIC NOT NULL,
  deducted_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  deducted_at TEXT,
  payroll_run_id TEXT,
  payslip_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_company ON advance_salary_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_employee ON advance_salary_requests(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_requester_employee ON advance_salary_requests(company_id, requester_employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_approval ON advance_salary_requests(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_status ON advance_salary_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_payment_status ON advance_salary_requests(company_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_deduction_status ON advance_salary_requests(company_id, deduction_status);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_month ON advance_salary_requests(company_id, payroll_month, payroll_year);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_department ON advance_salary_requests(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_advance_salary_requests_outlet ON advance_salary_requests(company_id, outlet_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_advance_salary_one_active_approval
ON advance_salary_requests(company_id, approval_request_id)
WHERE approval_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_advance_salary_pending_guard
ON advance_salary_requests(company_id, employee_id, request_type, COALESCE(payroll_month, ''), COALESCE(requested_payment_date, ''))
WHERE status IN ('DRAFT','PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_PAYMENT','PENDING_MANUAL_REVIEW','APPROVED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_advance_salary_payment_once
ON advance_salary_payment_ledger(company_id, advance_salary_request_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_advance_salary_deduction_once
ON advance_salary_deduction_schedule(company_id, advance_salary_request_id, payroll_month);

CREATE INDEX IF NOT EXISTS idx_advance_salary_payment_employee ON advance_salary_payment_ledger(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_salary_payment_date ON advance_salary_payment_ledger(company_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_advance_salary_deduction_employee ON advance_salary_deduction_schedule(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_salary_deduction_month ON advance_salary_deduction_schedule(company_id, payroll_month, payroll_year);
CREATE INDEX IF NOT EXISTS idx_advance_salary_deduction_status ON advance_salary_deduction_schedule(company_id, status);

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_advance_salary_requests_view', 'advanceSalary.requests.view', 'advances', 'salary_requests_view', 'View advance salary requests.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_create', 'advanceSalary.requests.create', 'advances', 'salary_requests_create', 'Create own advance salary requests.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_create_for_others', 'advanceSalary.requests.createForOthers', 'advances', 'salary_requests_create_for_others', 'Create advance salary requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_submit', 'advanceSalary.requests.submit', 'advances', 'salary_requests_submit', 'Submit advance salary requests for approval.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_review', 'advanceSalary.requests.review', 'advances', 'salary_requests_review', 'Review advance salary request steps.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_approve', 'advanceSalary.requests.approve', 'advances', 'salary_requests_approve', 'Approve advance salary request steps.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_reject', 'advanceSalary.requests.reject', 'advances', 'salary_requests_reject', 'Reject advance salary request steps.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_final_approve', 'advanceSalary.requests.finalApprove', 'advances', 'salary_requests_final_approve', 'Final-approve advance salary requests.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_cancel', 'advanceSalary.requests.cancel', 'advances', 'salary_requests_cancel', 'Cancel own advance salary requests.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_requests_cancel_any', 'advanceSalary.requests.cancelAny', 'advances', 'salary_requests_cancel_any', 'Cancel advance salary requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_payments_execute', 'advanceSalary.payments.execute', 'advances', 'salary_payments_execute', 'Execute approved advance salary payments.', '2026-01-01T00:00:00Z'),
  ('perm_advance_salary_audit_view', 'advanceSalary.audit.view', 'advances', 'salary_audit_view', 'View advance salary approval timelines and audit.', '2026-01-01T00:00:00Z');

INSERT INTO approval_workflows (
  id, company_id, code, workflow_key, workflow_name, name, description, module, operation_type,
  status, is_enabled, is_default, created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_advance_salary_request_default', 'company_seed_default', 'ADVANCE_SALARY_REQUEST_DEFAULT',
  'advance_salary_request_default', 'Advance Salary Request Default', 'Advance Salary Request Default',
  'Operation ownership driven advance salary approval workflow.', 'advances', 'ADVANCE_SALARY_REQUEST',
  'ACTIVE', 1, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows
   WHERE company_id = 'company_seed_default'
     AND operation_type = 'ADVANCE_SALARY_REQUEST'
     AND code = 'ADVANCE_SALARY_REQUEST_DEFAULT'
);

INSERT INTO approval_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, fallback_behavior, is_final_step, allow_self_approval, is_active,
  required_role_key, required_permission_key, created_at, updated_at, created_by, updated_by
)
SELECT
  'step_advance_salary_owner_review', 'company_seed_default', 'workflow_advance_salary_request_default',
  1, 'OWNER_REVIEW', 'Operation Owner Review', 'OPERATION_OWNER',
  'advanceSalary.requests.review', 'HOLD_FOR_MANUAL_ASSIGNMENT', 0, 0, 1,
  'operation_owner', 'advanceSalary.requests.review', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_steps
   WHERE company_id = 'company_seed_default'
     AND workflow_id = 'workflow_advance_salary_request_default'
     AND step_code = 'OWNER_REVIEW'
);

INSERT INTO approval_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, fallback_behavior, is_final_step, allow_self_approval, is_active,
  required_role_key, required_permission_key, created_at, updated_at, created_by, updated_by
)
SELECT
  'step_advance_salary_final_approval', 'company_seed_default', 'workflow_advance_salary_request_default',
  2, 'FINAL_APPROVAL', 'Operation Final Approval', 'OPERATION_FINAL_APPROVER',
  'advanceSalary.requests.finalApprove', 'HOLD_FOR_MANUAL_ASSIGNMENT', 1, 0, 1,
  'operation_final_approver', 'advanceSalary.requests.finalApprove', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM approval_steps
   WHERE company_id = 'company_seed_default'
     AND workflow_id = 'workflow_advance_salary_request_default'
     AND step_code = 'FINAL_APPROVAL'
);
