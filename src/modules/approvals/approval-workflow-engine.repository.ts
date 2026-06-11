import type {
  ApprovalActionEngineRecord,
  ApprovalEngineFilters,
  ApprovalEmployeeContext,
  ApprovalRequestEngineRecord,
  ApprovalRequestInput,
  ApprovalRequestStepEngineRecord,
  ApprovalResolverCandidate,
  ApprovalWorkflowEngineRecord,
  ApprovalWorkflowInput,
  ApprovalWorkflowStepEngineRecord,
  ApprovalWorkflowStepInput,
} from "./approval-workflow-engine.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();
const nowIso = () => new Date().toISOString();

const pagination = (filters: Pick<ApprovalEngineFilters, "page" | "page_size">) => [
  filters.page_size,
  (filters.page - 1) * filters.page_size,
];

const workflowWhere = (companyId: string, filters: ApprovalEngineFilters) => {
  const clauses = ["w.company_id = ?", "COALESCE(w.archived_at, '') = ''"];
  const values: unknown[] = [companyId];
  if (filters.operation_type) {
    clauses.push("w.operation_type = ?");
    values.push(filters.operation_type);
  }
  if (filters.status) {
    clauses.push("w.status = ?");
    values.push(filters.status);
  }
  if (filters.department_id) {
    clauses.push("w.applies_to_department_id = ?");
    values.push(filters.department_id);
  }
  if (filters.search) {
    clauses.push("(LOWER(w.code) LIKE ? OR LOWER(w.name) LIKE ?)");
    const term = `%${filters.search.toLowerCase()}%`;
    values.push(term, term);
  }
  return { sql: clauses.join(" AND "), values };
};

const workflowSelect = `SELECT w.*,
    (SELECT COUNT(*) FROM approval_steps s WHERE s.company_id = w.company_id AND s.workflow_id = w.id AND COALESCE(s.is_active, 1) = 1) AS steps_count
  FROM approval_workflows w`;

