import type {
  AccessLevelRecord,
  EmployeeStructureHistoryRecord,
  EmployeeStructureRecord,
  LevelRoleTemplateFilters,
  LevelRoleTemplateInput,
  LevelRoleTemplateRecord,
} from "./employee-structure.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

export const listAccessLevels = (env: Env, companyId: string): Promise<AccessLevelRecord[]> =>
  many<AccessLevelRecord>(
    env,
    `SELECT * FROM access_levels
      WHERE is_active = 1 AND (company_id IS NULL OR company_id = ?)
      ORDER BY level ASC`,
    [companyId],
  );

const templateWhere = (companyId: string, filters: LevelRoleTemplateFilters) => {
  const clauses = ["t.company_id = ?", "t.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.level) { clauses.push("t.level = ?"); values.push(filters.level); }
  if (filters.department_id) { clauses.push("t.department_id = ?"); values.push(filters.department_id); }
  if (filters.position_id) { clauses.push("t.position_id = ?"); values.push(filters.position_id); }
  if (filters.role_id) { clauses.push("t.role_id = ?"); values.push(filters.role_id); }
  return { sql: clauses.join(" AND "), values };
};

const templateSelect = `SELECT t.*, d.name AS department_name, p.title AS position_title,
  r.role_name, r.role_key
 FROM level_role_templates t
 LEFT JOIN departments d ON d.company_id = t.company_id AND d.id = t.department_id
 LEFT JOIN positions p ON p.company_id = t.company_id AND p.id = t.position_id
 JOIN roles r ON r.company_id = t.company_id AND r.id = t.role_id`;

export const countLevelRoleTemplates = async (env: Env, companyId: string, filters: LevelRoleTemplateFilters) => {
  const built = templateWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM level_role_templates t WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listLevelRoleTemplates = (env: Env, companyId: string, filters: LevelRoleTemplateFilters) => {
  const built = templateWhere(companyId, filters);
  return many<LevelRoleTemplateRecord>(
    env,
    `${templateSelect}
      WHERE ${built.sql}
      ORDER BY t.level ASC, d.name ASC, p.title ASC, r.role_name ASC
      LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findLevelRoleTemplateById = (env: Env, companyId: string, id: string) =>
  one<LevelRoleTemplateRecord>(env, `${templateSelect} WHERE t.company_id = ? AND t.id = ? LIMIT 1`, [companyId, id]);

export const findDuplicateTemplate = (env: Env, companyId: string, input: LevelRoleTemplateInput, currentId?: string) =>
  one<LevelRoleTemplateRecord>(
    env,
    `SELECT * FROM level_role_templates
      WHERE company_id = ? AND level = ? AND COALESCE(department_id, '') = COALESCE(?, '')
        AND COALESCE(position_id, '') = COALESCE(?, '') AND role_id = ?
        AND archived_at IS NULL AND (? IS NULL OR id <> ?)
      LIMIT 1`,
    [companyId, input.level, input.department_id ?? null, input.position_id ?? null, input.role_id, currentId ?? null, currentId ?? null],
  );

export const createLevelRoleTemplate = (env: Env, id: string, companyId: string, input: LevelRoleTemplateInput, actorId: string) =>
  run(
    env,
    `INSERT INTO level_role_templates (
      id, company_id, level, department_id, position_id, role_id, is_default,
      is_required, created_at, updated_at, created_by, updated_by, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id, companyId, input.level, input.department_id ?? null, input.position_id ?? null, input.role_id,
      input.is_default === false ? 0 : 1, input.is_required ? 1 : 0,
      new Date().toISOString(), new Date().toISOString(), actorId, actorId,
    ],
  );

export const updateLevelRoleTemplate = (env: Env, companyId: string, id: string, input: LevelRoleTemplateInput, actorId: string) =>
  run(
    env,
    `UPDATE level_role_templates
        SET level = ?, department_id = ?, position_id = ?, role_id = ?, is_default = ?,
            is_required = ?, updated_at = ?, updated_by = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.level, input.department_id ?? null, input.position_id ?? null, input.role_id,
      input.is_default === false ? 0 : 1, input.is_required ? 1 : 0,
      new Date().toISOString(), actorId, companyId, id,
    ],
  );

export const archiveLevelRoleTemplate = (env: Env, companyId: string, id: string, actorId: string) =>
  run(env, "UPDATE level_role_templates SET archived_at = ?, updated_at = ?, updated_by = ? WHERE company_id = ? AND id = ?", [
    new Date().toISOString(), new Date().toISOString(), actorId, companyId, id,
  ]);

export const findDepartment = (env: Env, companyId: string, id: string) =>
  one<{ id: string; name: string; status: string; is_active: number; archived_at: string | null }>(
    env,
    "SELECT id, name, status, is_active, archived_at FROM departments WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, id],
  );

export const findPosition = (env: Env, companyId: string, id: string) =>
  one<{ id: string; title: string; department_id: string | null; level: number; status: string; is_active: number; archived_at: string | null }>(
    env,
    "SELECT id, title, department_id, level, status, is_active, archived_at FROM positions WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, id],
  );

export const findRole = (env: Env, companyId: string, id: string) =>
  one<{ id: string; role_name: string; role_key: string; is_active: number }>(
    env,
    "SELECT id, role_name, role_key, is_active FROM roles WHERE company_id = ? AND id = ? AND is_active = 1 LIMIT 1",
    [companyId, id],
  );

export const findEmployeeStructure = (env: Env, companyId: string, employeeId: string): Promise<EmployeeStructureRecord | null> =>
  one<EmployeeStructureRecord>(
    env,
    `SELECT e.id AS employee_id, e.employee_code, e.full_name, e.primary_outlet_id,
            e.department_id, d.name AS department_name, e.position_id, p.title AS position_title,
            e.level, e.structure_updated_at, e.structure_updated_by, u.id AS linked_user_id
       FROM employees e
       LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
       LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
       LEFT JOIN users u ON u.company_id = e.company_id AND u.employee_id = e.id AND u.deleted_at IS NULL
      WHERE e.company_id = ? AND e.id = ? AND e.deleted_at IS NULL
      LIMIT 1`,
    [companyId, employeeId],
  );

export const updateEmployeeStructure = (
  env: Env,
  companyId: string,
  employeeId: string,
  input: { departmentId: string; positionId: string; level: number; actorId: string },
) =>
  run(
    env,
    `UPDATE employees
        SET department_id = ?, position_id = ?, level = ?, structure_updated_at = ?, structure_updated_by = ?, updated_at = ?, updated_by = ?
      WHERE company_id = ? AND id = ?`,
    [input.departmentId, input.positionId, input.level, new Date().toISOString(), input.actorId, new Date().toISOString(), input.actorId, companyId, employeeId],
  );

export const closeOpenStructureHistory = (env: Env, companyId: string, employeeId: string, effectiveTo: string) =>
  run(
    env,
    "UPDATE employee_structure_history SET effective_to = ? WHERE company_id = ? AND employee_id = ? AND effective_to IS NULL",
    [effectiveTo, companyId, employeeId],
  );

export const createStructureHistory = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    previousDepartmentId: string | null;
    previousPositionId: string | null;
    previousLevel: number | null;
    newDepartmentId: string;
    newPositionId: string;
    newLevel: number;
    reason: string | null;
    effectiveFrom: string;
    changedBy: string;
  },
) =>
  run(
    env,
    `INSERT INTO employee_structure_history (
      id, company_id, employee_id, previous_department_id, previous_position_id, previous_level,
      new_department_id, new_position_id, new_level, reason, effective_from, effective_to, changed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      input.id, input.companyId, input.employeeId, input.previousDepartmentId, input.previousPositionId,
      input.previousLevel, input.newDepartmentId, input.newPositionId, input.newLevel, input.reason,
      input.effectiveFrom, input.changedBy, new Date().toISOString(),
    ],
  );

export const listStructureHistory = (env: Env, companyId: string, employeeId: string) =>
  many<EmployeeStructureHistoryRecord>(
    env,
    `SELECT h.*, pd.name AS previous_department_name, pp.title AS previous_position_title,
            nd.name AS new_department_name, np.title AS new_position_title, u.full_name AS changed_by_name
       FROM employee_structure_history h
       LEFT JOIN departments pd ON pd.company_id = h.company_id AND pd.id = h.previous_department_id
       LEFT JOIN positions pp ON pp.company_id = h.company_id AND pp.id = h.previous_position_id
       LEFT JOIN departments nd ON nd.company_id = h.company_id AND nd.id = h.new_department_id
       LEFT JOIN positions np ON np.company_id = h.company_id AND np.id = h.new_position_id
       LEFT JOIN users u ON u.company_id = h.company_id AND u.id = h.changed_by
      WHERE h.company_id = ? AND h.employee_id = ?
      ORDER BY h.effective_from DESC, h.created_at DESC
      LIMIT 100`,
    [companyId, employeeId],
  );

export const findTemplatesForStructure = (env: Env, companyId: string, input: { level: number; departmentId: string; positionId: string }) =>
  many<LevelRoleTemplateRecord>(
    env,
    `${templateSelect}
      WHERE t.company_id = ? AND t.archived_at IS NULL AND t.level = ?
        AND (
          (t.department_id IS NULL AND t.position_id IS NULL)
          OR (t.department_id = ? AND t.position_id IS NULL)
          OR (t.position_id = ?)
        )
      ORDER BY CASE WHEN t.position_id IS NOT NULL THEN 1 WHEN t.department_id IS NOT NULL THEN 2 ELSE 3 END`,
    [companyId, input.level, input.departmentId, input.positionId],
  );

export const getUserRoleIds = (env: Env, companyId: string, userId: string) =>
  many<{ role_id: string }>(env, "SELECT role_id FROM user_roles WHERE company_id = ? AND user_id = ?", [companyId, userId]);

export const addUserRoles = async (env: Env, companyId: string, userId: string, roleIds: string[]) => {
  if (roleIds.length === 0) return;
  const now = new Date().toISOString();
  await env.DB.batch(roleIds.map((roleId) =>
    env.DB.prepare("INSERT OR IGNORE INTO user_roles (id, company_id, user_id, role_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), companyId, userId, roleId, now),
  ));
};
