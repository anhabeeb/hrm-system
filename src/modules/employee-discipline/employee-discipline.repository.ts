import type {
  DisciplineEmployeeRecord,
  DisciplinaryActionFilters,
  DisciplinaryActionRequestRecord,
  DisciplinaryFollowUpTaskRecord,
  DisciplinaryRecord,
} from "./employee-discipline.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).run();
const nowIso = () => new Date().toISOString();

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<DisciplineEmployeeRecord>(
    env,
    `SELECT id, company_id, employee_code, full_name, employment_status, primary_outlet_id,
            department_id, position_id, level, archived_at, deleted_at
       FROM employees
      WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const findEmployeeByUserId = (env: Env, companyId: string, userId: string) =>
  one<DisciplineEmployeeRecord>(
    env,
    `SELECT e.id, e.company_id, e.employee_code, e.full_name, e.employment_status, e.primary_outlet_id,
            e.department_id, e.position_id, e.level, e.archived_at, e.deleted_at
       FROM users u
       JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.id = ? LIMIT 1`,
    [companyId, userId],
  );

const selectRequest = `
  SELECT dar.*,
         e.full_name AS employee_name,
         e.employee_code,
         d.name AS department_name,
         p.title AS position_title,
         o.name AS outlet_name,
         ars.step_name AS current_step_name
    FROM employee_disciplinary_action_requests dar
    LEFT JOIN employees e ON e.company_id = dar.company_id AND e.id = dar.employee_id
    LEFT JOIN departments d ON d.company_id = dar.company_id AND d.id = dar.department_id
    LEFT JOIN positions p ON p.company_id = dar.company_id AND p.id = dar.position_id
    LEFT JOIN outlets o ON o.company_id = dar.company_id AND o.id = dar.outlet_id
    LEFT JOIN approval_request_steps ars ON ars.company_id = dar.company_id AND ars.id = dar.approval_current_step
`;

const applyFilters = (clauses: string[], values: unknown[], filters: DisciplinaryActionFilters) => {
  if (filters.employee_id) { clauses.push("dar.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.department_id) { clauses.push("dar.department_id = ?"); values.push(filters.department_id); }
  if (filters.outlet_id) { clauses.push("dar.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.request_type) { clauses.push("dar.request_type = ?"); values.push(filters.request_type); }
  if (filters.action_type) { clauses.push("dar.action_type = ?"); values.push(filters.action_type); }
  if (filters.severity) { clauses.push("dar.severity = ?"); values.push(filters.severity); }
  if (filters.status) { clauses.push("dar.status = ?"); values.push(filters.status); }
  if (filters.approval_status) { clauses.push("dar.approval_status = ?"); values.push(filters.approval_status); }
};

export const listRequests = async (
  env: Env,
  companyId: string,
  filters: DisciplinaryActionFilters,
  visibilitySql?: string,
  visibilityValues: unknown[] = [],
) => {
  const clauses = ["dar.company_id = ?", "dar.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  applyFilters(clauses, values, filters);
  if (visibilitySql) {
    clauses.push(`(${visibilitySql})`);
    values.push(...visibilityValues);
  }
  const where = clauses.join(" AND ");
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM employee_disciplinary_action_requests dar WHERE ${where}`, values);
  const rows = await many<DisciplinaryActionRequestRecord>(
    env,
    `${selectRequest}
     WHERE ${where}
     ORDER BY COALESCE(dar.approval_submitted_at, dar.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: total?.total ?? 0 };
};

export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<DisciplinaryActionRequestRecord>(
    env,
    `${selectRequest}
     WHERE dar.company_id = ? AND dar.id = ? AND dar.archived_at IS NULL
     LIMIT 1`,
    [companyId, id],
  );

export const findDuplicateActiveRequest = (env: Env, input: {
  companyId: string;
  employeeId: string;
  requestType: string;
  incidentDate?: string | null;
  title: string;
}) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM employee_disciplinary_action_requests
      WHERE company_id = ? AND employee_id = ? AND request_type = ?
        AND COALESCE(incident_date, '') = COALESCE(?, '') AND title = ?
        AND status IN ('DRAFT','PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW','PENDING_INVESTIGATION','PENDING_FINAL_APPROVAL','PENDING_APPLICATION','PENDING_ACKNOWLEDGEMENT','PENDING_FOLLOW_UP','PENDING_MANUAL_REVIEW','APPROVED','APPLIED','ACKNOWLEDGED')
      LIMIT 1`,
    [input.companyId, input.employeeId, input.requestType, input.incidentDate ?? null, input.title],
  );