export const countWorkflows = async (env: Env, companyId: string, filters: ApprovalEngineFilters) => {
  const built = workflowWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM approval_workflows w WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listWorkflows = (env: Env, companyId: string, filters: ApprovalEngineFilters) => {
  const built = workflowWhere(companyId, filters);
  return many<ApprovalWorkflowEngineRecord>(
    env,
    `${workflowSelect} WHERE ${built.sql} ORDER BY w.updated_at DESC LIMIT ? OFFSET ?`,
    [...built.values, ...pagination(filters)],
  );
};

export const findWorkflowById = (env: Env, companyId: string, id: string) =>
  one<ApprovalWorkflowEngineRecord>(env, `${workflowSelect} WHERE w.company_id = ? AND w.id = ? LIMIT 1`, [companyId, id]);

export const findWorkflowByCode = (env: Env, companyId: string, code: string, currentId?: string) =>
  one<ApprovalWorkflowEngineRecord>(
    env,
    "SELECT * FROM approval_workflows WHERE company_id = ? AND LOWER(code) = LOWER(?) AND archived_at IS NULL AND (? IS NULL OR id <> ?) LIMIT 1",
    [companyId, code, currentId ?? null, currentId ?? null],
  );

export const findWorkflowForOperation = (
  env: Env,
  companyId: string,
  input: { operationType: string; departmentId?: string | null; level?: number | null },
) =>
  one<ApprovalWorkflowEngineRecord>(
    env,
    `SELECT * FROM approval_workflows
      WHERE company_id = ? AND operation_type = ? AND status = 'ACTIVE' AND archived_at IS NULL
        AND (applies_to_department_id IS NULL OR applies_to_department_id = ?)
        AND (applies_to_level_min IS NULL OR applies_to_level_min <= ?)
        AND (applies_to_level_max IS NULL OR applies_to_level_max >= ?)
      ORDER BY CASE WHEN applies_to_department_id IS NOT NULL THEN 0 ELSE 1 END, is_default DESC, updated_at DESC
      LIMIT 1`,
    [companyId, input.operationType, input.departmentId ?? null, input.level ?? 0, input.level ?? 99],
  );

export const createWorkflow = (env: Env, id: string, companyId: string, actorId: string, input: ApprovalWorkflowInput) =>
  run(
    env,
    `INSERT INTO approval_workflows (
      id, company_id, code, name, description, operation_type, status, is_default,
      applies_to_department_id, applies_to_level_min, applies_to_level_max,
      workflow_key, workflow_name, module, is_enabled, approval_mode,
      created_at, updated_at, created_by, updated_by, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEQUENTIAL', ?, ?, ?, ?, NULL)`,
    [
      id,
      companyId,
      input.code.trim(),
      input.name.trim(),
      input.description?.trim() || null,
      input.operation_type,
      input.status ?? "DRAFT",
      input.is_default ? 1 : 0,
      input.applies_to_department_id ?? null,
      input.applies_to_level_min ?? null,
      input.applies_to_level_max ?? null,
      input.code.trim(),
      input.name.trim(),
      input.operation_type,
      input.status === "ACTIVE" ? 1 : 0,
      nowIso(),
      nowIso(),
      actorId,
      actorId,
    ],
  );

export const updateWorkflow = (env: Env, companyId: string, id: string, actorId: string, input: Partial<ApprovalWorkflowInput>) =>
  run(
    env,
    `UPDATE approval_workflows
        SET code = COALESCE(?, code),
            name = COALESCE(?, name),
            description = ?,
            operation_type = COALESCE(?, operation_type),
            is_default = COALESCE(?, is_default),
            applies_to_department_id = ?,
            applies_to_level_min = ?,
            applies_to_level_max = ?,
            workflow_key = COALESCE(?, workflow_key),
            workflow_name = COALESCE(?, workflow_name),
            module = COALESCE(?, module),
            updated_at = ?,
            updated_by = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.code?.trim() ?? null,
      input.name?.trim() ?? null,
      input.description === undefined ? null : input.description?.trim() || null,
      input.operation_type ?? null,
      input.is_default === undefined ? null : input.is_default ? 1 : 0,
      input.applies_to_department_id ?? null,
      input.applies_to_level_min ?? null,
      input.applies_to_level_max ?? null,
      input.code?.trim() ?? null,
      input.name?.trim() ?? null,
      input.operation_type ?? null,
      nowIso(),
      actorId,
      companyId,
      id,
    ],
  );

export const setWorkflowStatus = (env: Env, companyId: string, id: string, actorId: string, status: string) =>
  run(
    env,
    "UPDATE approval_workflows SET status = ?, is_enabled = ?, updated_at = ?, updated_by = ? WHERE company_id = ? AND id = ?",
    [status, status === "ACTIVE" ? 1 : 0, nowIso(), actorId, companyId, id],
  );

export const archiveWorkflow = (env: Env, companyId: string, id: string, actorId: string) =>
  run(env, "UPDATE approval_workflows SET status = 'ARCHIVED', archived_at = ?, updated_at = ?, updated_by = ? WHERE company_id = ? AND id = ?", [
    nowIso(), nowIso(), actorId, companyId, id,
  ]);

export const listWorkflowSteps = (env: Env, companyId: string, workflowId: string) =>
  many<ApprovalWorkflowStepEngineRecord>(
    env,
    "SELECT * FROM approval_steps WHERE company_id = ? AND workflow_id = ? ORDER BY step_order ASC",
    [companyId, workflowId],
  );

export const findWorkflowStepById = (env: Env, companyId: string, workflowId: string, stepId: string) =>
  one<ApprovalWorkflowStepEngineRecord>(
    env,
    "SELECT * FROM approval_steps WHERE company_id = ? AND workflow_id = ? AND id = ? LIMIT 1",
    [companyId, workflowId, stepId],
  );

export const findStepByOrder = (env: Env, companyId: string, workflowId: string, stepOrder: number, currentId?: string) =>
  one<{ id: string }>(
    env,
    "SELECT id FROM approval_steps WHERE company_id = ? AND workflow_id = ? AND step_order = ? AND (? IS NULL OR id <> ?) LIMIT 1",
    [companyId, workflowId, stepOrder, currentId ?? null, currentId ?? null],
  );

export const createWorkflowStep = (env: Env, id: string, companyId: string, workflowId: string, actorId: string, input: ApprovalWorkflowStepInput) =>
  run(
    env,
    `INSERT INTO approval_steps (
      id, company_id, workflow_id, step_order, step_code, step_name, approver_resolver_type,
      required_permission, required_role_id, required_department_id, required_min_level,
      required_max_level, specific_user_id, is_final_step, all_approvers_required,
      min_approvals_required, allow_self_approval, fallback_behavior, is_active,
      required_role_key, required_permission_key, approval_type, is_required,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      workflowId,
      input.step_order,
      input.step_code?.trim() || `STEP_${input.step_order}`,
      input.step_name.trim(),
      input.approver_resolver_type,
      input.required_permission ?? null,
      input.required_role_id ?? null,
      input.required_department_id ?? null,
      input.required_min_level ?? null,
      input.required_max_level ?? null,
      input.specific_user_id ?? null,
      input.is_final_step ? 1 : 0,
      input.all_approvers_required ? 1 : 0,
      input.min_approvals_required ?? 1,
      input.allow_self_approval ? 1 : 0,
      input.fallback_behavior ?? "SKIP_TO_HR",
      input.is_active === false ? 0 : 1,
      input.required_permission ?? null,
      input.approver_resolver_type,
      input.is_final_step ? 1 : 0,
      nowIso(),
      nowIso(),
      actorId,
      actorId,
    ],
  );

export const updateWorkflowStep = (env: Env, companyId: string, workflowId: string, stepId: string, actorId: string, input: Partial<ApprovalWorkflowStepInput>) =>
  run(
    env,
    `UPDATE approval_steps
        SET step_order = COALESCE(?, step_order),
            step_code = COALESCE(?, step_code),
            step_name = COALESCE(?, step_name),
            approver_resolver_type = COALESCE(?, approver_resolver_type),
            required_permission = ?,
            required_role_id = ?,
            required_department_id = ?,
            required_min_level = ?,
            required_max_level = ?,
            specific_user_id = ?,
            is_final_step = COALESCE(?, is_final_step),
            all_approvers_required = COALESCE(?, all_approvers_required),
            min_approvals_required = COALESCE(?, min_approvals_required),
            allow_self_approval = COALESCE(?, allow_self_approval),
            fallback_behavior = COALESCE(?, fallback_behavior),
            is_active = COALESCE(?, is_active),
            required_permission_key = ?,
            approval_type = COALESCE(?, approval_type),
            updated_at = ?,
            updated_by = ?
      WHERE company_id = ? AND workflow_id = ? AND id = ?`,
    [
      input.step_order ?? null,
      input.step_code?.trim() ?? null,
      input.step_name?.trim() ?? null,
      input.approver_resolver_type ?? null,
      input.required_permission ?? null,
      input.required_role_id ?? null,
      input.required_department_id ?? null,
      input.required_min_level ?? null,
      input.required_max_level ?? null,
      input.specific_user_id ?? null,
      input.is_final_step === undefined ? null : input.is_final_step ? 1 : 0,
      input.all_approvers_required === undefined ? null : input.all_approvers_required ? 1 : 0,
      input.min_approvals_required ?? null,
      input.allow_self_approval === undefined ? null : input.allow_self_approval ? 1 : 0,
      input.fallback_behavior ?? null,
      input.is_active === undefined ? null : input.is_active ? 1 : 0,
      input.required_permission ?? null,
      input.approver_resolver_type ?? null,
      nowIso(),
      actorId,
      companyId,
      workflowId,
      stepId,
    ],
  );

export const setWorkflowStepActive = (env: Env, companyId: string, workflowId: string, stepId: string, actorId: string, active: boolean) =>
  run(
    env,
    "UPDATE approval_steps SET is_active = ?, updated_at = ?, updated_by = ? WHERE company_id = ? AND workflow_id = ? AND id = ?",
    [active ? 1 : 0, nowIso(), actorId, companyId, workflowId, stepId],
  );

export const updateStepOrder = (env: Env, companyId: string, workflowId: string, stepId: string, stepOrder: number, actorId: string) =>
  run(
    env,
    "UPDATE approval_steps SET step_order = ?, updated_at = ?, updated_by = ? WHERE company_id = ? AND workflow_id = ? AND id = ?",
    [stepOrder, nowIso(), actorId, companyId, workflowId, stepId],
  );

const requestWhere = (companyId: string, filters: ApprovalEngineFilters, extra?: string) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.operation_type) {
    clauses.push("r.operation_type = ?");
    values.push(filters.operation_type);
  }
  if (filters.status) {
    clauses.push("r.status = ?");
    values.push(filters.status);
  }
  if (filters.department_id) {
    clauses.push("r.department_id = ?");
    values.push(filters.department_id);
  }
  if (filters.search) {
    clauses.push("(LOWER(r.title) LIKE ? OR LOWER(COALESCE(r.summary, '')) LIKE ?)");
    const term = `%${filters.search.toLowerCase()}%`;
    values.push(term, term);
  }
  if (extra) clauses.push(extra);
  return { sql: clauses.join(" AND "), values };
};

