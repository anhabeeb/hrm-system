-- General approval workflow engine foundation.
-- Existing approval_* tables are extended additively so legacy leave/salary approval
-- flows keep working while the reusable engine can snapshot richer workflow rules.

ALTER TABLE approval_workflows ADD COLUMN code TEXT;
ALTER TABLE approval_workflows ADD COLUMN name TEXT;
ALTER TABLE approval_workflows ADD COLUMN description TEXT;
ALTER TABLE approval_workflows ADD COLUMN operation_type TEXT;
ALTER TABLE approval_workflows ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE approval_workflows ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
ALTER TABLE approval_workflows ADD COLUMN applies_to_department_id TEXT;
ALTER TABLE approval_workflows ADD COLUMN applies_to_level_min INTEGER;
ALTER TABLE approval_workflows ADD COLUMN applies_to_level_max INTEGER;
ALTER TABLE approval_workflows ADD COLUMN created_by TEXT;
ALTER TABLE approval_workflows ADD COLUMN updated_by TEXT;
ALTER TABLE approval_workflows ADD COLUMN archived_at TEXT;

UPDATE approval_workflows
   SET code = COALESCE(code, workflow_key),
       name = COALESCE(name, workflow_name),
       operation_type = COALESCE(operation_type, UPPER(module)),
       status = CASE WHEN is_enabled = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END
 WHERE code IS NULL OR name IS NULL OR operation_type IS NULL;

ALTER TABLE approval_steps ADD COLUMN step_code TEXT;
ALTER TABLE approval_steps ADD COLUMN approver_resolver_type TEXT NOT NULL DEFAULT 'ROLE_PERMISSION';
ALTER TABLE approval_steps ADD COLUMN required_permission TEXT;
ALTER TABLE approval_steps ADD COLUMN required_role_id TEXT;
ALTER TABLE approval_steps ADD COLUMN required_department_id TEXT;
ALTER TABLE approval_steps ADD COLUMN required_min_level INTEGER;
ALTER TABLE approval_steps ADD COLUMN required_max_level INTEGER;
ALTER TABLE approval_steps ADD COLUMN specific_user_id TEXT;
ALTER TABLE approval_steps ADD COLUMN is_final_step INTEGER NOT NULL DEFAULT 0;
ALTER TABLE approval_steps ADD COLUMN all_approvers_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE approval_steps ADD COLUMN min_approvals_required INTEGER NOT NULL DEFAULT 1;
ALTER TABLE approval_steps ADD COLUMN allow_self_approval INTEGER NOT NULL DEFAULT 0;
ALTER TABLE approval_steps ADD COLUMN fallback_behavior TEXT NOT NULL DEFAULT 'SKIP_TO_HR';
ALTER TABLE approval_steps ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE approval_steps ADD COLUMN created_by TEXT;
ALTER TABLE approval_steps ADD COLUMN updated_by TEXT;

UPDATE approval_steps
   SET step_code = COALESCE(step_code, lower(replace(step_name, ' ', '_'))),
       required_permission = COALESCE(required_permission, required_permission_key)
 WHERE step_code IS NULL OR required_permission IS NULL;

ALTER TABLE approval_requests ADD COLUMN operation_type TEXT;
ALTER TABLE approval_requests ADD COLUMN subject_type TEXT;
ALTER TABLE approval_requests ADD COLUMN subject_id TEXT;
ALTER TABLE approval_requests ADD COLUMN requester_employee_id TEXT;
ALTER TABLE approval_requests ADD COLUMN requester_user_id TEXT;
ALTER TABLE approval_requests ADD COLUMN subject_employee_id TEXT;
ALTER TABLE approval_requests ADD COLUMN department_id TEXT;
ALTER TABLE approval_requests ADD COLUMN position_id TEXT;
ALTER TABLE approval_requests ADD COLUMN level INTEGER;
ALTER TABLE approval_requests ADD COLUMN title TEXT;
ALTER TABLE approval_requests ADD COLUMN submitted_at TEXT;
ALTER TABLE approval_requests ADD COLUMN approved_at TEXT;
ALTER TABLE approval_requests ADD COLUMN rejected_at TEXT;
ALTER TABLE approval_requests ADD COLUMN cancelled_at TEXT;
ALTER TABLE approval_requests ADD COLUMN completed_at TEXT;
ALTER TABLE approval_requests ADD COLUMN created_by TEXT;
ALTER TABLE approval_requests ADD COLUMN updated_by TEXT;

UPDATE approval_requests
   SET operation_type = COALESCE(operation_type, UPPER(module)),
       subject_type = COALESCE(subject_type, entity_type),
       subject_id = COALESCE(subject_id, entity_id),
       requester_user_id = COALESCE(requester_user_id, requested_by),
       subject_employee_id = COALESCE(subject_employee_id, employee_id),
       title = COALESCE(title, summary, entity_type || ' approval')
 WHERE operation_type IS NULL OR subject_type IS NULL OR subject_id IS NULL OR requester_user_id IS NULL OR title IS NULL;

CREATE TABLE IF NOT EXISTS approval_request_steps (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL,
  workflow_step_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_code TEXT,
  step_name TEXT NOT NULL,
  approver_resolver_type TEXT NOT NULL,
  assigned_approver_user_id TEXT,
  assigned_approver_employee_id TEXT,
  assigned_department_id TEXT,
  required_permission TEXT,
  required_role_id TEXT,
  required_min_level INTEGER,
  required_max_level INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING',
  fallback_applied TEXT,
  resolved_at TEXT,
  due_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  skipped_at TEXT,
  escalated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_request_participants (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL,
  user_id TEXT,
  employee_id TEXT,
  participant_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE approval_actions ADD COLUMN approval_request_step_id TEXT;
ALTER TABLE approval_actions ADD COLUMN actor_user_id TEXT;
ALTER TABLE approval_actions ADD COLUMN actor_employee_id TEXT;
ALTER TABLE approval_actions ADD COLUMN from_status TEXT;
ALTER TABLE approval_actions ADD COLUMN to_status TEXT;
ALTER TABLE approval_actions ADD COLUMN reason TEXT;
ALTER TABLE approval_actions ADD COLUMN metadata_json TEXT;

UPDATE approval_actions
   SET actor_user_id = COALESCE(actor_user_id, acted_by),
       from_status = COALESCE(from_status, old_status),
       to_status = COALESCE(to_status, new_status)
 WHERE actor_user_id IS NULL OR from_status IS NULL OR to_status IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_workflows_company_code
  ON approval_workflows(company_id, code)
  WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_workflows_default_active
  ON approval_workflows(company_id, operation_type, COALESCE(applies_to_department_id, ''))
  WHERE status = 'ACTIVE' AND is_default = 1 AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_operation ON approval_workflows(company_id, operation_type);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_status ON approval_workflows(company_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_company_workflow ON approval_steps(company_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_workflow_order ON approval_steps(company_id, workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_operation ON approval_requests(company_id, operation_type);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status ON approval_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_requester_employee ON approval_requests(company_id, requester_employee_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_requester_user ON approval_requests(company_id, requester_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_subject_employee ON approval_requests(company_id, subject_employee_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_department ON approval_requests(company_id, department_id);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_company_request ON approval_request_steps(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_company_status ON approval_request_steps(company_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_company_user ON approval_request_steps(company_id, assigned_approver_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_company_employee ON approval_request_steps(company_id, assigned_approver_employee_id);
CREATE INDEX IF NOT EXISTS idx_approval_actions_company_request ON approval_actions(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_approval_actions_company_actor_user ON approval_actions(company_id, actor_user_id);
