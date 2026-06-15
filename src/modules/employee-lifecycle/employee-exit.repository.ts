import type {
  EmployeeExitEmployee,
  EmployeeExitFilters,
  EmployeeExitRequestInput,
  EmployeeExitRequestRecord,
  EmployeeExitTaskRecord,
} from "./employee-exit.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();
const nowIso = () => new Date().toISOString();

const requestSelect = `SELECT r.*,
  e.full_name AS employee_name, e.employee_code AS employee_code,
  d.name AS department_name, p.title AS position_title
 FROM employee_exit_requests r
 JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
 LEFT JOIN departments d ON d.company_id = r.company_id AND d.id = r.department_id
 LEFT JOIN positions p ON p.company_id = r.company_id AND p.id = r.position_id`;

const buildWhere = (companyId: string, filters: EmployeeExitFilters, visibilitySql?: string, visibilityValues: unknown[] = []) => {
  const clauses = ["r.company_id = ?", "r.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.operation_type) { clauses.push("r.operation_type = ?"); values.push(filters.operation_type); }
  if (filters.request_type) { clauses.push("r.request_type = ?"); values.push(filters.request_type); }
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (filters.department_id) { clauses.push("r.department_id = ?"); values.push(filters.department_id); }
  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    clauses.push("(LOWER(e.full_name) LIKE ? OR LOWER(e.employee_code) LIKE ? OR LOWER(r.request_type) LIKE ? OR LOWER(r.operation_type) LIKE ?)");
    values.push(term, term, term, term);
  }
  if (visibilitySql) {
    clauses.push(visibilitySql);
    values.push(...visibilityValues);
  }
  return { sql: clauses.join(" AND "), values };
};

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<EmployeeExitEmployee>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.company_id, e.primary_outlet_id,
            e.department_id, d.name AS department_name, e.position_id, p.title AS position_title,
            e.level, e.employment_status, e.archived_at, e.deleted_at
       FROM employees e
       LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
       LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
      WHERE e.company_id = ? AND e.id = ? AND e.deleted_at IS NULL
      LIMIT 1`,
    [companyId, employeeId],
  );

export const findEmployeeByUserId = (env: Env, companyId: string, userId: string) =>
  one<EmployeeExitEmployee>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.company_id, e.primary_outlet_id,
            e.department_id, d.name AS department_name, e.position_id, p.title AS position_title,
            e.level, e.employment_status, e.archived_at, e.deleted_at
       FROM employees e
       JOIN users u ON u.company_id = e.company_id AND u.employee_id = e.id AND u.deleted_at IS NULL
       LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
       LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
      WHERE e.company_id = ? AND u.id = ? AND e.deleted_at IS NULL
      LIMIT 1`,
    [companyId, userId],
  );

export const findLinkedUsersForEmployee = (env: Env, companyId: string, employeeId: string) =>
  many<{ id: string; status: string | null }>(
    env,
    "SELECT id, status FROM users WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL",
    [companyId, employeeId],
  );

export const countActiveSuperAdmins = async (env: Env, companyId: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
       JOIN roles r ON r.company_id = u.company_id AND r.id = ur.role_id
      WHERE u.company_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
        AND r.role_key = 'super_admin' AND r.is_active = 1`,
    [companyId],
  );
  return row?.total ?? 0;
};

export const employeeHasActiveSuperAdminUser = async (env: Env, companyId: string, employeeId: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
       JOIN roles r ON r.company_id = u.company_id AND r.id = ur.role_id
      WHERE u.company_id = ? AND u.employee_id = ? AND u.status = 'active' AND u.deleted_at IS NULL
        AND r.role_key = 'super_admin' AND r.is_active = 1`,
    [companyId, employeeId],
  );
  return (row?.total ?? 0) > 0;
};