const requestSelect = `SELECT r.*, req.full_name AS requester_name, subj.full_name AS subject_employee_name,
    d.name AS department_name, s.step_name AS current_step_name
  FROM approval_requests r
  LEFT JOIN employees req ON req.company_id = r.company_id AND req.id = r.requester_employee_id
  LEFT JOIN employees subj ON subj.company_id = r.company_id AND subj.id = r.subject_employee_id
  LEFT JOIN departments d ON d.company_id = r.company_id AND d.id = r.department_id
  LEFT JOIN approval_request_steps s ON s.company_id = r.company_id AND s.id = r.current_step_id`;

export const countRequests = async (env: Env, companyId: string, filters: ApprovalEngineFilters, extra?: string, extraValues: unknown[] = []) => {
  const built = requestWhere(companyId, filters, extra);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM approval_requests r WHERE ${built.sql}`, [...built.values, ...extraValues]);
  return row?.total ?? 0;
};

export const listRequests = (env: Env, companyId: string, filters: ApprovalEngineFilters, extra?: string, extraValues: unknown[] = []) => {
  const built = requestWhere(companyId, filters, extra);
  return many<ApprovalRequestEngineRecord>(
    env,
    `${requestSelect} WHERE ${built.sql} ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`,
    [...built.values, ...extraValues, ...pagination(filters)],
  );
};

export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<ApprovalRequestEngineRecord>(env, `${requestSelect} WHERE r.company_id = ? AND r.id = ? LIMIT 1`, [companyId, id]);

export const createRequest = (env: Env, id: string, companyId: string, actorId: string, workflowId: string, input: ApprovalRequestInput) =>
  run(
    env,
    `INSERT INTO approval_requests (
      id, company_id, workflow_id, operation_type, subject_type, subject_id,
      requester_employee_id, requester_user_id, subject_employee_id, department_id, position_id,
      level, title, summary, payload_json, status, current_step_id,
      module, entity_type, entity_id, employee_id, requested_by,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      workflowId,
      input.operation_type,
      input.subject_type,
      input.subject_id,
      input.requester_employee_id ?? null,
      actorId,
      input.subject_employee_id ?? null,
      input.department_id ?? null,
      input.position_id ?? null,
      input.level ?? null,
      input.title.trim(),
      input.summary?.trim() || null,
      input.payload_json === undefined ? null : JSON.stringify(input.payload_json),
      input.operation_type,
      input.subject_type,
      input.subject_id,
      input.subject_employee_id ?? input.requester_employee_id ?? null,
      actorId,
      nowIso(),
      nowIso(),
      actorId,
      actorId,
    ],
  );

