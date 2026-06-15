-- Repair missing General Approval Workflow Engine foundation objects before
-- later module migrations seed operation-specific workflow steps.
--
-- This migration is intentionally additive and production-safe:
-- - no DROP/DELETE statements
-- - no row overwrites
-- - no automatic approval/application side effects
-- - IF NOT EXISTS guards for tables, indexes, and compatibility triggers

CREATE TABLE IF NOT EXISTS approval_workflows (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workflow_key TEXT,
  workflow_name TEXT,
  module TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  approval_mode TEXT NOT NULL DEFAULT 'SEQUENTIAL',
  code TEXT,
  name TEXT,
  description TEXT,
  operation_type TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  is_default INTEGER NOT NULL DEFAULT 0,
  applies_to_department_id TEXT,
  applies_to_level_min INTEGER,
  applies_to_level_max INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_code TEXT,
  step_name TEXT NOT NULL,
  approver_resolver_type TEXT NOT NULL DEFAULT 'ROLE_PERMISSION',
  required_permission TEXT,
  required_role_id TEXT,
  required_department_id TEXT,
  required_min_level INTEGER,
  required_max_level INTEGER,
  specific_user_id TEXT,
  is_final_step INTEGER NOT NULL DEFAULT 0,
  all_approvers_required INTEGER NOT NULL DEFAULT 0,
  min_approvals_required INTEGER NOT NULL DEFAULT 1,
  allow_self_approval INTEGER NOT NULL DEFAULT 0,
  fallback_behavior TEXT NOT NULL DEFAULT 'SKIP_TO_HR',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  workflow_id TEXT,
  module TEXT,
  entity_type TEXT,
  entity_id TEXT,
  employee_id TEXT,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  current_step INTEGER DEFAULT 1,
  summary TEXT,
  payload_json TEXT,
  operation_type TEXT,
  subject_type TEXT,
  subject_id TEXT,
  requester_employee_id TEXT,
  requester_user_id TEXT,
  subject_employee_id TEXT,
  department_id TEXT,
  position_id TEXT,
  level INTEGER,
  title TEXT,
  current_step_id TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  cancelled_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

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

CREATE TABLE IF NOT EXISTS approval_actions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL,
  approval_request_step_id TEXT,
  step_order INTEGER,
  action TEXT NOT NULL,
  acted_by TEXT,
  actor_user_id TEXT,
  actor_employee_id TEXT,
  from_status TEXT,
  to_status TEXT,
  comment TEXT,
  reason TEXT,
  metadata_json TEXT,
  old_status TEXT,
  new_status TEXT,
  created_at TEXT NOT NULL
);

-- Backfill the new workflow-step table from legacy approval_steps where present.
INSERT OR IGNORE INTO approval_workflow_steps (
  id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
  required_permission, required_role_id, required_department_id, required_min_level,
  required_max_level, specific_user_id, is_final_step, all_approvers_required,
  min_approvals_required, allow_self_approval, fallback_behavior, is_active,
  created_at, updated_at, created_by, updated_by
)
SELECT
  s.id,
  s.company_id,
  s.workflow_id,
  s.step_order,
  s.step_code,
  s.step_name,
  COALESCE(s.approver_resolver_type, 'ROLE_PERMISSION'),
  COALESCE(s.required_permission, s.required_permission_key),
  s.required_role_id,
  s.required_department_id,
  s.required_min_level,
  s.required_max_level,
  s.specific_user_id,
  COALESCE(s.is_final_step, 0),
  COALESCE(s.all_approvers_required, 0),
  COALESCE(s.min_approvals_required, 1),
  COALESCE(s.allow_self_approval, 0),
  COALESCE(s.fallback_behavior, 'SKIP_TO_HR'),
  COALESCE(s.is_active, 1),
  s.created_at,
  s.updated_at,
  s.created_by,
  s.updated_by
FROM approval_steps s
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflow_steps aws
  WHERE aws.company_id = s.company_id AND aws.workflow_id = s.workflow_id AND aws.step_order = s.step_order
);

-- Later migrations seed operation defaults into approval_workflow_steps. The
-- current repository still reads approval_steps, so mirror new inserts without
-- overwriting any existing legacy step rows.
CREATE TRIGGER IF NOT EXISTS trg_approval_workflow_steps_mirror_insert
AFTER INSERT ON approval_workflow_steps
BEGIN
  INSERT INTO approval_steps (
    id, company_id, workflow_id, step_order, step_name,
    required_role_key, required_permission_key, is_required, approval_type,
    amount_min, amount_max, created_at, updated_at, step_code,
    approver_resolver_type, required_permission, required_role_id,
    required_department_id, required_min_level, required_max_level,
    specific_user_id, is_final_step, all_approvers_required,
    min_approvals_required, allow_self_approval, fallback_behavior,
    is_active, created_by, updated_by
  )
  SELECT
    NEW.id, NEW.company_id, NEW.workflow_id, NEW.step_order, NEW.step_name,
    NEW.required_role_id, NEW.required_permission, 1, 'single',
    NULL, NULL, NEW.created_at, NEW.updated_at, NEW.step_code,
    NEW.approver_resolver_type, NEW.required_permission, NEW.required_role_id,
    NEW.required_department_id, NEW.required_min_level, NEW.required_max_level,
    NEW.specific_user_id, NEW.is_final_step, NEW.all_approvers_required,
    NEW.min_approvals_required, NEW.allow_self_approval, NEW.fallback_behavior,
    NEW.is_active, NEW.created_by, NEW.updated_by
  WHERE NOT EXISTS (
    SELECT 1 FROM approval_steps s
    WHERE s.company_id = NEW.company_id AND s.workflow_id = NEW.workflow_id AND s.step_order = NEW.step_order
  );
END;

CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_company_workflow_table
  ON approval_workflow_steps(company_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_workflow_order_table
  ON approval_workflow_steps(company_id, workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_company_active
  ON approval_workflow_steps(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_code_repair
  ON approval_workflows(company_id, code);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_operation_repair
  ON approval_workflows(company_id, operation_type);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_company_status_repair
  ON approval_workflows(company_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_operation_repair
  ON approval_requests(company_id, operation_type);
CREATE INDEX IF NOT EXISTS idx_approval_requests_company_status_repair
  ON approval_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_company_request_repair
  ON approval_request_steps(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_approval_request_steps_company_status_repair
  ON approval_request_steps(company_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_actions_company_request_repair
  ON approval_actions(company_id, approval_request_id);
CREATE INDEX IF NOT EXISTS idx_approval_actions_company_actor_user_repair
  ON approval_actions(company_id, actor_user_id);