export const countRequests = async (env: Env, companyId: string, filters: EmployeeExitFilters, visibilitySql?: string, visibilityValues: unknown[] = []) => {
  const built = buildWhere(companyId, filters, visibilitySql, visibilityValues);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
       FROM employee_exit_requests r
       JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
      WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listRequests = (env: Env, companyId: string, filters: EmployeeExitFilters, visibilitySql?: string, visibilityValues: unknown[] = []) => {
  const built = buildWhere(companyId, filters, visibilitySql, visibilityValues);
  return many<EmployeeExitRequestRecord>(
    env,
    `${requestSelect}
      WHERE ${built.sql}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<EmployeeExitRequestRecord>(
    env,
    `${requestSelect} WHERE r.company_id = ? AND r.id = ? AND r.archived_at IS NULL LIMIT 1`,
    [companyId, id],
  );

export const findDuplicateActiveRequest = (env: Env, input: { companyId: string; employeeId: string; operationType: string; requestType: string }) =>
  one<EmployeeExitRequestRecord>(
    env,
    `SELECT * FROM employee_exit_requests
      WHERE company_id = ? AND employee_id = ? AND operation_type = ? AND request_type = ?
        AND status IN (
          'DRAFT','PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW',
          'PENDING_FINAL_APPROVAL','PENDING_CLEARANCE','PENDING_FINAL_SETTLEMENT',
          'PENDING_ACCESS_DISABLE','PENDING_APPLICATION','PENDING_MANUAL_REVIEW',
          'APPROVED','APPROVED_PENDING_LAST_WORKING_DATE','NOTICE_PERIOD','OFFBOARDING_IN_PROGRESS','CLEARED'
        )
        AND archived_at IS NULL
      LIMIT 1`,
    [input.companyId, input.employeeId, input.operationType, input.requestType],
  );

export const createRequest = async (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  requesterEmployeeId: string | null;
  subject: EmployeeExitEmployee;
  payload: EmployeeExitRequestInput;
}) => {
  const now = nowIso();
  await run(
    env,
    `INSERT INTO employee_exit_requests (
      id, company_id, employee_id, requester_employee_id, requester_user_id,
      department_id, position_id, level, outlet_id, store_id, manager_employee_id,
      request_type, operation_type, reason, resignation_date, requested_last_working_date,
      approved_last_working_date, notice_period_days, notice_waiver_requested,
      notice_waiver_approved, exit_interview_required, final_settlement_required,
      access_disable_required, handover_required, employee_note, status,
      final_settlement_status, access_disable_status, handover_status,
      offboarding_checklist_status, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT',
      'PENDING', 'PENDING', 'PENDING', 'NOT_GENERATED', ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.subject.id,
      input.requesterEmployeeId,
      input.actorUserId,
      input.subject.department_id,
      input.subject.position_id,
      input.subject.level,
      input.subject.primary_outlet_id,
      input.subject.primary_outlet_id,
      null,
      input.payload.request_type,
      input.payload.operation_type ?? "RESIGNATION",
      input.payload.reason,
      input.payload.resignation_date ?? null,
      input.payload.requested_last_working_date ?? null,
      input.payload.approved_last_working_date ?? null,
      input.payload.notice_period_days ?? null,
      input.payload.notice_waiver_requested ? 1 : 0,
      input.payload.notice_waiver_approved ? 1 : 0,
      input.payload.exit_interview_required ? 1 : 0,
      input.payload.final_settlement_required === false ? 0 : 1,
      input.payload.access_disable_required === false ? 0 : 1,
      input.payload.handover_required ? 1 : 0,
      input.payload.employee_note ?? null,
      now,
      now,
      input.actorUserId,
      input.actorUserId,
    ],
  );
};

export const updateRequest = async (env: Env, companyId: string, id: string, patch: Record<string, unknown>) => {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  const sets = entries.map(([key]) => `${key} = ?`).join(", ");
  await run(env, `UPDATE employee_exit_requests SET ${sets}, updated_at = ? WHERE company_id = ? AND id = ?`, [
    ...entries.map(([, value]) => value),
    nowIso(),
    companyId,
    id,
  ]);
};

export const listTasks = (env: Env, companyId: string, requestId: string) =>
  many<EmployeeExitTaskRecord>(
    env,
    `SELECT * FROM employee_offboarding_tasks
      WHERE company_id = ? AND exit_request_id = ?
      ORDER BY required DESC, task_type ASC, created_at ASC`,
    [companyId, requestId],
  );

export const findTask = (env: Env, companyId: string, requestId: string, taskId: string) =>
  one<EmployeeExitTaskRecord>(
    env,
    "SELECT * FROM employee_offboarding_tasks WHERE company_id = ? AND exit_request_id = ? AND id = ? LIMIT 1",
    [companyId, requestId, taskId],
  );

export const countTasksForRequest = async (env: Env, companyId: string, requestId: string) => {
  const row = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM employee_offboarding_tasks WHERE company_id = ? AND exit_request_id = ?",
    [companyId, requestId],
  );
  return row?.total ?? 0;
};

export const createDefaultTasks = async (env: Env, input: {
  companyId: string;
  requestId: string;
  employeeId: string;
  actorUserId: string;
  tasks: Array<{
    id: string;
    taskCode: string;
    taskName: string;
    taskType: string;
    required: number;
    status?: string | null;
    notes?: string | null;
    ownerResponsibilityType?: string | null;
    ownerDepartmentId?: string | null;
    ownerBusinessFunctionCode?: string | null;
    assignedUserId?: string | null;
    metadataJson?: string | null;
  }>;
}) => {
  const now = nowIso();
  await env.DB.batch(input.tasks.map((task) =>
    env.DB.prepare(`INSERT OR IGNORE INTO employee_offboarding_tasks (
      id, company_id, offboarding_case_id, exit_request_id, employee_id,
      task_code, task_name, task_type, title, description, status, required,
      owner_responsibility_type, owner_department_id, owner_business_function_code,
      assigned_user_id, notes, metadata_json, source_type, source_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'employee_exit_request', ?, ?, ?)`)
      .bind(
        task.id,
        input.companyId,
        input.requestId,
        input.requestId,
        input.employeeId,
        task.taskCode,
        task.taskName,
        task.taskType,
        task.taskName,
        `Generated from ${input.requestId}`,
        task.status ?? "PENDING",
        task.required,
        task.ownerResponsibilityType ?? null,
        task.ownerDepartmentId ?? null,
        task.ownerBusinessFunctionCode ?? null,
        task.assignedUserId ?? null,
        task.notes ?? null,
        task.metadataJson ?? null,
        input.requestId,
        now,
        now,
      ),
  ));
};