export const updateRequestStatus = (
  env: Env,
  companyId: string,
  id: string,
  input: { status: string; currentStepId?: string | null; actorId: string; timestampColumn?: string | null },
) => {
  const timestampColumn = input.timestampColumn ? `, ${input.timestampColumn} = ?` : "";
  const values: unknown[] = [input.status, input.currentStepId ?? null, nowIso()];
  if (input.timestampColumn) values.push(nowIso());
  values.push(input.actorId, companyId, id);
  return run(
    env,
    `UPDATE approval_requests
        SET status = ?, current_step_id = ?, updated_at = ?${timestampColumn}, updated_by = ?
      WHERE company_id = ? AND id = ?`,
    values,
  );
};

export const createRequestStep = (
  env: Env,
  id: string,
  companyId: string,
  requestId: string,
  workflowStep: ApprovalWorkflowStepEngineRecord,
  resolution: {
    assignedUserId: string | null;
    assignedEmployeeId: string | null;
    assignedDepartmentId: string | null;
    status: string;
    fallbackApplied: string | null;
  },
) =>
  run(
    env,
    `INSERT INTO approval_request_steps (
      id, company_id, approval_request_id, workflow_step_id, step_order, step_code,
      step_name, approver_resolver_type, assigned_approver_user_id,
      assigned_approver_employee_id, assigned_department_id, required_permission,
      required_role_id, required_min_level, required_max_level, status,
      fallback_applied, resolved_at, due_at, approved_at, rejected_at,
      skipped_at, escalated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      requestId,
      workflowStep.id,
      workflowStep.step_order,
      workflowStep.step_code,
      workflowStep.step_name,
      workflowStep.approver_resolver_type,
      resolution.assignedUserId,
      resolution.assignedEmployeeId,
      resolution.assignedDepartmentId,
      workflowStep.required_permission,
      workflowStep.required_role_id,
      workflowStep.required_min_level,
      workflowStep.required_max_level,
      resolution.status,
      resolution.fallbackApplied,
      resolution.status !== "WAITING_FOR_APPROVER" ? nowIso() : null,
      resolution.status === "SKIPPED" ? nowIso() : null,
      resolution.status === "ESCALATED" ? nowIso() : null,
      nowIso(),
      nowIso(),
    ],
  );

export const listRequestSteps = (env: Env, companyId: string, requestId: string) =>
  many<ApprovalRequestStepEngineRecord>(
    env,
    `SELECT s.*, u.full_name AS assigned_approver_name
       FROM approval_request_steps s
       LEFT JOIN users u ON u.company_id = s.company_id AND u.id = s.assigned_approver_user_id
      WHERE s.company_id = ? AND s.approval_request_id = ?
      ORDER BY s.step_order ASC`,
    [companyId, requestId],
  );

export const findRequestStepById = (env: Env, companyId: string, requestId: string, stepId: string) =>
  one<ApprovalRequestStepEngineRecord>(
    env,
    "SELECT * FROM approval_request_steps WHERE company_id = ? AND approval_request_id = ? AND id = ? LIMIT 1",
    [companyId, requestId, stepId],
  );

export const updateRequestStepStatus = (
  env: Env,
  companyId: string,
  stepId: string,
  input: { status: string; actorId?: string; assignedUserId?: string | null; assignedEmployeeId?: string | null; timestampColumn?: string | null; fallbackApplied?: string | null },
) => {
  const timestampColumn = input.timestampColumn ? `, ${input.timestampColumn} = ?` : "";
  const assignment = input.assignedUserId !== undefined ? ", assigned_approver_user_id = ?, assigned_approver_employee_id = ?" : "";
  const values: unknown[] = [input.status, input.fallbackApplied ?? null, nowIso()];
  if (input.timestampColumn) values.push(nowIso());
  if (input.assignedUserId !== undefined) values.push(input.assignedUserId, input.assignedEmployeeId ?? null);
  values.push(companyId, stepId);
  return run(
    env,
    `UPDATE approval_request_steps SET status = ?, fallback_applied = COALESCE(?, fallback_applied), updated_at = ?${timestampColumn}${assignment}
      WHERE company_id = ? AND id = ?`,
    values,
  );
};

export const createAction = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    requestId: string;
    stepId?: string | null;
    stepOrder?: number | null;
    action: string;
    actorUserId: string;
    actorEmployeeId?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    reason?: string | null;
    comment?: string | null;
    metadata?: unknown;
  },
) =>
  run(
    env,
    `INSERT INTO approval_actions (
      id, company_id, approval_request_id, approval_request_step_id, step_order, action,
      actor_user_id, actor_employee_id, acted_by, from_status, to_status,
      reason, comment, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.requestId,
      input.stepId ?? null,
      input.stepOrder ?? 0,
      input.action,
      input.actorUserId,
      input.actorEmployeeId ?? null,
      input.actorUserId,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.reason ?? null,
      input.comment ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
      nowIso(),
    ],
  );

