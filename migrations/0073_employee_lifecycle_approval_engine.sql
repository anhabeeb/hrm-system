-- Resignation / Offboarding approval engine integration.
-- Additive only: existing employee_offboarding_cases remain legacy-compatible.

CREATE TABLE IF NOT EXISTS employee_exit_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  requester_employee_id TEXT,
  requester_user_id TEXT,
  department_id TEXT,
  position_id TEXT,
  level INTEGER,
  outlet_id TEXT,
  store_id TEXT,
  manager_employee_id TEXT,
  request_type TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('RESIGNATION', 'OFFBOARDING')),
  reason TEXT NOT NULL,
  resignation_date TEXT,
  requested_last_working_date TEXT,
  approved_last_working_date TEXT,
  notice_period_days INTEGER,
  notice_waiver_requested INTEGER NOT NULL DEFAULT 0,
  notice_waiver_approved INTEGER NOT NULL DEFAULT 0,
  exit_interview_required INTEGER NOT NULL DEFAULT 0,
  exit_interview_completed INTEGER NOT NULL DEFAULT 0,
  final_settlement_required INTEGER NOT NULL DEFAULT 1,
  final_settlement_status TEXT,
  access_disable_required INTEGER NOT NULL DEFAULT 1,
  access_disable_status TEXT,
  handover_required INTEGER NOT NULL DEFAULT 0,
  handover_status TEXT,
  offboarding_checklist_status TEXT,
  current_value_json TEXT,
  requested_value_json TEXT,
  employee_note TEXT,
  manager_note TEXT,
  owner_note TEXT,
  final_approver_note TEXT,
  execution_note TEXT,
  approval_request_id TEXT,
  approval_status TEXT,
  approval_current_step TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  operation_owner_department_id TEXT,
  operation_final_department_id TEXT,
  operation_execution_department_id TEXT,
  department_reviewed_at TEXT,
  department_reviewed_by TEXT,
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
  withdrawn_at TEXT,
  withdrawn_by TEXT,
  approval_submitted_at TEXT,
  approval_completed_at TEXT,
  applied_at TEXT,
  applied_by TEXT,
  completed_at TEXT,
  completed_by TEXT,
  apply_error_code TEXT,
  apply_error_message TEXT,
  execution_resolution_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  CHECK (level IS NULL OR level BETWEEN 1 AND 4),
  CHECK (status IN (
    'DRAFT','PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW',
    'PENDING_FINAL_APPROVAL','PENDING_CLEARANCE','PENDING_FINAL_SETTLEMENT',
    'PENDING_ACCESS_DISABLE','PENDING_APPLICATION','PENDING_MANUAL_REVIEW',
    'APPROVED','REJECTED','CANCELLED','WITHDRAWN','OFFBOARDING_IN_PROGRESS',
    'CLEARED','COMPLETED','APPLIED','FAILED_TO_APPLY'
  ))
);