export const createRequest = (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  payload: Record<string, unknown>;
}) => {
  const now = nowIso();
  return run(
    env,
    `INSERT INTO employee_disciplinary_action_requests (
      id, company_id, employee_id, requester_employee_id, requester_user_id,
      department_id, position_id, level, outlet_id, store_id, request_type, action_type,
      operation_type, severity, incident_date, reported_date, title, summary, description,
      policy_reference, requested_action_json, evidence_summary, acknowledgement_required,
      follow_up_required, follow_up_json, payroll_follow_up_required, offboarding_follow_up_required,
      training_follow_up_required, current_value_json, requested_value_json, status,
      created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISCIPLINARY_ACTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.payload.employee_id,
      input.payload.requester_employee_id ?? null,
      input.payload.requester_user_id ?? null,
      input.payload.department_id ?? null,
      input.payload.position_id ?? null,
      input.payload.level ?? null,
      input.payload.outlet_id ?? null,
      input.payload.store_id ?? null,
      input.payload.request_type,
      input.payload.action_type ?? null,
      input.payload.severity,
      input.payload.incident_date ?? null,
      now.slice(0, 10),
      input.payload.title,
      input.payload.summary ?? null,
      input.payload.description,
      input.payload.policy_reference ?? null,
      input.payload.requested_action_json ?? null,
      input.payload.evidence_summary ?? null,
      input.payload.acknowledgement_required ?? 0,
      input.payload.follow_up_required ?? 0,
      input.payload.follow_up_json ?? null,
      input.payload.payroll_follow_up_required ?? 0,
      input.payload.offboarding_follow_up_required ?? 0,
      input.payload.training_follow_up_required ?? 0,
      input.payload.current_value_json ?? null,
      input.payload.requested_value_json ?? null,
      now,
      now,
      input.actorUserId,
      input.actorUserId,
    ],
  );
};

export const updateRequestApprovalLink = (env: Env, companyId: string, id: string, input: {
  approvalRequestId: string;
  approvalStatus?: string | null;
  currentStepId?: string | null;
  status: string;
  actorUserId: string;
}) =>
  run(
    env,
    `UPDATE employee_disciplinary_action_requests
        SET approval_request_id = ?, approval_status = ?, approval_current_step = ?, status = ?,
            approval_submitted_at = COALESCE(approval_submitted_at, ?), updated_by = ?, updated_at = ?
      WHERE company_id = ? AND id = ? AND approval_request_id IS NULL`,
    [input.approvalRequestId, input.approvalStatus ?? null, input.currentStepId ?? null, input.status, nowIso(), input.actorUserId, nowIso(), companyId, id],
  );

export const updateRequestStatus = (env: Env, companyId: string, id: string, input: Record<string, unknown>) => {
  const allowed = [
    "status",
    "approval_status",
    "approval_current_step",
    "operation_owner_department_id",
    "operation_final_department_id",
    "operation_execution_department_id",
    "department_reviewed_at",
    "department_reviewed_by",
    "owner_reviewed_at",
    "owner_reviewed_by",
    "final_approved_at",
    "final_approved_by",
    "rejected_at",
    "rejected_by",
    "rejection_reason",
    "cancelled_at",
    "cancelled_by",
    "cancellation_reason",
    "approval_completed_at",
    "applied_at",
    "applied_by",
    "closed_at",
    "closed_by",
    "acknowledged_at",
    "acknowledged_by",
    "acknowledgement_note",
    "follow_up_status",
    "execution_note",
    "apply_error_code",
    "apply_error_message",
    "execution_resolution_json",
    "updated_by",
  ] as const;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(input[key] ?? null);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  values.push(nowIso(), companyId, id);
  return run(env, `UPDATE employee_disciplinary_action_requests SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const findOfficialRecordByRequest = (env: Env, companyId: string, requestId: string) =>
  one<DisciplinaryRecord>(
    env,
    "SELECT * FROM employee_disciplinary_records WHERE company_id = ? AND source_request_id = ? AND archived_at IS NULL LIMIT 1",
    [companyId, requestId],
  );

const selectRecord = `
  SELECT r.*,
         e.full_name AS employee_name,
         e.employee_code,
         e.department_id,
         e.position_id,
         e.level,
         e.primary_outlet_id AS outlet_id,
         d.name AS department_name,
         p.title AS position_title
    FROM employee_disciplinary_records r
    LEFT JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
    LEFT JOIN departments d ON d.company_id = r.company_id AND d.id = e.department_id
    LEFT JOIN positions p ON p.company_id = r.company_id AND p.id = e.position_id
`;

export const findOfficialRecordById = (env: Env, companyId: string, recordId: string, includeArchived = false) =>
  one<DisciplinaryRecord & Record<string, unknown>>(
    env,
    `${selectRecord}
      WHERE r.company_id = ? AND r.id = ? ${includeArchived ? "" : "AND r.archived_at IS NULL"}
      LIMIT 1`,
    [companyId, recordId],
  );

export const listOfficialRecords = async (
  env: Env,
  companyId: string,
  filters: { employee_id?: string; status?: string; page: number; page_size: number; include_archived?: boolean },
  visibilitySql?: string,
  visibilityValues: unknown[] = [],
) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!filters.include_archived) clauses.push("r.archived_at IS NULL");
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (visibilitySql) {
    clauses.push(`(${visibilitySql})`);
    values.push(...visibilityValues);
  }
  const where = clauses.join(" AND ");
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM employee_disciplinary_records r WHERE ${where}`, values);
  const rows = await many<DisciplinaryRecord & Record<string, unknown>>(
    env,
    `${selectRecord}
      WHERE ${where}
      ORDER BY r.applied_at DESC, r.created_at DESC
      LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: total?.total ?? 0 };
};