export const updateTaskStatus = (env: Env, input: { companyId: string; requestId: string; taskId: string; status: string; actorUserId: string; notes?: string | null }) =>
  run(
    env,
    `UPDATE employee_offboarding_tasks
        SET status = ?, completed_by = ?, completed_at = ?, notes = COALESCE(?, notes), updated_at = ?
      WHERE company_id = ? AND exit_request_id = ? AND id = ?`,
    [input.status, input.actorUserId, nowIso(), input.notes ?? null, nowIso(), input.companyId, input.requestId, input.taskId],
  );

export const countOpenRequiredTasks = async (env: Env, companyId: string, requestId: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
       FROM employee_offboarding_tasks
      WHERE company_id = ? AND exit_request_id = ? AND required = 1
        AND status NOT IN ('COMPLETED', 'WAIVED')`,
    [companyId, requestId],
  );
  return row?.total ?? 0;
};

export const applyEmployeeExitStatus = async (env: Env, input: {
  companyId: string;
  request: EmployeeExitRequestRecord;
  actorUserId: string;
  newStatus: string;
  disableLogin: boolean;
  reason: string;
  statusHistoryId: string;
}) => {
  const now = nowIso();
  const linkedUsers = await findLinkedUsersForEmployee(env, input.companyId, input.request.employee_id);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE employees
          SET employment_status = ?, resigned_at = COALESCE(?, resigned_at), terminated_at = CASE WHEN ? = 'terminated' THEN ? ELSE terminated_at END,
              updated_by = ?, updated_at = ?
        WHERE company_id = ? AND id = ?`,
    ).bind(
      input.newStatus,
      input.request.approved_last_working_date ?? input.request.requested_last_working_date ?? now.slice(0, 10),
      input.newStatus,
      input.request.approved_last_working_date ?? input.request.requested_last_working_date ?? now.slice(0, 10),
      input.actorUserId,
      now,
      input.companyId,
      input.request.employee_id,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO employee_exit_status_history (
        id, company_id, employee_id, exit_request_id, previous_status, new_status,
        previous_login_status, new_login_status, effective_at, changed_by, reason, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.statusHistoryId,
      input.companyId,
      input.request.employee_id,
      input.request.id,
      null,
      input.newStatus,
      linkedUsers.map((user) => `${user.id}:${user.status ?? "unknown"}`).join(","),
      input.disableLogin ? "disabled" : "unchanged",
      now,
      input.actorUserId,
      input.reason,
      JSON.stringify({ approval_request_id: input.request.approval_request_id, operation_type: input.request.operation_type }),
      now,
    ),
    env.DB.prepare(
      `UPDATE employee_exit_requests
          SET status = ?, applied_at = COALESCE(applied_at, ?), applied_by = COALESCE(applied_by, ?),
              completed_at = CASE WHEN ? = 'COMPLETED' THEN COALESCE(completed_at, ?) ELSE completed_at END,
              completed_by = CASE WHEN ? = 'COMPLETED' THEN COALESCE(completed_by, ?) ELSE completed_by END,
              access_disable_status = ?, execution_note = ?, updated_by = ?, updated_at = ?
        WHERE company_id = ? AND id = ?`,
    ).bind(
      input.newStatus === "resigned" ? "APPLIED" : "COMPLETED",
      now,
      input.actorUserId,
      input.newStatus === "terminated" ? "COMPLETED" : "APPLIED",
      now,
      input.newStatus === "terminated" ? "COMPLETED" : "APPLIED",
      input.actorUserId,
      input.disableLogin ? "DISABLED" : input.request.access_disable_status,
      input.disableLogin ? "Employee lifecycle applied and linked login sessions revoked." : "Employee lifecycle applied without linked login disable.",
      input.actorUserId,
      now,
      input.companyId,
      input.request.id,
    ),
  ];
  if (input.disableLogin) {
    for (const user of linkedUsers) {
      statements.push(env.DB.prepare("UPDATE users SET status = 'disabled', updated_at = ? WHERE company_id = ? AND id = ?").bind(now, input.companyId, user.id));
      statements.push(env.DB.prepare("UPDATE sessions SET revoked_at = ?, revoked_reason = ?, revoked_by = ? WHERE company_id = ? AND user_id = ? AND revoked_at IS NULL").bind(now, "employee_offboarding_completed", input.actorUserId, input.companyId, user.id));
    }
  }
  await env.DB.batch(statements);
};