CREATE TABLE IF NOT EXISTS employee_exit_status_history (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  exit_request_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_login_status TEXT,
  new_login_status TEXT,
  effective_at TEXT NOT NULL,
  changed_by TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE employee_offboarding_tasks ADD COLUMN exit_request_id TEXT;
ALTER TABLE employee_offboarding_tasks ADD COLUMN task_code TEXT;
ALTER TABLE employee_offboarding_tasks ADD COLUMN task_name TEXT;
ALTER TABLE employee_offboarding_tasks ADD COLUMN owner_responsibility_type TEXT;
ALTER TABLE employee_offboarding_tasks ADD COLUMN owner_department_id TEXT;
ALTER TABLE employee_offboarding_tasks ADD COLUMN owner_business_function_code TEXT;
ALTER TABLE employee_offboarding_tasks ADD COLUMN assigned_user_id TEXT;
ALTER TABLE employee_offboarding_tasks ADD COLUMN metadata_json TEXT;

CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_company ON employee_exit_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_employee ON employee_exit_requests(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_requester_employee ON employee_exit_requests(company_id, requester_employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_approval ON employee_exit_requests(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_status ON employee_exit_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_approval_status ON employee_exit_requests(company_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_type ON employee_exit_requests(company_id, request_type);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_operation ON employee_exit_requests(company_id, operation_type);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_department ON employee_exit_requests(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_outlet ON employee_exit_requests(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_requested_lwd ON employee_exit_requests(company_id, requested_last_working_date);
CREATE INDEX IF NOT EXISTS idx_employee_exit_requests_approved_lwd ON employee_exit_requests(company_id, approved_last_working_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_exit_one_active_approval
ON employee_exit_requests(company_id, approval_request_id)
WHERE approval_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_exit_pending_guard
ON employee_exit_requests(company_id, employee_id, operation_type, request_type)
WHERE status IN (
  'DRAFT','PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW',
  'PENDING_FINAL_APPROVAL','PENDING_CLEARANCE','PENDING_FINAL_SETTLEMENT',
  'PENDING_ACCESS_DISABLE','PENDING_APPLICATION','PENDING_MANUAL_REVIEW',
  'APPROVED','OFFBOARDING_IN_PROGRESS','CLEARED'
);

CREATE INDEX IF NOT EXISTS idx_employee_offboarding_tasks_exit_request ON employee_offboarding_tasks(company_id, exit_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_tasks_employee_status ON employee_offboarding_tasks(company_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_tasks_type ON employee_offboarding_tasks(company_id, task_type);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_tasks_owner_department ON employee_offboarding_tasks(company_id, owner_department_id);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_tasks_assigned_user ON employee_offboarding_tasks(company_id, assigned_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_offboarding_tasks_exit_code_once
ON employee_offboarding_tasks(company_id, exit_request_id, task_code)
WHERE exit_request_id IS NOT NULL AND task_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_exit_status_history_employee ON employee_exit_status_history(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_exit_status_history_request ON employee_exit_status_history(company_id, exit_request_id);

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_employee_lifecycle_resignations_view', 'employeeLifecycle.resignations.view', 'employee_lifecycle', 'view_resignations', 'View resignation requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_create', 'employeeLifecycle.resignations.create', 'employee_lifecycle', 'create_own_resignations', 'Create own resignation requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_create_for_others', 'employeeLifecycle.resignations.createForOthers', 'employee_lifecycle', 'create_resignations_for_others', 'Create resignation requests for other employees.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_review', 'employeeLifecycle.resignations.review', 'employee_lifecycle', 'review_resignations', 'Review resignation requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_final_approve', 'employeeLifecycle.resignations.finalApprove', 'employee_lifecycle', 'final_approve_resignations', 'Final approve resignation requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_reject', 'employeeLifecycle.resignations.reject', 'employee_lifecycle', 'reject_resignations', 'Reject resignation requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_cancel', 'employeeLifecycle.resignations.cancel', 'employee_lifecycle', 'cancel_own_resignations', 'Cancel or withdraw own resignation requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_cancel_any', 'employeeLifecycle.resignations.cancelAny', 'employee_lifecycle', 'cancel_any_resignations', 'Cancel resignation requests for other employees.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_resignations_apply', 'employeeLifecycle.resignations.apply', 'employee_lifecycle', 'apply_resignation_lifecycle', 'Apply final-approved resignation lifecycle updates.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_view', 'employeeLifecycle.offboarding.view', 'employee_lifecycle', 'view_offboarding', 'View offboarding requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_create', 'employeeLifecycle.offboarding.create', 'employee_lifecycle', 'create_own_offboarding', 'Create own offboarding requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_create_for_others', 'employeeLifecycle.offboarding.createForOthers', 'employee_lifecycle', 'create_offboarding_for_others', 'Create offboarding requests for other employees.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_review', 'employeeLifecycle.offboarding.review', 'employee_lifecycle', 'review_offboarding', 'Review offboarding requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_final_approve', 'employeeLifecycle.offboarding.finalApprove', 'employee_lifecycle', 'final_approve_offboarding', 'Final approve offboarding requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_reject', 'employeeLifecycle.offboarding.reject', 'employee_lifecycle', 'reject_offboarding', 'Reject offboarding requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_cancel', 'employeeLifecycle.offboarding.cancel', 'employee_lifecycle', 'cancel_own_offboarding', 'Cancel own offboarding requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_cancel_any', 'employeeLifecycle.offboarding.cancelAny', 'employee_lifecycle', 'cancel_any_offboarding', 'Cancel offboarding requests for other employees.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_manage', 'employeeLifecycle.offboarding.manage', 'employee_lifecycle', 'manage_offboarding', 'Manage offboarding checklist and lifecycle handoff.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_apply', 'employeeLifecycle.offboarding.apply', 'employee_lifecycle', 'apply_offboarding_lifecycle', 'Apply final-approved offboarding lifecycle updates.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_offboarding_complete', 'employeeLifecycle.offboarding.complete', 'employee_lifecycle', 'complete_offboarding', 'Complete approved offboarding after checklist clearance.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_tasks_manage', 'employeeLifecycle.tasks.manage', 'employee_lifecycle', 'manage_offboarding_tasks', 'Complete, waive, or reopen offboarding tasks.', '2026-01-01T00:00:00Z'),
  ('perm_employee_lifecycle_audit_view', 'employeeLifecycle.audit.view', 'employee_lifecycle', 'view_lifecycle_audit', 'View resignation and offboarding approval timelines and audit.', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO approval_workflows (
  id, company_id, code, name, description, operation_type, status, is_default,
  applies_to_department_id, applies_to_level_min, applies_to_level_max,
  created_at, updated_at, created_by, updated_by, archived_at
)
SELECT
  'workflow_resignation_default_' || c.id,
  c.id,
  'RESIGNATION_DEFAULT',
  'Resignation Default Workflow',
  'Operation Ownership driven resignation approval workflow.',
  'RESIGNATION',
  'ACTIVE',
  1,
  NULL,
  NULL,
  NULL,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  NULL,
  NULL,
  NULL
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows w
  WHERE w.company_id = c.id AND w.operation_type = 'RESIGNATION' AND w.is_default = 1 AND w.archived_at IS NULL
);

INSERT OR IGNORE INTO approval_workflows (
  id, company_id, code, name, description, operation_type, status, is_default,
  applies_to_department_id, applies_to_level_min, applies_to_level_max,
  created_at, updated_at, created_by, updated_by, archived_at
)
SELECT
  'workflow_offboarding_default_' || c.id,
  c.id,
  'OFFBOARDING_DEFAULT',
  'Offboarding Default Workflow',
  'Operation Ownership driven offboarding approval workflow.',
  'OFFBOARDING',
  'ACTIVE',
  1,
  NULL,
  NULL,
  NULL,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  NULL,
  NULL,
  NULL
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows w
  WHERE w.company_id = c.id AND w.operation_type = 'OFFBOARDING' AND w.is_default = 1 AND w.archived_at IS NULL
);

INSERT OR IGNORE INTO approval_workflow_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, required_role_id, required_department_id, required_min_level,
  required_max_level, specific_user_id, is_final_step, all_approvers_required,
  min_approvals_required, allow_self_approval, fallback_behavior, is_active,
  created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_step_department_review_' || w.id,
  w.company_id,
  w.id,
  1,
  'DEPARTMENT_REVIEW',
  'Department Review',
  'OPERATION_OWNER',
  CASE WHEN w.operation_type = 'RESIGNATION' THEN 'employeeLifecycle.resignations.review' ELSE 'employeeLifecycle.offboarding.review' END,
  NULL,
  NULL,
  3,
  4,
  NULL,
  0,
  0,
  1,
  0,
  'SKIP_OPTIONAL_STEP',
  1,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  NULL,
  NULL
FROM approval_workflows w
WHERE w.operation_type IN ('RESIGNATION', 'OFFBOARDING')
  AND NOT EXISTS (
    SELECT 1 FROM approval_workflow_steps s
    WHERE s.company_id = w.company_id AND s.workflow_id = w.id AND s.step_order = 1
  );

INSERT OR IGNORE INTO approval_workflow_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, required_role_id, required_department_id, required_min_level,
  required_max_level, specific_user_id, is_final_step, all_approvers_required,
  min_approvals_required, allow_self_approval, fallback_behavior, is_active,
  created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_step_lifecycle_final_approval_' || w.id,
  w.company_id,
  w.id,
  2,
  'OPERATION_FINAL_APPROVAL',
  'Operation Final Approval',
  'OPERATION_FINAL_APPROVER',
  CASE WHEN w.operation_type = 'RESIGNATION' THEN 'employeeLifecycle.resignations.finalApprove' ELSE 'employeeLifecycle.offboarding.finalApprove' END,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  1,
  0,
  1,
  0,
  'HOLD_FOR_MANUAL_ASSIGNMENT',
  1,
  '2026-01-01T00:00:00Z',
  '2026-01-01T00:00:00Z',
  NULL,
  NULL
FROM approval_workflows w
WHERE w.operation_type IN ('RESIGNATION', 'OFFBOARDING')
  AND NOT EXISTS (
    SELECT 1 FROM approval_workflow_steps s
    WHERE s.company_id = w.company_id AND s.workflow_id = w.id AND s.step_order = 2
  );