export const createOfficialRecord = (env: Env, input: {
  id: string;
  companyId: string;
  request: DisciplinaryActionRequestRecord;
  actorUserId: string;
  outcome: string;
}) => {
  const now = nowIso();
  return run(
    env,
    `INSERT INTO employee_disciplinary_records (
      id, company_id, employee_id, source_request_id, action_type, severity, incident_date,
      title, summary, outcome, policy_reference, effective_date, expiry_date,
      acknowledgement_required, status, applied_at, applied_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.request.employee_id,
      input.request.id,
      input.request.action_type ?? "GENERAL_DISCIPLINARY_ACTION",
      input.request.severity,
      input.request.incident_date,
      input.request.title,
      input.request.summary,
      input.outcome,
      input.request.policy_reference,
      now.slice(0, 10),
      null,
      input.request.acknowledgement_required,
      now,
      input.actorUserId,
      now,
      now,
    ],
  );
};

export const updateOfficialRecordAcknowledgement = (env: Env, companyId: string, sourceRequestId: string, input: {
  actorUserId: string;
  status: string;
}) =>
  run(
    env,
    `UPDATE employee_disciplinary_records
        SET acknowledged_at = COALESCE(acknowledged_at, ?),
            acknowledged_by = COALESCE(acknowledged_by, ?),
            status = ?,
            updated_at = ?
      WHERE company_id = ? AND source_request_id = ? AND archived_at IS NULL`,
    [nowIso(), input.actorUserId, input.status, nowIso(), companyId, sourceRequestId],
  );

export const updateOfficialRecordStatus = (env: Env, companyId: string, sourceRequestId: string, status: string) =>
  run(
    env,
    `UPDATE employee_disciplinary_records
        SET status = ?, updated_at = ?
      WHERE company_id = ? AND source_request_id = ? AND archived_at IS NULL`,
    [status, nowIso(), companyId, sourceRequestId],
  );

export const listTasks = (env: Env, companyId: string, requestId: string) =>
  many<DisciplinaryFollowUpTaskRecord>(
    env,
    `SELECT * FROM employee_disciplinary_follow_up_tasks
      WHERE company_id = ? AND disciplinary_action_request_id = ?
      ORDER BY required DESC, task_type ASC, created_at ASC`,
    [companyId, requestId],
  );

export const countOpenRequiredTasks = async (env: Env, companyId: string, requestId: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM employee_disciplinary_follow_up_tasks
      WHERE company_id = ? AND disciplinary_action_request_id = ? AND required = 1 AND status NOT IN ('COMPLETED','WAIVED')`,
    [companyId, requestId],
  );
  return row?.total ?? 0;
};

