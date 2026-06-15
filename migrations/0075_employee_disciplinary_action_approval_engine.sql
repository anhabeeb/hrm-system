-- Disciplinary Action approval engine integration.
-- Additive only: no legacy employee notes or records are migrated/applied by this migration.

CREATE TABLE IF NOT EXISTS employee_disciplinary_action_requests (
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
  action_type TEXT,
  operation_type TEXT NOT NULL DEFAULT 'DISCIPLINARY_ACTION',
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  incident_date TEXT,
  reported_date TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT NOT NULL,
  policy_reference TEXT,
  requested_action_json TEXT,
  evidence_summary TEXT,
  evidence_attachment_id TEXT,
  employee_response TEXT,
  employee_response_at TEXT,
  acknowledgement_required INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  acknowledgement_note TEXT,
  follow_up_required INTEGER NOT NULL DEFAULT 0,
  follow_up_status TEXT,
  follow_up_json TEXT,
  payroll_follow_up_required INTEGER NOT NULL DEFAULT 0,
  offboarding_follow_up_required INTEGER NOT NULL DEFAULT 0,
  training_follow_up_required INTEGER NOT NULL DEFAULT 0,
  current_value_json TEXT,
  requested_value_json TEXT,
  employee_note TEXT,
  manager_note TEXT,
  investigator_note TEXT,
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
  approval_submitted_at TEXT,
  approval_completed_at TEXT,
  applied_at TEXT,
  applied_by TEXT,
  closed_at TEXT,
  closed_by TEXT,
  apply_error_code TEXT,
  apply_error_message TEXT,
  execution_resolution_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT,
  CHECK (level IS NULL OR level BETWEEN 1 AND 4),
  CHECK (operation_type = 'DISCIPLINARY_ACTION'),
  CHECK (status IN (
    'DRAFT','PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW',
    'PENDING_INVESTIGATION','PENDING_FINAL_APPROVAL','PENDING_APPLICATION',
    'PENDING_ACKNOWLEDGEMENT','PENDING_FOLLOW_UP','PENDING_MANUAL_REVIEW',
    'APPROVED','REJECTED','CANCELLED','APPLIED','ACKNOWLEDGED','CLOSED','FAILED_TO_APPLY'
  ))
);

CREATE TABLE IF NOT EXISTS employee_disciplinary_action_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  disciplinary_action_request_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  file_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_disciplinary_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  source_request_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  incident_date TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  outcome TEXT,
  policy_reference TEXT,
  effective_date TEXT,
  expiry_date TEXT,
  acknowledgement_required INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  applied_at TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK (status IN ('ACTIVE','ACKNOWLEDGED','EXPIRED','ARCHIVED','SUPERSEDED'))
);

