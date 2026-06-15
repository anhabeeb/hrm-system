import type {
  EmployeeStructureChangeEmployee,
  EmployeeStructureChangeFilters,
  EmployeeStructureChangeInput,
  EmployeeStructureChangeRequestRecord,
} from "./employee-structure-change.types";

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
  cd.name AS current_department_name, cp.title AS current_position_title,
  rd.name AS requested_department_name, rp.title AS requested_position_title
 FROM employee_structure_change_requests r
 JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
 LEFT JOIN departments cd ON cd.company_id = r.company_id AND cd.id = r.current_department_id
 LEFT JOIN positions cp ON cp.company_id = r.company_id AND cp.id = r.current_position_id
 LEFT JOIN departments rd ON rd.company_id = r.company_id AND rd.id = r.requested_department_id
 LEFT JOIN positions rp ON rp.company_id = r.company_id AND rp.id = r.requested_position_id`;

const buildWhere = (companyId: string, filters: EmployeeStructureChangeFilters, visibilitySql?: string, visibilityValues: unknown[] = []) => {
  const clauses = ["r.company_id = ?", "r.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.operation_type) { clauses.push("r.operation_type = ?"); values.push(filters.operation_type); }
  if (filters.request_type) { clauses.push("r.request_type = ?"); values.push(filters.request_type); }
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (filters.department_id) {
    clauses.push("(r.current_department_id = ? OR r.requested_department_id = ?)");
    values.push(filters.department_id, filters.department_id);
  }
  if (filters.search) {
    clauses.push("(LOWER(e.full_name) LIKE ? OR LOWER(e.employee_code) LIKE ? OR LOWER(r.request_type) LIKE ?)");
    const term = `%${filters.search.toLowerCase()}%`;
    values.push(term, term, term);
  }
  if (visibilitySql) {
    clauses.push(visibilitySql);
    values.push(...visibilityValues);
  }
  return { sql: clauses.join(" AND "), values };
};

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<EmployeeStructureChangeEmployee>(
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
  one<EmployeeStructureChangeEmployee>(
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

export const findDepartment = (env: Env, companyId: string, id: string) =>
  one<{ id: string; name: string; is_active: number; status: string | null; archived_at: string | null; deleted_at: string | null }>(
    env,
    "SELECT id, name, is_active, status, archived_at, deleted_at FROM departments WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, id],
  );

export const findPosition = (env: Env, companyId: string, id: string) =>
  one<{ id: string; title: string; department_id: string | null; level: number; is_active: number; status: string | null; archived_at: string | null; deleted_at: string | null }>(
    env,
    "SELECT id, title, department_id, level, is_active, status, archived_at, deleted_at FROM positions WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, id],
  );

export const findOutlet = (env: Env, companyId: string, id: string) =>
  one<{ id: string; name: string; is_active: number; status: string | null; archived_at: string | null; deleted_at: string | null }>(
    env,
    "SELECT id, name, is_active, status, archived_at, deleted_at FROM outlets WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, id],
  );

export const findLinkedUserForEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string; status: string | null; deleted_at: string | null }>(
    env,
    "SELECT id, status, deleted_at FROM users WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, employeeId],
  );

export const countLevelRoleTemplates = async (env: Env, input: { companyId: string; level: number; departmentId: string; positionId: string }) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
       FROM level_role_templates
      WHERE company_id = ? AND level = ? AND archived_at IS NULL
        AND (department_id IS NULL OR department_id = ?)
        AND (position_id IS NULL OR position_id = ?)
        AND is_default = 1`,
    [input.companyId, input.level, input.departmentId, input.positionId],
  );
  return row?.total ?? 0;
};