export const createFollowUpTasks = async (env: Env, input: {
  companyId: string;
  requestId: string;
  employeeId: string;
  tasks: Array<{
    id: string;
    taskType: string;
    taskName: string;
    ownerResponsibilityType?: string | null;
    ownerDepartmentId?: string | null;
    ownerBusinessFunctionCode?: string | null;
    assignedUserId?: string | null;
    required?: number;
    status?: string | null;
    notes?: string | null;
    metadataJson?: string | null;
  }>;
}) => {
  const now = nowIso();
  await env.DB.batch(input.tasks.map((task) =>
    env.DB.prepare(`INSERT OR IGNORE INTO employee_disciplinary_follow_up_tasks (
      id, company_id, disciplinary_action_request_id, employee_id, task_type, task_name,
      owner_responsibility_type, owner_department_id, owner_business_function_code,
      assigned_user_id, required, status, notes, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        task.id,
        input.companyId,
        input.requestId,
        input.employeeId,
        task.taskType,
        task.taskName,
        task.ownerResponsibilityType ?? null,
        task.ownerDepartmentId ?? null,
        task.ownerBusinessFunctionCode ?? null,
        task.assignedUserId ?? null,
        task.required ?? 1,
        task.status ?? "PENDING",
        task.notes ?? null,
        task.metadataJson ?? null,
        now,
        now,
      ),
  ));
};

export const findTask = (env: Env, companyId: string, requestId: string, taskId: string) =>
  one<DisciplinaryFollowUpTaskRecord>(
    env,
    "SELECT * FROM employee_disciplinary_follow_up_tasks WHERE company_id = ? AND disciplinary_action_request_id = ? AND id = ? LIMIT 1",
    [companyId, requestId, taskId],
  );

export const updateTaskStatus = (env: Env, input: {
  companyId: string;
  requestId: string;
  taskId: string;
  status: string;
  actorUserId: string;
  notes?: string | null;
}) =>
  run(
    env,
    `UPDATE employee_disciplinary_follow_up_tasks
        SET status = ?, completed_at = CASE WHEN ? IN ('COMPLETED','WAIVED') THEN COALESCE(completed_at, ?) ELSE completed_at END,
            completed_by = CASE WHEN ? IN ('COMPLETED','WAIVED') THEN COALESCE(completed_by, ?) ELSE completed_by END,
            notes = COALESCE(?, notes), updated_at = ?
      WHERE company_id = ? AND disciplinary_action_request_id = ? AND id = ?`,
    [input.status, input.status, nowIso(), input.status, input.actorUserId, input.notes ?? null, nowIso(), input.companyId, input.requestId, input.taskId],
  );

export const completeTaskByType = (env: Env, input: {
  companyId: string;
  requestId: string;
  taskType: string;
  actorUserId: string;
  notes?: string | null;
}) =>
  run(
    env,
    `UPDATE employee_disciplinary_follow_up_tasks
        SET status = 'COMPLETED',
            completed_at = COALESCE(completed_at, ?),
            completed_by = COALESCE(completed_by, ?),
            notes = COALESCE(?, notes),
            updated_at = ?
      WHERE company_id = ? AND disciplinary_action_request_id = ? AND task_type = ?
        AND status NOT IN ('COMPLETED','WAIVED','CANCELLED')`,
    [nowIso(), input.actorUserId, input.notes ?? null, nowIso(), input.companyId, input.requestId, input.taskType],
  );

export const listItems = (env: Env, companyId: string, requestId: string) =>
  many<Record<string, unknown>>(
    env,
    `SELECT id, company_id, disciplinary_action_request_id, item_type, title, description,
            file_key, file_name, mime_type, file_size, metadata_json, created_at, updated_at
       FROM employee_disciplinary_action_items
      WHERE company_id = ? AND disciplinary_action_request_id = ?
      ORDER BY created_at ASC`,
    [companyId, requestId],
  );