CREATE TABLE IF NOT EXISTS employee_disciplinary_follow_up_tasks (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  disciplinary_action_request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_name TEXT NOT NULL,
  owner_responsibility_type TEXT,
  owner_department_id TEXT,
  owner_business_function_code TEXT,
  assigned_user_id TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  due_date TEXT,
  completed_at TEXT,
  completed_by TEXT,
  notes TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','WAIVED','BLOCKED','FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_company ON employee_disciplinary_action_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_employee ON employee_disciplinary_action_requests(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_requester_employee ON employee_disciplinary_action_requests(company_id, requester_employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_approval ON employee_disciplinary_action_requests(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_status ON employee_disciplinary_action_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_approval_status ON employee_disciplinary_action_requests(company_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_type ON employee_disciplinary_action_requests(company_id, request_type);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_action_type ON employee_disciplinary_action_requests(company_id, action_type);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_severity ON employee_disciplinary_action_requests(company_id, severity);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_department ON employee_disciplinary_action_requests(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_outlet ON employee_disciplinary_action_requests(company_id, outlet_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_requests_incident_date ON employee_disciplinary_action_requests(company_id, incident_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_discipline_one_active_approval
ON employee_disciplinary_action_requests(company_id, approval_request_id)
WHERE approval_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_discipline_active_guard
ON employee_disciplinary_action_requests(company_id, employee_id, request_type, COALESCE(incident_date, ''), title)
WHERE status IN ('DRAFT','PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW','PENDING_INVESTIGATION','PENDING_FINAL_APPROVAL','PENDING_APPLICATION','PENDING_ACKNOWLEDGEMENT','PENDING_FOLLOW_UP','PENDING_MANUAL_REVIEW','APPROVED','APPLIED','ACKNOWLEDGED');

CREATE INDEX IF NOT EXISTS idx_employee_discipline_items_request ON employee_disciplinary_action_items(company_id, disciplinary_action_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_records_employee ON employee_disciplinary_records(company_id, employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_discipline_record_once ON employee_disciplinary_records(company_id, source_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_records_action ON employee_disciplinary_records(company_id, action_type);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_records_status ON employee_disciplinary_records(company_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_tasks_request ON employee_disciplinary_follow_up_tasks(company_id, disciplinary_action_request_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_tasks_employee ON employee_disciplinary_follow_up_tasks(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_tasks_status ON employee_disciplinary_follow_up_tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_tasks_type ON employee_disciplinary_follow_up_tasks(company_id, task_type);
CREATE INDEX IF NOT EXISTS idx_employee_discipline_tasks_owner_department ON employee_disciplinary_follow_up_tasks(company_id, owner_department_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_discipline_task_once
ON employee_disciplinary_follow_up_tasks(company_id, disciplinary_action_request_id, task_type);

INSERT OR IGNORE INTO permissions (id, permission_key, module, action, description, created_at) VALUES
  ('perm_employee_discipline_actions_view', 'employeeDiscipline.actions.view', 'employee_discipline', 'actions_view', 'View disciplinary action requests when row-level access allows.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_view_own', 'employeeDiscipline.actions.viewOwn', 'employee_discipline', 'actions_view_own', 'View own disciplinary records and requests when policy allows.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_create', 'employeeDiscipline.actions.create', 'employee_discipline', 'actions_create', 'Create own disciplinary reports when policy allows.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_create_for_others', 'employeeDiscipline.actions.createForOthers', 'employee_discipline', 'actions_create_for_others', 'Create disciplinary action requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_review', 'employeeDiscipline.actions.review', 'employee_discipline', 'actions_review', 'Review disciplinary action requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_investigate', 'employeeDiscipline.actions.investigate', 'employee_discipline', 'actions_investigate', 'Investigate disciplinary action requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_final_approve', 'employeeDiscipline.actions.finalApprove', 'employee_discipline', 'actions_final_approve', 'Final approve disciplinary action requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_reject', 'employeeDiscipline.actions.reject', 'employee_discipline', 'actions_reject', 'Reject disciplinary action requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_cancel', 'employeeDiscipline.actions.cancel', 'employee_discipline', 'actions_cancel', 'Cancel own disciplinary action requests.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_cancel_any', 'employeeDiscipline.actions.cancelAny', 'employee_discipline', 'actions_cancel_any', 'Cancel disciplinary action requests for another employee.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_apply', 'employeeDiscipline.actions.apply', 'employee_discipline', 'actions_apply', 'Apply final-approved disciplinary outcomes.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_manage', 'employeeDiscipline.actions.manage', 'employee_discipline', 'actions_manage', 'Manage disciplinary action lifecycle and follow-ups.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_actions_sensitive_manage', 'employeeDiscipline.actions.sensitive.manage', 'employee_discipline', 'actions_sensitive_manage', 'Manage sensitive disciplinary outcomes and investigation details.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_records_view', 'employeeDiscipline.records.view', 'employee_discipline', 'records_view', 'View official disciplinary records when row-level access allows.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_tasks_view', 'employeeDiscipline.tasks.view', 'employee_discipline', 'tasks_view', 'View assigned disciplinary follow-up tasks.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_tasks_complete', 'employeeDiscipline.tasks.complete', 'employee_discipline', 'tasks_complete', 'Complete assigned disciplinary follow-up tasks.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_tasks_waive', 'employeeDiscipline.tasks.waive', 'employee_discipline', 'tasks_waive', 'Waive assigned disciplinary follow-up tasks with reason.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_acknowledge', 'employeeDiscipline.acknowledge', 'employee_discipline', 'acknowledge', 'Acknowledge own disciplinary action records.', '2026-01-01T00:00:00Z'),
  ('perm_employee_discipline_audit_view', 'employeeDiscipline.audit.view', 'employee_discipline', 'audit_view', 'View disciplinary action approval timeline and audit.', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_employee_discipline_self_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'employeeDiscipline.actions.viewOwn',
  'employeeDiscipline.acknowledge'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('employee', 'staff', 'supervisor', 'outlet_manager', 'hr_officer', 'hr_admin', 'admin', 'owner', 'super_admin');

INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
SELECT 'rp_employee_discipline_manage_' || roles.role_key || '_' || replace(permission_key, '.', '_'), 'company_seed_default', roles.id, permission_key, '2026-01-01T00:00:00Z'
FROM roles
JOIN permissions ON permission_key IN (
  'employeeDiscipline.actions.view',
  'employeeDiscipline.actions.create',
  'employeeDiscipline.actions.createForOthers',
  'employeeDiscipline.actions.review',
  'employeeDiscipline.actions.investigate',
  'employeeDiscipline.actions.finalApprove',
  'employeeDiscipline.actions.reject',
  'employeeDiscipline.actions.cancel',
  'employeeDiscipline.actions.cancelAny',
  'employeeDiscipline.actions.apply',
  'employeeDiscipline.actions.manage',
  'employeeDiscipline.records.view',
  'employeeDiscipline.tasks.view',
  'employeeDiscipline.tasks.complete',
  'employeeDiscipline.tasks.waive',
  'employeeDiscipline.audit.view'
)
WHERE roles.company_id = 'company_seed_default'
  AND roles.role_key IN ('hr_officer', 'hr_admin', 'admin', 'owner', 'super_admin');

INSERT OR IGNORE INTO approval_workflows (
  id, company_id, code, name, description, operation_type, status, is_default,
  applies_to_department_id, applies_to_level_min, applies_to_level_max,
  created_at, updated_at, created_by, updated_by, archived_at
)
SELECT
  'workflow_disciplinary_action_default_' || c.id,
  c.id,
  'DISCIPLINARY_ACTION_DEFAULT',
  'Disciplinary Action Default Workflow',
  'Operation Ownership driven disciplinary action approval workflow.',
  'DISCIPLINARY_ACTION',
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
  WHERE w.company_id = c.id AND w.operation_type = 'DISCIPLINARY_ACTION' AND w.is_default = 1 AND w.archived_at IS NULL
);

INSERT OR IGNORE INTO approval_workflow_steps (
  id, company_id, workflow_id, step_order, step_code, step_name,
  approver_resolver_type, required_permission, required_role_id, required_department_id,
  required_min_level, required_max_level, specific_user_id, is_final_step,
  all_approvers_required, min_approvals_required, allow_self_approval,
  fallback_behavior, is_active, created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_step_disciplinary_department_' || c.id,
  c.id,
  'workflow_disciplinary_action_default_' || c.id,
  1,
  'DEPARTMENT_REVIEW',
  'Department Review',
  'OPERATION_OWNER',
  'employeeDiscipline.actions.review',
  NULL,
  NULL,
  3,
  4,
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
FROM companies c;

INSERT OR IGNORE INTO approval_workflow_steps (
  id, company_id, workflow_id, step_order, step_code, step_name,
  approver_resolver_type, required_permission, required_role_id, required_department_id,
  required_min_level, required_max_level, specific_user_id, is_final_step,
  all_approvers_required, min_approvals_required, allow_self_approval,
  fallback_behavior, is_active, created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_step_disciplinary_owner_' || c.id,
  c.id,
  'workflow_disciplinary_action_default_' || c.id,
  2,
  'OPERATION_OWNER_REVIEW',
  'Operation Owner Review',
  'OPERATION_OWNER',
  'employeeDiscipline.actions.investigate',
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
FROM companies c;

INSERT OR IGNORE INTO approval_workflow_steps (
  id, company_id, workflow_id, step_order, step_code, step_name,
  approver_resolver_type, required_permission, required_role_id, required_department_id,
  required_min_level, required_max_level, specific_user_id, is_final_step,
  all_approvers_required, min_approvals_required, allow_self_approval,
  fallback_behavior, is_active, created_at, updated_at, created_by, updated_by
)
SELECT
  'workflow_step_disciplinary_final_' || c.id,
  c.id,
  'workflow_disciplinary_action_default_' || c.id,
  3,
  'OPERATION_FINAL_APPROVAL',
  'Operation Final Approval',
  'OPERATION_FINAL_APPROVER',
  'employeeDiscipline.actions.finalApprove',
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
FROM companies c;