export const listActions = (env: Env, companyId: string, requestId: string) =>
  many<ApprovalActionEngineRecord>(
    env,
    `SELECT a.*, u.full_name AS actor_name, s.step_name
       FROM approval_actions a
       LEFT JOIN users u ON u.company_id = a.company_id AND u.id = a.actor_user_id
       LEFT JOIN approval_request_steps s ON s.company_id = a.company_id AND s.id = a.approval_request_step_id
      WHERE a.company_id = ? AND a.approval_request_id = ?
      ORDER BY a.created_at ASC`,
    [companyId, requestId],
  );

const candidateSelect = `SELECT u.id AS user_id, e.id AS employee_id, u.full_name, e.full_name AS employee_name,
    e.level, e.department_id, r.role_key
  FROM users u
  LEFT JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id AND e.deleted_at IS NULL
  LEFT JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
  LEFT JOIN roles r ON r.company_id = u.company_id AND r.id = ur.role_id
  WHERE u.company_id = ? AND u.deleted_at IS NULL AND COALESCE(u.status, 'active') = 'active'
    AND (u.employee_id IS NULL OR (e.id IS NOT NULL AND e.deleted_at IS NULL AND e.archived_at IS NULL AND COALESCE(e.employment_status, 'active') NOT IN ('inactive', 'archived', 'deleted')))`;

