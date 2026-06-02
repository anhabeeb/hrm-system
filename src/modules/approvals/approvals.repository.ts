import type { ApprovalListFilters, ApprovalOutletScope, StepInput, ThresholdFilters, ThresholdInput, WorkflowFilters, WorkflowInput, WorkflowUpdateInput } from "./approvals.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const stepAssignedSql = (scope: ApprovalOutletScope) => {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (scope.roleKeys.length > 0) {
    clauses.push(`s.required_role_key IN (${scope.roleKeys.map(() => "?").join(", ")})`);
    values.push(...scope.roleKeys);
  }
  if (scope.permissions.length > 0) {
    clauses.push(`s.required_permission_key IN (${scope.permissions.map(() => "?").join(", ")})`);
    values.push(...scope.permissions);
  }
  clauses.push("(s.required_role_key IS NULL AND s.required_permission_key IS NULL)");
  return { sql: `(${clauses.join(" OR ")})`, values };
};

const requestWhere = (companyId: string, filters: ApprovalListFilters, scope: ApprovalOutletScope) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  const assigned = stepAssignedSql(scope);
  if (!scope.isSuperAdmin) {
    const accessClauses = ["r.requested_by = ?"];
    values.push(scope.userId);
    if (scope.outletIds.length > 0) {
      accessClauses.push(`e.primary_outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
      values.push(...scope.outletIds);
    }
    clauses.push(`(${accessClauses.join(" OR ")})`);
  }
  if (filters.assigned_to_me) {
    clauses.push(assigned.sql);
    values.push(...assigned.values);
  }
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (filters.module) { clauses.push("r.module = ?"); values.push(filters.module); }
  if (filters.workflow_id) { clauses.push("r.workflow_id = ?"); values.push(filters.workflow_id); }
  if (filters.workflow_key) { clauses.push("w.workflow_key = ?"); values.push(filters.workflow_key); }
  if (filters.entity_type) { clauses.push("r.entity_type = ?"); values.push(filters.entity_type); }
  if (filters.entity_id) { clauses.push("r.entity_id = ?"); values.push(filters.entity_id); }
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.requested_by) { clauses.push("r.requested_by = ?"); values.push(filters.requested_by); }
  if (filters.current_step) { clauses.push("r.current_step = ?"); values.push(filters.current_step); }
  if (filters.date_from) { clauses.push("r.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("r.created_at <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

const requestFilterWhere = (companyId: string, filters: ApprovalListFilters) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (filters.module) { clauses.push("r.module = ?"); values.push(filters.module); }
  if (filters.workflow_id) { clauses.push("r.workflow_id = ?"); values.push(filters.workflow_id); }
  if (filters.workflow_key) { clauses.push("w.workflow_key = ?"); values.push(filters.workflow_key); }
  if (filters.entity_type) { clauses.push("r.entity_type = ?"); values.push(filters.entity_type); }
  if (filters.entity_id) { clauses.push("r.entity_id = ?"); values.push(filters.entity_id); }
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.requested_by) { clauses.push("r.requested_by = ?"); values.push(filters.requested_by); }
  if (filters.current_step) { clauses.push("r.current_step = ?"); values.push(filters.current_step); }
  if (filters.date_from) { clauses.push("r.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("r.created_at <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

const requestSelect = `
  FROM approval_requests r
  JOIN approval_workflows w ON w.id = r.workflow_id AND w.company_id = r.company_id
  LEFT JOIN approval_steps s ON s.workflow_id = r.workflow_id AND s.company_id = r.company_id AND s.step_order = r.current_step
  LEFT JOIN employees e ON e.id = r.employee_id AND e.company_id = r.company_id
  LEFT JOIN outlets o ON o.id = e.primary_outlet_id AND o.company_id = r.company_id
  LEFT JOIN users u ON u.id = r.requested_by AND u.company_id = r.company_id
`;

export const countRequests = async (env: Env, companyId: string, filters: ApprovalListFilters, scope: ApprovalOutletScope) => {
  const built = requestWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(env, `SELECT COUNT(DISTINCT r.id) AS total ${requestSelect} WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listRequests = (env: Env, companyId: string, filters: ApprovalListFilters, scope: ApprovalOutletScope) => {
  const built = requestWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT r.*, w.workflow_key, w.workflow_name, w.approval_mode,
      e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, o.name AS outlet_name,
      u.full_name AS requested_by_name,
      s.required_role_key AS waiting_for_role_key, s.required_permission_key AS waiting_for_permission_key
     ${requestSelect}
     WHERE ${built.sql}
     GROUP BY r.id
     ORDER BY r.${filters.sort_by} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const listRequestCandidates = (env: Env, companyId: string, filters: ApprovalListFilters) => {
  const built = requestFilterWhere(companyId, filters);
  return many<any>(
    env,
    `SELECT r.*, w.workflow_key, w.workflow_name, w.approval_mode,
      e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, o.name AS outlet_name,
      u.full_name AS requested_by_name,
      s.required_role_key AS waiting_for_role_key, s.required_permission_key AS waiting_for_permission_key
     ${requestSelect}
     WHERE ${built.sql}
     GROUP BY r.id
     ORDER BY r.${filters.sort_by} ${filters.sort_direction.toUpperCase()}`,
    built.values,
  );
};

export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT r.*, w.workflow_key, w.workflow_name, w.approval_mode,
      e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, o.name AS outlet_name,
      u.full_name AS requested_by_name
     ${requestSelect}
     WHERE r.company_id = ? AND r.id = ? LIMIT 1`,
    [companyId, id],
  );

export const findPendingRequestForEntity = (env: Env, companyId: string, workflowId: string, entityType: string, entityId: string) =>
  one<any>(
    env,
    "SELECT * FROM approval_requests WHERE company_id = ? AND workflow_id = ? AND entity_type = ? AND entity_id = ? AND status IN ('pending', 'in_progress') LIMIT 1",
    [companyId, workflowId, entityType, entityId],
  );

export const createRequest = (env: Env, input: { id: string; companyId: string; workflowId: string; module: string; entityType: string; entityId: string; employeeId?: string | null; requestedBy: string; summary?: string; payloadJson?: string }) =>
  run(
    env,
    `INSERT INTO approval_requests (
      id, company_id, workflow_id, module, entity_type, entity_id, employee_id,
      requested_by, status, current_step, summary, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.workflowId, input.module, input.entityType, input.entityId, input.employeeId ?? null, input.requestedBy, input.summary ?? null, input.payloadJson ?? null, new Date().toISOString(), new Date().toISOString()],
  );

export const updateRequestStatus = (env: Env, companyId: string, id: string, status: string, currentStep?: number) =>
  run(
    env,
    `UPDATE approval_requests SET status = ?, current_step = COALESCE(?, current_step), updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [status, currentStep ?? null, new Date().toISOString(), companyId, id],
  );

export const runApprovalActionStatements = (
  env: Env,
  input: { actionId: string; companyId: string; requestId: string; stepOrder: number; action: string; actedBy: string; comment: string; oldStatus: string; newStatus: string; currentStep?: number },
) =>
  env.DB.batch([
    env.DB.prepare(
      `INSERT INTO approval_actions (
        id, company_id, approval_request_id, step_order, action, acted_by,
        comment, old_status, new_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(input.actionId, input.companyId, input.requestId, input.stepOrder, input.action, input.actedBy, input.comment, input.oldStatus, input.newStatus, new Date().toISOString()),
    env.DB.prepare(
      `UPDATE approval_requests SET status = ?, current_step = COALESCE(?, current_step), updated_at = ?
       WHERE company_id = ? AND id = ?`,
    ).bind(input.newStatus, input.currentStep ?? null, new Date().toISOString(), input.companyId, input.requestId),
  ]);

export const createAction = (env: Env, input: { id: string; companyId: string; requestId: string; stepOrder: number; action: string; actedBy: string; comment: string; oldStatus: string; newStatus: string }) =>
  run(
    env,
    `INSERT INTO approval_actions (
      id, company_id, approval_request_id, step_order, action, acted_by,
      comment, old_status, new_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.requestId, input.stepOrder, input.action, input.actedBy, input.comment, input.oldStatus, input.newStatus, new Date().toISOString()],
  );

export const listActions = (env: Env, companyId: string, requestId: string) =>
  many<any>(
    env,
    `SELECT a.*, u.full_name AS acted_by_name
     FROM approval_actions a LEFT JOIN users u ON u.id = a.acted_by AND u.company_id = a.company_id
     WHERE a.company_id = ? AND a.approval_request_id = ?
     ORDER BY a.created_at ASC`,
    [companyId, requestId],
  );

export const listSteps = (env: Env, companyId: string, workflowId: string) =>
  many<any>(
    env,
    "SELECT * FROM approval_steps WHERE company_id = ? AND workflow_id = ? ORDER BY step_order ASC",
    [companyId, workflowId],
  );

export const findStep = (env: Env, companyId: string, workflowId: string, stepOrder: number) =>
  one<any>(
    env,
    "SELECT * FROM approval_steps WHERE company_id = ? AND workflow_id = ? AND step_order = ? LIMIT 1",
    [companyId, workflowId, stepOrder],
  );

const workflowWhere = (companyId: string, filters: WorkflowFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.module) { clauses.push("module = ?"); values.push(filters.module); }
  if (filters.workflow_key) { clauses.push("workflow_key = ?"); values.push(filters.workflow_key); }
  if (filters.is_enabled !== undefined) { clauses.push("is_enabled = ?"); values.push(filters.is_enabled ? 1 : 0); }
  return { sql: clauses.join(" AND "), values };
};

export const countWorkflows = async (env: Env, companyId: string, filters: WorkflowFilters) => {
  const built = workflowWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM approval_workflows WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};
export const listWorkflows = (env: Env, companyId: string, filters: WorkflowFilters) => {
  const built = workflowWhere(companyId, filters);
  return many<any>(env, `SELECT * FROM approval_workflows WHERE ${built.sql} ORDER BY workflow_name ASC LIMIT ? OFFSET ?`, [...built.values, filters.page_size, (filters.page - 1) * filters.page_size]);
};
export const findWorkflowById = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM approval_workflows WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);
export const findWorkflowByKey = (env: Env, companyId: string, workflowKey: string) =>
  one<any>(env, "SELECT * FROM approval_workflows WHERE company_id = ? AND workflow_key = ? LIMIT 1", [companyId, workflowKey]);
export const createWorkflow = (env: Env, id: string, companyId: string, input: WorkflowInput) =>
  run(
    env,
    `INSERT INTO approval_workflows (id, company_id, workflow_key, workflow_name, module, is_enabled, approval_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, companyId, input.workflow_key, input.workflow_name, input.module, input.approval_mode ?? "manual", new Date().toISOString(), new Date().toISOString()],
  );
export const updateWorkflow = (env: Env, companyId: string, id: string, input: WorkflowUpdateInput) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["workflow_key", "workflow_name", "module", "approval_mode"] as const) {
    if (input[key] !== undefined) { sets.push(`${key} = ?`); values.push(input[key]); }
  }
  if (input.is_enabled !== undefined) { sets.push("is_enabled = ?"); values.push(input.is_enabled ? 1 : 0); }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE approval_workflows SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const createStep = (env: Env, id: string, companyId: string, workflowId: string, input: StepInput) =>
  run(
    env,
    `INSERT INTO approval_steps (
      id, company_id, workflow_id, step_order, step_name, required_role_key,
      required_permission_key, is_required, approval_type, amount_min, amount_max, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, workflowId, input.step_order, input.step_name, input.required_role_key ?? null, input.required_permission_key ?? null, input.is_required === false ? 0 : 1, input.approval_type ?? "single", input.amount_min ?? null, input.amount_max ?? null, new Date().toISOString(), new Date().toISOString()],
  );
export const findStepById = (env: Env, companyId: string, workflowId: string, stepId: string) =>
  one<any>(env, "SELECT * FROM approval_steps WHERE company_id = ? AND workflow_id = ? AND id = ? LIMIT 1", [companyId, workflowId, stepId]);
export const updateStep = (env: Env, companyId: string, workflowId: string, stepId: string, input: StepInput) =>
  run(
    env,
    `UPDATE approval_steps SET step_order = ?, step_name = ?, required_role_key = ?,
      required_permission_key = ?, is_required = ?, approval_type = ?, amount_min = ?,
      amount_max = ?, updated_at = ? WHERE company_id = ? AND workflow_id = ? AND id = ?`,
    [input.step_order, input.step_name, input.required_role_key ?? null, input.required_permission_key ?? null, input.is_required === false ? 0 : 1, input.approval_type ?? "single", input.amount_min ?? null, input.amount_max ?? null, new Date().toISOString(), companyId, workflowId, stepId],
  );
export const deleteStep = (env: Env, companyId: string, workflowId: string, stepId: string) =>
  run(env, "DELETE FROM approval_steps WHERE company_id = ? AND workflow_id = ? AND id = ?", [companyId, workflowId, stepId]);
export const countPendingRequestsAtStep = async (env: Env, companyId: string, workflowId: string, stepOrder: number) => {
  const row = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM approval_requests WHERE company_id = ? AND workflow_id = ? AND current_step = ? AND status IN ('pending', 'in_progress')",
    [companyId, workflowId, stepOrder],
  );
  return row?.total ?? 0;
};

export const findStepByOrder = (env: Env, companyId: string, workflowId: string, stepOrder: number, excludeStepId?: string) =>
  one<any>(
    env,
    `SELECT * FROM approval_steps WHERE company_id = ? AND workflow_id = ? AND step_order = ?
     ${excludeStepId ? "AND id <> ?" : ""}
     LIMIT 1`,
    excludeStepId ? [companyId, workflowId, stepOrder, excludeStepId] : [companyId, workflowId, stepOrder],
  );

export const countOpenRequestsForWorkflow = async (env: Env, companyId: string, workflowId: string) => {
  const row = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM approval_requests WHERE company_id = ? AND workflow_id = ? AND status IN ('pending', 'in_progress', 'returned', 'returned_for_more_info')",
    [companyId, workflowId],
  );
  return row?.total ?? 0;
};

const thresholdWhere = (companyId: string, filters: ThresholdFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.workflow_key) { clauses.push("workflow_key = ?"); values.push(filters.workflow_key); }
  if (filters.threshold_type) { clauses.push("threshold_type = ?"); values.push(filters.threshold_type); }
  if (filters.is_active !== undefined) { clauses.push("is_active = ?"); values.push(filters.is_active ? 1 : 0); }
  return { sql: clauses.join(" AND "), values };
};
export const countThresholds = async (env: Env, companyId: string, filters: ThresholdFilters) => {
  const built = thresholdWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM approval_thresholds WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};
export const listThresholds = (env: Env, companyId: string, filters: ThresholdFilters) => {
  const built = thresholdWhere(companyId, filters);
  return many<any>(env, `SELECT * FROM approval_thresholds WHERE ${built.sql} ORDER BY workflow_key ASC, threshold_name ASC LIMIT ? OFFSET ?`, [...built.values, filters.page_size, (filters.page - 1) * filters.page_size]);
};
export const findThresholdById = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM approval_thresholds WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);
export const listActiveThresholdsForWorkflow = (env: Env, companyId: string, workflowKey: string, effectiveDate: string) =>
  many<any>(
    env,
    `SELECT * FROM approval_thresholds
     WHERE company_id = ? AND workflow_key = ? AND is_active = 1
       AND (effective_from IS NULL OR effective_from <= ?)
     ORDER BY effective_from DESC, created_at DESC`,
    [companyId, workflowKey, effectiveDate],
  );
export const createThreshold = (env: Env, id: string, companyId: string, input: ThresholdInput) =>
  run(
    env,
    `INSERT INTO approval_thresholds (
      id, company_id, workflow_key, threshold_name, threshold_type,
      amount_min, amount_max, percentage_min, percentage_max, currency,
      required_roles_json, required_permissions_json, is_active, effective_from,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [id, companyId, input.workflow_key, input.threshold_name, input.threshold_type, input.amount_min ?? null, input.amount_max ?? null, input.percentage_min ?? null, input.percentage_max ?? null, input.currency ?? "MVR", input.required_roles_json ?? null, input.required_permissions_json ?? null, input.effective_from ?? null, new Date().toISOString(), new Date().toISOString()],
  );
export const updateThreshold = (env: Env, companyId: string, id: string, input: Partial<ThresholdInput> & { is_active?: boolean }) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["workflow_key", "threshold_name", "threshold_type", "amount_min", "amount_max", "percentage_min", "percentage_max", "currency", "required_roles_json", "required_permissions_json", "effective_from"] as const) {
    if (input[key] !== undefined) { sets.push(`${key} = ?`); values.push(input[key]); }
  }
  if (input.is_active !== undefined) { sets.push("is_active = ?"); values.push(input.is_active ? 1 : 0); }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE approval_thresholds SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};
export const createThresholdHistory = (env: Env, input: { id: string; companyId: string; thresholdId: string; oldValue: unknown; newValue: unknown; changedBy: string; reason?: string | null; status?: string }) =>
  run(
    env,
    `INSERT INTO approval_threshold_history (
      id, company_id, threshold_id, old_value_json, new_value_json,
      changed_by, change_reason, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.thresholdId, JSON.stringify(input.oldValue), JSON.stringify(input.newValue), input.changedBy, input.reason ?? null, input.status ?? "active", new Date().toISOString()],
  );
export const listThresholdHistory = (env: Env, companyId: string, thresholdId: string) =>
  many<any>(
    env,
    "SELECT * FROM approval_threshold_history WHERE company_id = ? AND threshold_id = ? ORDER BY created_at DESC",
    [companyId, thresholdId],
  );

export const findEmployeeOutlet = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string; primary_outlet_id: string | null }>(
    env,
    "SELECT id, primary_outlet_id FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );

export const updateTargetStatus = (env: Env, companyId: string, table: string, id: string, status: string) =>
  run(env, `UPDATE ${table} SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?`, [status, new Date().toISOString(), companyId, id]);
