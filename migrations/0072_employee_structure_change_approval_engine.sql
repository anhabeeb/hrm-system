CREATE TABLE IF NOT EXISTS employee_structure_change_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  requester_employee_id TEXT,
  requester_user_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('EMPLOYEE_TRANSFER', 'EMPLOYEE_STRUCTURE_CHANGE')),
  request_type TEXT NOT NULL,
  current_department_id TEXT,
  current_position_id TEXT,
  current_level INTEGER,
  current_outlet_id TEXT,
  current_store_id TEXT,
  current_manager_employee_id TEXT,
  requested_department_id TEXT,
  requested_position_id TEXT,
  requested_level INTEGER,
  requested_outlet_id TEXT,
  requested_store_id TEXT,
  requested_reporting_manager_employee_id TEXT,
  requested_department_head_employee_id TEXT,
  role_template_action TEXT,
  apply_role_template INTEGER NOT NULL DEFAULT 0,
  remove_old_template_roles INTEGER NOT NULL DEFAULT 0,
  preserve_custom_roles INTEGER NOT NULL DEFAULT 1,
  effective_date TEXT,
  reason TEXT NOT NULL,
  employee_note TEXT,
  manager_note TEXT,
  owner_note TEXT,
  final_approver_note TEXT,
  execution_note TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  approval_request_id TEXT,
  approval_status TEXT,
  approval_current_step TEXT,
  approval_submitted_at TEXT,
  approval_completed_at TEXT,
  owner_reviewed_at TEXT,
  owner_reviewed_by TEXT,
  current_department_reviewed_at TEXT,
  current_department_reviewed_by TEXT,
  target_department_reviewed_at TEXT,
  target_department_reviewed_by TEXT,
  final_approved_at TEXT,
  final_approved_by TEXT,
  operation_owner_department_id TEXT,
  operation_final_department_id TEXT,
  operation_execution_department_id TEXT,
  applied_at TEXT,
  applied_by TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  apply_error_code TEXT,
  apply_error_message TEXT,
  execution_resolution_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id)
);

CREATE TABLE IF NOT EXISTS employee_structure_change_request_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  previous_value TEXT,
  requested_value TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES employee_structure_change_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_company ON employee_structure_change_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_employee ON employee_structure_change_requests(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_status ON employee_structure_change_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_approval ON employee_structure_change_requests(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_operation ON employee_structure_change_requests(company_id, operation_type);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_requested_department ON employee_structure_change_requests(company_id, requested_department_id);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_current_department ON employee_structure_change_requests(company_id, current_department_id);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_effective_date ON employee_structure_change_requests(company_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_current_outlet ON employee_structure_change_requests(company_id, current_outlet_id);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_requests_requested_outlet ON employee_structure_change_requests(company_id, requested_outlet_id);
CREATE INDEX IF NOT EXISTS idx_employee_structure_change_items_request ON employee_structure_change_request_items(company_id, request_id);

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_employees_structure_requests_view', 'employees.structureRequests.view', 'employee_management', 'view_structure_change_requests', 'View employee transfer and structure change requests.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_create', 'employees.structureRequests.create', 'employee_management', 'create_structure_change_requests', 'Create own employee transfer and structure change requests.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_create_for_others', 'employees.structureRequests.createForOthers', 'employee_management', 'create_structure_change_requests_for_others', 'Create employee transfer and structure change requests for other employees.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_review', 'employees.structureRequests.review', 'employee_management', 'review_structure_change_requests', 'Review employee transfer and structure change requests.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_final_approve', 'employees.structureRequests.finalApprove', 'employee_management', 'final_approve_structure_change_requests', 'Final approve employee transfer and structure change requests.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_reject', 'employees.structureRequests.reject', 'employee_management', 'reject_structure_change_requests', 'Reject employee transfer and structure change requests.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_cancel', 'employees.structureRequests.cancel', 'employee_management', 'cancel_own_structure_change_requests', 'Cancel own employee transfer and structure change requests.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_cancel_any', 'employees.structureRequests.cancelAny', 'employee_management', 'cancel_any_structure_change_requests', 'Cancel employee transfer and structure change requests for other employees.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_apply', 'employees.structureRequests.apply', 'employee_management', 'apply_structure_change_requests', 'Apply final-approved employee transfer and structure changes.', '2026-01-01T00:00:00Z'),
  ('perm_employees_structure_requests_audit_view', 'employees.structureRequests.audit.view', 'employee_management', 'view_structure_change_request_audit', 'View employee transfer and structure change request timelines.', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO approval_workflows (
  id, company_id, code, name, description, operation_type, status, is_default,
  applies_to_department_id, applies_to_level_min, applies_to_level_max,
  created_at, updated_at, created_by, updated_by, archived_at
)
SELECT
  'workflow_employee_transfer_default_' || c.id,
  c.id,
  'EMPLOYEE_TRANSFER_DEFAULT',
  'Employee Transfer Default Workflow',
  'Default operation-owner and final approval flow for employee transfer requests.',
  'EMPLOYEE_TRANSFER',
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
  WHERE w.company_id = c.id AND w.operation_type = 'EMPLOYEE_TRANSFER' AND w.is_default = 1 AND w.archived_at IS NULL
);

INSERT OR IGNORE INTO approval_workflows (
  id, company_id, code, name, description, operation_type, status, is_default,
  applies_to_department_id, applies_to_level_min, applies_to_level_max,
  created_at, updated_at, created_by, updated_by, archived_at
)
SELECT
  'workflow_employee_structure_change_default_' || c.id,
  c.id,
  'EMPLOYEE_STRUCTURE_CHANGE_DEFAULT',
  'Employee Structure Change Default Workflow',
  'Default operation-owner and final approval flow for employee structure changes.',
  'EMPLOYEE_STRUCTURE_CHANGE',
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
  WHERE w.company_id = c.id AND w.operation_type = 'EMPLOYEE_STRUCTURE_CHANGE' AND w.is_default = 1 AND w.archived_at IS NULL
);

INSERT OR IGNORE INTO approval_workflow_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, required_role_id, required_department_id, required_min_level,
  required_max_level, specific_user_id, is_final_step, all_approvers_required,
  min_approvals_required, allow_self_approval, fallback_behavior, is_active,
  created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_step_owner_review_' || w.id,
  w.company_id,
  w.id,
  1,
  'OPERATION_OWNER_REVIEW',
  'Operation owner review',
  'OPERATION_OWNER',
  'approvals.operationOwner.approve',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  0,
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
WHERE w.operation_type IN ('EMPLOYEE_TRANSFER', 'EMPLOYEE_STRUCTURE_CHANGE')
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
  'workflow_step_final_approval_' || w.id,
  w.company_id,
  w.id,
  2,
  'OPERATION_FINAL_APPROVAL',
  'Operation final approval',
  'OPERATION_FINAL_APPROVER',
  'approvals.operationFinal.approve',
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
WHERE w.operation_type IN ('EMPLOYEE_TRANSFER', 'EMPLOYEE_STRUCTURE_CHANGE')
  AND NOT EXISTS (
    SELECT 1 FROM approval_workflow_steps s
    WHERE s.company_id = w.company_id AND s.workflow_id = w.id AND s.step_order = 2
  );