export const findDepartmentHeadApprover = (env: Env, companyId: string, departmentId: string, requiredPermission?: string | null) =>
  many<ApprovalResolverCandidate>(
    env,
    `${candidateSelect}
       AND e.id = (SELECT head_employee_id FROM departments WHERE company_id = ? AND id = ?)
       AND (? IS NULL OR EXISTS (
          SELECT 1 FROM user_roles ur2 JOIN role_permissions rp ON rp.company_id = ur2.company_id AND rp.role_id = ur2.role_id
          WHERE ur2.company_id = u.company_id AND ur2.user_id = u.id AND rp.permission_key = ?
       ))
      GROUP BY u.id ORDER BY e.level DESC LIMIT 5`,
    [companyId, companyId, departmentId, requiredPermission ?? null, requiredPermission ?? null],
  );

export const findDepartmentLevelApprovers = (
  env: Env,
  companyId: string,
  input: { departmentId: string; minLevel?: number | null; maxLevel?: number | null; requiredPermission?: string | null },
) =>
  many<ApprovalResolverCandidate>(
    env,
    `${candidateSelect}
       AND e.department_id = ?
       AND (? IS NULL OR e.level >= ?)
       AND (? IS NULL OR e.level <= ?)
       AND (? IS NULL OR EXISTS (
          SELECT 1 FROM user_roles ur2 JOIN role_permissions rp ON rp.company_id = ur2.company_id AND rp.role_id = ur2.role_id
          WHERE ur2.company_id = u.company_id AND ur2.user_id = u.id AND rp.permission_key = ?
       ))
      GROUP BY u.id ORDER BY e.level DESC, u.full_name ASC LIMIT 25`,
    [
      companyId,
      input.departmentId,
      input.minLevel ?? null,
      input.minLevel ?? null,
      input.maxLevel ?? null,
      input.maxLevel ?? null,
      input.requiredPermission ?? null,
      input.requiredPermission ?? null,
    ],
  );