export const countRequests = async (env: Env, companyId: string, filters: EmployeeStructureChangeFilters, visibilitySql?: string, visibilityValues: unknown[] = []) => {
  const built = buildWhere(companyId, filters, visibilitySql, visibilityValues);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
       FROM employee_structure_change_requests r
       JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
      WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listRequests = (env: Env, companyId: string, filters: EmployeeStructureChangeFilters, visibilitySql?: string, visibilityValues: unknown[] = []) => {
  const built = buildWhere(companyId, filters, visibilitySql, visibilityValues);
  return many<EmployeeStructureChangeRequestRecord>(
    env,
    `${requestSelect}
      WHERE ${built.sql}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<EmployeeStructureChangeRequestRecord>(
    env,
    `${requestSelect} WHERE r.company_id = ? AND r.id = ? AND r.archived_at IS NULL LIMIT 1`,
    [companyId, id],
  );

export const listRequestItems = (env: Env, companyId: string, requestId: string) =>
  many<{ id: string; company_id: string; request_id: string; field_name: string; previous_value: string | null; requested_value: string | null; created_at: string }>(
    env,
    `SELECT id, company_id, request_id, field_name, previous_value, requested_value, created_at
       FROM employee_structure_change_request_items
      WHERE company_id = ? AND request_id = ?
      ORDER BY created_at ASC, field_name ASC`,
    [companyId, requestId],
  );

export const findDuplicatePendingRequest = (env: Env, input: { companyId: string; employeeId: string; requestType: string }) =>
  one<EmployeeStructureChangeRequestRecord>(
    env,
    `SELECT * FROM employee_structure_change_requests
      WHERE company_id = ? AND employee_id = ? AND request_type = ?
        AND status NOT IN ('APPLIED', 'REJECTED', 'CANCELLED', 'FAILED_TO_APPLY')
        AND archived_at IS NULL
      LIMIT 1`,
    [input.companyId, input.employeeId, input.requestType],
  );

export const createRequest = async (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  requesterEmployeeId: string | null;
  subject: EmployeeStructureChangeEmployee;
  payload: EmployeeStructureChangeInput & {
    requested_level: number | null;
    current_department_id: string | null;
    current_position_id: string | null;
    current_level: number | null;
    current_outlet_id: string | null;
  };
  items: Array<{ field: string; previousValue: string | number | null; requestedValue: string | number | null }>;
}) => {
  const now = nowIso();
  const statements = [
    env.DB.prepare(`INSERT INTO employee_structure_change_requests (
      id, company_id, employee_id, requester_employee_id, requester_user_id, operation_type, request_type,
      current_department_id, current_position_id, current_level, current_outlet_id,
      requested_department_id, requested_position_id, requested_level, requested_outlet_id, requested_store_id,
      requested_reporting_manager_employee_id, requested_department_head_employee_id, apply_role_template,
      effective_date, reason, status, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`).bind(
      input.id,
      input.companyId,
      input.subject.id,
      input.requesterEmployeeId,
      input.actorUserId,
      input.payload.operation_type,
      input.payload.request_type,
      input.payload.current_department_id,
      input.payload.current_position_id,
      input.payload.current_level,
      input.payload.current_outlet_id,
      input.payload.requested_department_id ?? null,
      input.payload.requested_position_id ?? null,
      input.payload.requested_level,
      input.payload.requested_outlet_id ?? null,
      input.payload.requested_store_id ?? null,
      input.payload.requested_reporting_manager_employee_id ?? null,
      input.payload.requested_department_head_employee_id ?? null,
      input.payload.apply_role_template ? 1 : 0,
      input.payload.effective_date ?? null,
      input.payload.reason,
      now,
      now,
      input.actorUserId,
      input.actorUserId,
    ),
    ...input.items.map((item) => env.DB.prepare(`INSERT INTO employee_structure_change_request_items (
      id, company_id, request_id, field_name, previous_value, requested_value, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      input.companyId,
      input.id,
      item.field,
      item.previousValue == null ? null : String(item.previousValue),
      item.requestedValue == null ? null : String(item.requestedValue),
      now,
    )),
  ];
  await env.DB.batch(statements);
};

export const updateRequest = (env: Env, companyId: string, id: string, patch: Record<string, unknown>) => {
  const entries = Object.entries(patch);
  if (entries.length === 0) return Promise.resolve();
  const sets = entries.map(([key]) => `${key} = ?`);
  return run(env, `UPDATE employee_structure_change_requests SET ${sets.join(", ")}, updated_at = ? WHERE company_id = ? AND id = ?`, [
    ...entries.map(([, value]) => value),
    nowIso(),
    companyId,
    id,
  ]);
};

export const applyApprovedStructureChange = async (env: Env, input: {
  companyId: string;
  request: EmployeeStructureChangeRequestRecord;
  actorUserId: string;
  reason: string | null;
  markApplied?: boolean;
}) => {
  const now = nowIso();
  const newDepartmentId = input.request.requested_department_id ?? input.request.current_department_id;
  const newPositionId = input.request.requested_position_id ?? input.request.current_position_id;
  const newLevel = input.request.requested_level ?? input.request.current_level;
  const newOutletId = input.request.requested_outlet_id ?? input.request.current_outlet_id;
  const structureChanged =
    (newDepartmentId ?? null) !== (input.request.current_department_id ?? null) ||
    (newPositionId ?? null) !== (input.request.current_position_id ?? null) ||
    (newLevel ?? null) !== (input.request.current_level ?? null) ||
    (newOutletId ?? null) !== (input.request.current_outlet_id ?? null);
  if (structureChanged && (!newDepartmentId || !newPositionId || newLevel == null)) throw new Error("Employee structure target is incomplete.");
  const statements: D1PreparedStatement[] = [];
  if (structureChanged) {
    statements.push(
      env.DB.prepare("UPDATE employee_structure_history SET effective_to = ? WHERE company_id = ? AND employee_id = ? AND effective_to IS NULL")
        .bind(now, input.companyId, input.request.employee_id),
      env.DB.prepare(`UPDATE employees
        SET department_id = ?, position_id = ?, level = ?,
            primary_outlet_id = COALESCE(?, primary_outlet_id),
            structure_updated_at = ?, structure_updated_by = ?, updated_at = ?, updated_by = ?
      WHERE company_id = ? AND id = ?`)
        .bind(newDepartmentId, newPositionId, newLevel, input.request.requested_outlet_id ?? null, now, input.actorUserId, now, input.actorUserId, input.companyId, input.request.employee_id),
      env.DB.prepare(`INSERT INTO employee_structure_history (
      id, company_id, employee_id, previous_department_id, previous_position_id, previous_level,
      new_department_id, new_position_id, new_level, reason, effective_from, effective_to, changed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
        .bind(crypto.randomUUID(), input.companyId, input.request.employee_id, input.request.current_department_id, input.request.current_position_id, input.request.current_level, newDepartmentId, newPositionId, newLevel, input.reason, input.request.effective_date ?? now, input.actorUserId, now),
    );
  }
  if (input.request.requested_department_head_employee_id && newDepartmentId) {
    statements.push(env.DB.prepare("UPDATE departments SET head_employee_id = ?, updated_at = ?, updated_by = ? WHERE company_id = ? AND id = ?")
      .bind(input.request.requested_department_head_employee_id, now, input.actorUserId, input.companyId, newDepartmentId));
  }
  if (input.markApplied !== false) {
    statements.push(
      env.DB.prepare(`UPDATE employee_structure_change_requests
        SET status = 'APPLIED', applied_at = ?, applied_by = ?, updated_at = ?, updated_by = ?
      WHERE company_id = ? AND id = ?`)
        .bind(now, input.actorUserId, now, input.actorUserId, input.companyId, input.request.id),
    );
  }
  await env.DB.batch(statements);
};