export const findPermissionApprovers = (
  env: Env,
  companyId: string,
  input: { permission?: string | null; roleId?: string | null; departmentId?: string | null; roleKey?: string | null },
) =>
  many<ApprovalResolverCandidate>(
    env,
    `${candidateSelect}
       AND (? IS NULL OR e.department_id = ?)
       AND (? IS NULL OR r.id = ?)
       AND (? IS NULL OR r.role_key = ?)
       AND (? IS NULL OR EXISTS (
          SELECT 1 FROM user_roles ur2 JOIN role_permissions rp ON rp.company_id = ur2.company_id AND rp.role_id = ur2.role_id
          WHERE ur2.company_id = u.company_id AND ur2.user_id = u.id AND rp.permission_key = ?
       ))
      GROUP BY u.id ORDER BY u.full_name ASC LIMIT 25`,
    [
      companyId,
      input.departmentId ?? null,
      input.departmentId ?? null,
      input.roleId ?? null,
      input.roleId ?? null,
      input.roleKey ?? null,
      input.roleKey ?? null,
      input.permission ?? null,
      input.permission ?? null,
    ],
  );

export const findSpecificUserApprover = (env: Env, companyId: string, userId: string) =>
  many<ApprovalResolverCandidate>(env, `${candidateSelect} AND u.id = ? GROUP BY u.id LIMIT 1`, [companyId, userId]);

export const findSuperAdminApprovers = (env: Env, companyId: string) =>
  findPermissionApprovers(env, companyId, { roleKey: "super_admin" });

export const findAssignableApprover = (
  env: Env,
  companyId: string,
  userId: string,
  input: {
    requiredPermission?: string | null;
    requiredRoleId?: string | null;
    departmentId?: string | null;
    minLevel?: number | null;
    maxLevel?: number | null;
    requireLinkedEmployee?: boolean;
  },
) =>
  one<ApprovalResolverCandidate>(
    env,
    `${candidateSelect}
       AND u.id = ?
       AND (? = 0 OR e.id IS NOT NULL)
       AND (? IS NULL OR e.department_id = ?)
       AND (? IS NULL OR e.level >= ?)
       AND (? IS NULL OR e.level <= ?)
       AND (? IS NULL OR EXISTS (
          SELECT 1 FROM user_roles ur3
          WHERE ur3.company_id = u.company_id AND ur3.user_id = u.id AND ur3.role_id = ?
       ))
       AND (? IS NULL OR EXISTS (
          SELECT 1 FROM user_roles ur2 JOIN role_permissions rp ON rp.company_id = ur2.company_id AND rp.role_id = ur2.role_id
          WHERE ur2.company_id = u.company_id AND ur2.user_id = u.id AND rp.permission_key = ?
       ))
      GROUP BY u.id LIMIT 1`,
    [
      companyId,
      userId,
      input.requireLinkedEmployee ? 1 : 0,
      input.departmentId ?? null,
      input.departmentId ?? null,
      input.minLevel ?? null,
      input.minLevel ?? null,
      input.maxLevel ?? null,
      input.maxLevel ?? null,
      input.requiredRoleId ?? null,
      input.requiredRoleId ?? null,
      input.requiredPermission ?? null,
      input.requiredPermission ?? null,
    ],
  );

export const findEmployeeByUserId = (env: Env, companyId: string, userId: string) =>
  one<ApprovalEmployeeContext>(
    env,
    `SELECT e.id AS employee_id, e.full_name, e.department_id, e.position_id, e.level,
            e.employment_status AS status, e.archived_at, e.deleted_at
       FROM users u
       JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.id = ? AND u.deleted_at IS NULL
      LIMIT 1`,
    [companyId, userId],
  );

export const findEmployeeForApproval = (env: Env, companyId: string, employeeId: string) =>
  one<ApprovalEmployeeContext>(
    env,
    `SELECT id AS employee_id, full_name, department_id, position_id, level,
            employment_status AS status, archived_at, deleted_at
       FROM employees
      WHERE company_id = ? AND id = ?
      LIMIT 1`,
    [companyId, employeeId],
  );
