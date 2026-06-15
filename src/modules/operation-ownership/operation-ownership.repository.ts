import type {
  BusinessFunctionDepartmentAssignmentRecord,
  BusinessFunctionInput,
  BusinessFunctionRecord,
  FunctionDepartmentAssignmentInput,
  MatrixSummary,
  OperationCatalogInput,
  OperationCatalogRecord,
  OperationResolutionInput,
  OperationResponsibilityInput,
  OperationResponsibilityRecord,
  OwnershipFilters,
} from "./operation-ownership.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();
const nowIso = () => new Date().toISOString();
const page = (filters: OwnershipFilters) => [filters.page_size, (filters.page - 1) * filters.page_size];

const activeClause = "(is_active = 1 AND archived_at IS NULL)";
const responsibilityAliases = (type: string) => {
  if (type === "FINAL_APPROVAL") return ["FINAL_APPROVAL", "FINAL_APPROVER"];
  if (type === "EXECUTION") return ["EXECUTION", "EXECUTOR"];
  if (type === "CONFIGURATION") return ["CONFIGURATION", "CONFIGURATION_OWNER"];
  return [type];
};

const functionWhere = (companyId: string, filters: OwnershipFilters) => {
  const clauses = ["(bf.company_id IS NULL OR bf.company_id = ?)", "bf.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.search) {
    clauses.push("(LOWER(bf.code) LIKE ? OR LOWER(bf.name) LIKE ?)");
    const term = `%${filters.search.toLowerCase()}%`;
    values.push(term, term);
  }
  if (filters.status === "active") clauses.push("bf.is_active = 1");
  if (filters.status === "inactive") clauses.push("bf.is_active = 0");
  return { sql: clauses.join(" AND "), values };
};

const operationWhere = (companyId: string, filters: OwnershipFilters) => {
  const clauses = ["(oc.company_id IS NULL OR oc.company_id = ?)", "oc.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  if (filters.search) {
    clauses.push("(LOWER(oc.operation_code) LIKE ? OR LOWER(oc.operation_name) LIKE ?)");
    const term = `%${filters.search.toLowerCase()}%`;
    values.push(term, term);
  }
  if (filters.module_key) {
    clauses.push("oc.module_key = ?");
    values.push(filters.module_key);
  }
  if (filters.status === "active") clauses.push("oc.is_active = 1");
  if (filters.status === "inactive") clauses.push("oc.is_active = 0");
  return { sql: clauses.join(" AND "), values };
};

const responsibilityWhere = (companyId: string, filters: OwnershipFilters) => {
  const clauses = ["orm.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.operation_code) {
    clauses.push("orm.operation_code = ?");
    values.push(filters.operation_code);
  }
  if (filters.business_function_id) {
    clauses.push("orm.business_function_id = ?");
    values.push(filters.business_function_id);
  }
  if (filters.responsibility_type) {
    clauses.push("orm.responsibility_type = ?");
    values.push(filters.responsibility_type);
  }
  if (filters.status === "active") clauses.push("orm.is_active = 1");
  if (filters.status === "inactive") clauses.push("orm.is_active = 0");
  return { sql: clauses.join(" AND "), values };
};

export const countBusinessFunctions = async (env: Env, companyId: string, filters: OwnershipFilters) => {
  const built = functionWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM business_functions bf WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listBusinessFunctions = (env: Env, companyId: string, filters: OwnershipFilters) => {
  const built = functionWhere(companyId, filters);
  return many<BusinessFunctionRecord>(
    env,
    `SELECT bf.*,
            (SELECT COUNT(*) FROM business_function_department_assignments a
              WHERE a.company_id = ? AND a.business_function_id = bf.id AND a.is_active = 1) AS assignment_count
       FROM business_functions bf
      WHERE ${built.sql}
      ORDER BY bf.is_system_default DESC, bf.name ASC LIMIT ? OFFSET ?`,
    [companyId, ...built.values, ...page(filters)],
  );
};

export const findBusinessFunctionById = (env: Env, companyId: string, id: string) =>
  one<BusinessFunctionRecord>(
    env,
    "SELECT * FROM business_functions WHERE (company_id IS NULL OR company_id = ?) AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findBusinessFunctionByCode = (env: Env, companyId: string, code: string, currentId?: string) =>
  one<BusinessFunctionRecord>(
    env,
    `SELECT * FROM business_functions
      WHERE (company_id IS NULL OR company_id = ?) AND LOWER(code) = LOWER(?) AND archived_at IS NULL
        AND (? IS NULL OR id <> ?)
      ORDER BY CASE WHEN company_id IS NULL THEN 1 ELSE 0 END LIMIT 1`,
    [companyId, code, currentId ?? null, currentId ?? null],
  );

export const createBusinessFunction = (env: Env, id: string, companyId: string, actorId: string, input: BusinessFunctionInput) =>
  run(
    env,
    `INSERT INTO business_functions (
      id, company_id, code, name, description, is_system_default, is_sensitive, is_active,
      archived_at, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.code.trim().toUpperCase(),
      input.name.trim(),
      input.description?.trim() || null,
      input.is_sensitive ? 1 : 0,
      input.is_active === false ? 0 : 1,
      nowIso(),
      nowIso(),
      actorId,
      actorId,
    ],
  );

export const updateBusinessFunction = (env: Env, companyId: string, id: string, actorId: string, input: Partial<BusinessFunctionInput>) =>
  run(
    env,
    `UPDATE business_functions
        SET name = COALESCE(?, name),
            description = ?,
            is_sensitive = COALESCE(?, is_sensitive),
            is_active = COALESCE(?, is_active),
            updated_at = ?,
            updated_by = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.name?.trim() ?? null,
      input.description === undefined ? null : input.description?.trim() || null,
      input.is_sensitive === undefined ? null : input.is_sensitive ? 1 : 0,
      input.is_active === undefined ? null : input.is_active ? 1 : 0,
      nowIso(),
      actorId,
      companyId,
      id,
    ],
  );

export const countFunctionAssignments = async (env: Env, companyId: string, filters: OwnershipFilters) => {
  const clauses = ["a.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.business_function_id) {
    clauses.push("a.business_function_id = ?");
    values.push(filters.business_function_id);
  }
  if (filters.status === "active") clauses.push("a.is_active = 1");
  if (filters.status === "inactive") clauses.push("a.is_active = 0");
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM business_function_department_assignments a WHERE ${clauses.join(" AND ")}`, values);
  return row?.total ?? 0;
};

export const listFunctionAssignments = (env: Env, companyId: string, filters: OwnershipFilters) => {
  const clauses = ["a.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.business_function_id) {
    clauses.push("a.business_function_id = ?");
    values.push(filters.business_function_id);
  }
  if (filters.status === "active") clauses.push("a.is_active = 1");
  if (filters.status === "inactive") clauses.push("a.is_active = 0");
  return many<BusinessFunctionDepartmentAssignmentRecord>(
    env,
    `SELECT a.*, bf.code AS business_function_code, bf.name AS business_function_name,
            d.name AS department_name, d.status AS department_status
       FROM business_function_department_assignments a
       JOIN business_functions bf ON bf.id = a.business_function_id AND (bf.company_id IS NULL OR bf.company_id = a.company_id)
       JOIN departments d ON d.company_id = a.company_id AND d.id = a.department_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY bf.name ASC, a.is_primary DESC, d.name ASC LIMIT ? OFFSET ?`,
    [...values, ...page(filters)],
  );
};

export const findFunctionAssignmentById = (env: Env, companyId: string, id: string) =>
  one<BusinessFunctionDepartmentAssignmentRecord>(env, "SELECT * FROM business_function_department_assignments WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const createFunctionAssignment = (env: Env, id: string, companyId: string, actorId: string, input: FunctionDepartmentAssignmentInput) =>
  run(
    env,
    `INSERT INTO business_function_department_assignments (
      id, company_id, business_function_id, department_id, assignment_type, is_primary, is_active,
      effective_from, effective_to, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.business_function_id,
      input.department_id,
      input.assignment_type ?? "PRIMARY",
      input.is_primary ? 1 : 0,
      input.is_active === false ? 0 : 1,
      input.effective_from ?? null,
      input.effective_to ?? null,
      nowIso(),
      nowIso(),
      actorId,
      actorId,
    ],
  );

export const updateFunctionAssignment = (env: Env, companyId: string, id: string, actorId: string, input: Partial<FunctionDepartmentAssignmentInput>) =>
  run(
    env,
    `UPDATE business_function_department_assignments
        SET business_function_id = COALESCE(?, business_function_id),
            department_id = COALESCE(?, department_id),
            assignment_type = COALESCE(?, assignment_type),
            is_primary = COALESCE(?, is_primary),
            is_active = COALESCE(?, is_active),
            effective_from = ?,
            effective_to = ?,
            updated_at = ?,
            updated_by = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.business_function_id ?? null,
      input.department_id ?? null,
      input.assignment_type ?? null,
      input.is_primary === undefined ? null : input.is_primary ? 1 : 0,
      input.is_active === undefined ? null : input.is_active ? 1 : 0,
      input.effective_from ?? null,
      input.effective_to ?? null,
      nowIso(),
      actorId,
      companyId,
      id,
    ],
  );

export const setFunctionAssignmentStatus = (env: Env, companyId: string, id: string, actorId: string, isActive: boolean, archivedAt?: string | null) =>
  run(env, "UPDATE business_function_department_assignments SET is_active = ?, effective_to = COALESCE(?, effective_to), updated_at = ?, updated_by = ? WHERE company_id = ? AND id = ?", [
    isActive ? 1 : 0,
    archivedAt ?? null,
    nowIso(),
    actorId,
    companyId,
    id,
  ]);

export const countOperations = async (env: Env, companyId: string, filters: OwnershipFilters) => {
  const built = operationWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM operation_catalog oc WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listOperations = (env: Env, companyId: string, filters: OwnershipFilters) => {
  const built = operationWhere(companyId, filters);
  return many<OperationCatalogRecord>(
    env,
    `SELECT oc.*,
            (SELECT COUNT(*) FROM operation_responsibility_matrix orm
              WHERE orm.company_id = ? AND orm.operation_code = oc.operation_code AND orm.is_active = 1) AS responsibility_count
       FROM operation_catalog oc
      WHERE ${built.sql}
      ORDER BY oc.module_key ASC, oc.operation_name ASC LIMIT ? OFFSET ?`,
    [companyId, ...built.values, ...page(filters)],
  );
};

export const findOperationByCode = (env: Env, companyId: string, operationCode: string) =>
  one<OperationCatalogRecord>(
    env,
    `SELECT * FROM operation_catalog
      WHERE (company_id IS NULL OR company_id = ?) AND operation_code = ? AND archived_at IS NULL
      ORDER BY CASE WHEN company_id IS NULL THEN 1 ELSE 0 END LIMIT 1`,
    [companyId, operationCode],
  );

export const findCompanyOperationByCode = (env: Env, companyId: string, operationCode: string) =>
  one<OperationCatalogRecord>(
    env,
    "SELECT * FROM operation_catalog WHERE company_id = ? AND operation_code = ? LIMIT 1",
    [companyId, operationCode],
  );

export const createOperation = (env: Env, id: string, companyId: string, actorId: string, input: OperationCatalogInput) =>
  run(
    env,
    `INSERT INTO operation_catalog (
      id, company_id, operation_code, operation_name, module_key, description,
      default_business_function_code, is_sensitive, requires_final_approval, is_active,
      archived_at, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.operation_code.trim().toUpperCase(),
      input.operation_name.trim(),
      input.module_key.trim(),
      input.description?.trim() || null,
      input.default_business_function_code?.trim().toUpperCase() || null,
      input.is_sensitive ? 1 : 0,
      input.requires_final_approval === false ? 0 : 1,
      input.is_active === false ? 0 : 1,
      nowIso(),
      nowIso(),
      actorId,
      actorId,
    ],
  );

export const updateOperation = (env: Env, companyId: string, operationCode: string, actorId: string, input: Partial<OperationCatalogInput>) =>
  run(
    env,
    `UPDATE operation_catalog
        SET operation_name = COALESCE(?, operation_name),
            module_key = COALESCE(?, module_key),
            description = ?,
            default_business_function_code = ?,
            is_sensitive = COALESCE(?, is_sensitive),
            requires_final_approval = COALESCE(?, requires_final_approval),
            is_active = COALESCE(?, is_active),
            updated_at = ?,
            updated_by = ?
      WHERE company_id = ? AND operation_code = ?`,
    [
      input.operation_name?.trim() ?? null,
      input.module_key?.trim() ?? null,
      input.description === undefined ? null : input.description?.trim() || null,
      input.default_business_function_code ?? null,
      input.is_sensitive === undefined ? null : input.is_sensitive ? 1 : 0,
      input.requires_final_approval === undefined ? null : input.requires_final_approval ? 1 : 0,
      input.is_active === undefined ? null : input.is_active ? 1 : 0,
      nowIso(),
      actorId,
      companyId,
      operationCode,
    ],
  );

export const setBusinessFunctionStatus = (env: Env, companyId: string, id: string, actorId: string, isActive: boolean, archivedAt?: string | null) =>
  run(env, "UPDATE business_functions SET is_active = ?, archived_at = COALESCE(?, archived_at), updated_at = ?, updated_by = ? WHERE company_id = ? AND id = ?", [
    isActive ? 1 : 0,
    archivedAt ?? null,
    nowIso(),
    actorId,
    companyId,
    id,
  ]);

export const setOperationStatus = (env: Env, companyId: string, operationCode: string, actorId: string, isActive: boolean, archivedAt?: string | null) =>
  run(env, "UPDATE operation_catalog SET is_active = ?, archived_at = COALESCE(?, archived_at), updated_at = ?, updated_by = ? WHERE company_id = ? AND operation_code = ?", [
    isActive ? 1 : 0,
    archivedAt ?? null,
    nowIso(),
    actorId,
    companyId,
    operationCode,
  ]);

export const countResponsibilities = async (env: Env, companyId: string, filters: OwnershipFilters) => {
  const built = responsibilityWhere(companyId, filters);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM operation_responsibility_matrix orm WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listResponsibilities = (env: Env, companyId: string, filters: OwnershipFilters) => {
  const built = responsibilityWhere(companyId, filters);
  return many<OperationResponsibilityRecord>(
    env,
    `SELECT orm.*, bf.code AS business_function_code, bf.name AS business_function_name,
            d.name AS department_name, r.role_name, u.username, u.full_name AS user_full_name
       FROM operation_responsibility_matrix orm
       LEFT JOIN business_functions bf ON bf.id = orm.business_function_id AND (bf.company_id IS NULL OR bf.company_id = orm.company_id)
       LEFT JOIN departments d ON d.company_id = orm.company_id AND d.id = orm.department_id
       LEFT JOIN roles r ON r.company_id = orm.company_id AND r.id = orm.role_id
       LEFT JOIN users u ON u.company_id = orm.company_id AND u.id = orm.user_id
      WHERE ${built.sql}
      ORDER BY orm.operation_code ASC, orm.responsibility_type ASC, orm.priority ASC LIMIT ? OFFSET ?`,
    [...built.values, ...page(filters)],
  );
};

export const findResponsibilityById = (env: Env, companyId: string, id: string) =>
  one<OperationResponsibilityRecord>(env, "SELECT * FROM operation_responsibility_matrix WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const findActiveResponsibilities = (env: Env, companyId: string, input: Pick<OperationResolutionInput, "operation_code" | "responsibility_type">) =>
  {
  const types = responsibilityAliases(input.responsibility_type);
  return many<OperationResponsibilityRecord>(
    env,
    `SELECT * FROM operation_responsibility_matrix
      WHERE company_id = ? AND operation_code = ? AND responsibility_type IN (${types.map(() => "?").join(", ")}) AND is_active = 1 AND archived_at IS NULL
        AND (effective_from IS NULL OR effective_from <= ?)
        AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY priority ASC`,
    [companyId, input.operation_code, ...types, nowIso(), nowIso()],
  );
};

export const createResponsibility = (env: Env, id: string, companyId: string, actorId: string, input: OperationResponsibilityInput) =>
  run(
    env,
    `INSERT INTO operation_responsibility_matrix (
      id, company_id, operation_code, responsibility_type, business_function_id,
      department_id, role_id, user_id, permission_key, target_type, min_level, max_level,
      required_permission, required_role_id, requires_approval, use_requester_department,
      use_subject_department, fallback_behavior, priority, is_required, is_active,
      effective_from, effective_to, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.operation_code.trim().toUpperCase(),
      input.responsibility_type,
      input.business_function_id ?? null,
      input.department_id ?? null,
      input.role_id ?? input.required_role_id ?? null,
      input.user_id ?? null,
      input.permission_key ?? input.required_permission ?? null,
      input.target_type,
      input.min_level ?? null,
      input.max_level ?? null,
      input.required_permission ?? input.permission_key ?? null,
      input.required_role_id ?? input.role_id ?? null,
      input.requires_approval ? 1 : 0,
      input.use_requester_department ? 1 : 0,
      input.use_subject_department ? 1 : 0,
      input.fallback_behavior ?? "HOLD_FOR_MANUAL_ASSIGNMENT",
      input.priority ?? 100,
      input.is_required === false ? 0 : 1,
      input.is_active === false ? 0 : 1,
      input.effective_from ?? null,
      input.effective_to ?? null,
      nowIso(),
      nowIso(),
      actorId,
      actorId,
    ],
  );

export const updateResponsibility = (env: Env, companyId: string, id: string, actorId: string, input: Partial<OperationResponsibilityInput>) =>
  run(
    env,
    `UPDATE operation_responsibility_matrix
        SET business_function_id = ?,
            department_id = ?,
            role_id = ?,
            user_id = ?,
            permission_key = ?,
            target_type = COALESCE(?, target_type),
            min_level = ?,
            max_level = ?,
            required_permission = ?,
            required_role_id = ?,
            requires_approval = COALESCE(?, requires_approval),
            use_requester_department = COALESCE(?, use_requester_department),
            use_subject_department = COALESCE(?, use_subject_department),
            fallback_behavior = COALESCE(?, fallback_behavior),
            priority = COALESCE(?, priority),
            is_required = COALESCE(?, is_required),
            is_active = COALESCE(?, is_active),
            effective_from = ?,
            effective_to = ?,
            updated_at = ?,
            updated_by = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.business_function_id ?? null,
      input.department_id ?? null,
      input.role_id ?? input.required_role_id ?? null,
      input.user_id ?? null,
      input.permission_key ?? input.required_permission ?? null,
      input.target_type ?? null,
      input.min_level ?? null,
      input.max_level ?? null,
      input.required_permission ?? input.permission_key ?? null,
      input.required_role_id ?? input.role_id ?? null,
      input.requires_approval === undefined ? null : input.requires_approval ? 1 : 0,
      input.use_requester_department === undefined ? null : input.use_requester_department ? 1 : 0,
      input.use_subject_department === undefined ? null : input.use_subject_department ? 1 : 0,
      input.fallback_behavior ?? null,
      input.priority ?? null,
      input.is_required === undefined ? null : input.is_required ? 1 : 0,
      input.is_active === undefined ? null : input.is_active ? 1 : 0,
      input.effective_from ?? null,
      input.effective_to ?? null,
      nowIso(),
      actorId,
      companyId,
      id,
    ],
  );

export const setResponsibilityStatus = (env: Env, companyId: string, id: string, actorId: string, isActive: boolean, archivedAt?: string | null) =>
  run(env, "UPDATE operation_responsibility_matrix SET is_active = ?, archived_at = COALESCE(?, archived_at), updated_at = ?, updated_by = ? WHERE company_id = ? AND id = ?", [
    isActive ? 1 : 0,
    archivedAt ?? null,
    nowIso(),
    actorId,
    companyId,
    id,
  ]);

export const findDepartment = (env: Env, companyId: string, id: string) =>
  one<{ id: string; name: string; status: string; is_active: number; archived_at: string | null; deleted_at?: string | null }>(
    env,
    "SELECT id, name, status, is_active, archived_at, deleted_at FROM departments WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findEmployeeStructure = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string; department_id: string | null; position_id: string | null; level: number | null; deleted_at: string | null; archived_at: string | null; employment_status: string | null }>(
    env,
    "SELECT id, department_id, position_id, level, deleted_at, archived_at, employment_status FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );

export const findRole = (env: Env, companyId: string, id: string) =>
  one<{ id: string; role_name: string; is_active: number }>(env, "SELECT id, role_name, is_active FROM roles WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const findUser = (env: Env, companyId: string, id: string) =>
  one<{ id: string; username: string; status: string | null; deleted_at: string | null; employee_id: string | null }>(
    env,
    "SELECT id, username, status, deleted_at, employee_id FROM users WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findPrimaryFunctionAssignment = (env: Env, companyId: string, businessFunctionId: string) =>
  one<BusinessFunctionDepartmentAssignmentRecord>(
    env,
    `SELECT a.*, d.name AS department_name, d.status AS department_status
       FROM business_function_department_assignments a
       JOIN departments d ON d.company_id = a.company_id AND d.id = a.department_id
      WHERE a.company_id = ? AND a.business_function_id = ? AND a.is_active = 1
      ORDER BY a.is_primary DESC, a.updated_at DESC LIMIT 1`,
    [companyId, businessFunctionId],
  );

export const getMatrixSummary = async (env: Env, companyId: string): Promise<MatrixSummary> => {
  const [operations, responsibilities, unassigned, sensitiveUnassigned, functions, assignments] = await Promise.all([
    one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM operation_catalog WHERE (company_id IS NULL OR company_id = ?) AND archived_at IS NULL", [companyId]),
    one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM operation_responsibility_matrix WHERE company_id = ? AND is_active = 1", [companyId]),
    one<{ total: number }>(
      env,
      `SELECT COUNT(*) AS total FROM operation_catalog oc
        WHERE (oc.company_id IS NULL OR oc.company_id = ?) AND oc.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM operation_responsibility_matrix orm WHERE orm.company_id = ? AND orm.operation_code = oc.operation_code AND orm.is_active = 1)`,
      [companyId, companyId],
    ),
    one<{ total: number }>(
      env,
      `SELECT COUNT(*) AS total FROM operation_catalog oc
        WHERE (oc.company_id IS NULL OR oc.company_id = ?) AND oc.archived_at IS NULL AND oc.is_sensitive = 1
          AND NOT EXISTS (SELECT 1 FROM operation_responsibility_matrix orm WHERE orm.company_id = ? AND orm.operation_code = oc.operation_code AND orm.is_active = 1)`,
      [companyId, companyId],
    ),
    one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM business_functions WHERE (company_id IS NULL OR company_id = ?) AND archived_at IS NULL", [companyId]),
    one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM business_function_department_assignments WHERE company_id = ? AND is_active = 1", [companyId]),
  ]);
  return {
    operations_total: operations?.total ?? 0,
    active_responsibilities: responsibilities?.total ?? 0,
    unassigned_operations: unassigned?.total ?? 0,
    sensitive_unassigned_operations: sensitiveUnassigned?.total ?? 0,
    business_functions_total: functions?.total ?? 0,
    department_assignments_total: assignments?.total ?? 0,
  };
};

export const listUnassignedOperations = (env: Env, companyId: string) =>
  many<OperationCatalogRecord>(
    env,
    `SELECT * FROM operation_catalog oc
      WHERE (oc.company_id IS NULL OR oc.company_id = ?) AND oc.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM operation_responsibility_matrix orm WHERE orm.company_id = ? AND orm.operation_code = oc.operation_code AND orm.is_active = 1)
      ORDER BY oc.is_sensitive DESC, oc.operation_code ASC`,
    [companyId, companyId],
  );

export const listFunctionsWithoutAssignments = (env: Env, companyId: string) =>
  many<BusinessFunctionRecord>(
    env,
    `SELECT * FROM business_functions bf
      WHERE (bf.company_id IS NULL OR bf.company_id = ?) AND bf.archived_at IS NULL AND bf.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM business_function_department_assignments a WHERE a.company_id = ? AND a.business_function_id = bf.id AND a.is_active = 1)
      ORDER BY bf.code ASC`,
    [companyId, companyId],
  );

export const listOperationsWithoutOwner = (env: Env, companyId: string) =>
  many<OperationCatalogRecord>(
    env,
    `SELECT * FROM operation_catalog oc
      WHERE (oc.company_id IS NULL OR oc.company_id = ?) AND oc.archived_at IS NULL AND oc.is_active = 1
        AND NOT EXISTS (
          SELECT 1 FROM operation_responsibility_matrix orm
          WHERE orm.company_id = ? AND orm.operation_code = oc.operation_code
            AND orm.responsibility_type = 'OWNER' AND orm.is_active = 1 AND orm.archived_at IS NULL
        )
      ORDER BY oc.is_sensitive DESC, oc.operation_code ASC`,
    [companyId, companyId],
  );

export const listSensitiveOperationsWithoutFinalApproval = (env: Env, companyId: string) =>
  many<OperationCatalogRecord>(
    env,
    `SELECT * FROM operation_catalog oc
      WHERE (oc.company_id IS NULL OR oc.company_id = ?) AND oc.archived_at IS NULL AND oc.is_active = 1 AND oc.is_sensitive = 1
        AND NOT EXISTS (
          SELECT 1 FROM operation_responsibility_matrix orm
          WHERE orm.company_id = ? AND orm.operation_code = oc.operation_code
            AND orm.responsibility_type IN ('FINAL_APPROVAL', 'FINAL_APPROVER') AND orm.is_active = 1 AND orm.archived_at IS NULL
        )
      ORDER BY oc.operation_code ASC`,
    [companyId, companyId],
  );

export const listFunctionAssignmentsWithInactiveDepartments = (env: Env, companyId: string) =>
  many<BusinessFunctionDepartmentAssignmentRecord>(
    env,
    `SELECT a.*, bf.code AS business_function_code, bf.name AS business_function_name, d.name AS department_name, d.status AS department_status
       FROM business_function_department_assignments a
       JOIN business_functions bf ON bf.id = a.business_function_id AND (bf.company_id IS NULL OR bf.company_id = a.company_id)
       LEFT JOIN departments d ON d.company_id = a.company_id AND d.id = a.department_id
      WHERE a.company_id = ? AND a.is_active = 1
        AND (d.id IS NULL OR d.is_active = 0 OR d.status IN ('disabled', 'inactive') OR d.archived_at IS NOT NULL OR d.deleted_at IS NOT NULL)
      ORDER BY bf.code ASC`,
    [companyId],
  );

export const listResponsibilitiesWithInactiveDepartments = (env: Env, companyId: string) =>
  many<OperationResponsibilityRecord>(
    env,
    `SELECT orm.*, d.name AS department_name
       FROM operation_responsibility_matrix orm
       LEFT JOIN departments d ON d.company_id = orm.company_id AND d.id = orm.department_id
      WHERE orm.company_id = ? AND orm.is_active = 1 AND orm.archived_at IS NULL AND orm.department_id IS NOT NULL
        AND (d.id IS NULL OR d.is_active = 0 OR d.status IN ('disabled', 'inactive') OR d.archived_at IS NOT NULL OR d.deleted_at IS NOT NULL)
      ORDER BY orm.operation_code ASC`,
    [companyId],
  );

export const listResponsibilitiesWithDisabledUsers = (env: Env, companyId: string) =>
  many<OperationResponsibilityRecord>(
    env,
    `SELECT orm.*, u.username, u.full_name AS user_full_name
       FROM operation_responsibility_matrix orm
       LEFT JOIN users u ON u.company_id = orm.company_id AND u.id = orm.user_id
      WHERE orm.company_id = ? AND orm.is_active = 1 AND orm.archived_at IS NULL AND orm.user_id IS NOT NULL
        AND (u.id IS NULL OR u.deleted_at IS NOT NULL OR COALESCE(u.status, 'active') IN ('disabled', 'inactive'))
      ORDER BY orm.operation_code ASC`,
    [companyId],
  );

export const listResponsibilitiesWithFallbacks = (env: Env, companyId: string) =>
  many<OperationResponsibilityRecord>(
    env,
    `SELECT * FROM operation_responsibility_matrix
      WHERE company_id = ? AND is_active = 1 AND archived_at IS NULL
        AND fallback_behavior IN ('USE_SUPER_ADMIN', 'FALLBACK_TO_SUPER_ADMIN', 'BLOCK_OPERATION', 'BLOCKED')
      ORDER BY operation_code ASC`,
    [companyId],
  );

export const listSensitiveFinalApprovalsWithoutPermission = (env: Env, companyId: string) =>
  many<OperationResponsibilityRecord>(
    env,
    `SELECT orm.*
       FROM operation_responsibility_matrix orm
       JOIN operation_catalog oc ON oc.operation_code = orm.operation_code AND (oc.company_id IS NULL OR oc.company_id = orm.company_id)
      WHERE orm.company_id = ? AND orm.is_active = 1 AND orm.archived_at IS NULL
        AND orm.responsibility_type IN ('FINAL_APPROVAL', 'FINAL_APPROVER')
        AND oc.is_sensitive = 1
        AND COALESCE(orm.required_permission, orm.permission_key) IS NULL
      ORDER BY orm.operation_code ASC`,
    [companyId],
  );

export const listFinalApprovalResponsibilitiesWithoutLevelApprover = (env: Env, companyId: string) =>
  many<OperationResponsibilityRecord>(
    env,
    `SELECT orm.*
       FROM operation_responsibility_matrix orm
      WHERE orm.company_id = ? AND orm.is_active = 1 AND orm.archived_at IS NULL
        AND orm.responsibility_type IN ('FINAL_APPROVAL', 'FINAL_APPROVER')
        AND orm.department_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM employees e
          JOIN users u ON u.company_id = e.company_id AND u.employee_id = e.id AND u.deleted_at IS NULL AND COALESCE(u.status, 'active') = 'active'
          WHERE e.company_id = orm.company_id AND e.department_id = orm.department_id
            AND e.deleted_at IS NULL AND e.archived_at IS NULL AND COALESCE(e.employment_status, 'active') NOT IN ('inactive', 'archived')
            AND e.level BETWEEN COALESCE(orm.min_level, 3) AND COALESCE(orm.max_level, 4)
        )
      ORDER BY orm.operation_code ASC`,
    [companyId],
  );

export const findSuperAdminUser = (env: Env, companyId: string) =>
  one<{ id: string }>(
    env,
    `SELECT u.id
       FROM users u
       JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
       JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
      WHERE u.company_id = ? AND u.deleted_at IS NULL AND COALESCE(u.status, 'active') = 'active' AND r.role_key = 'super_admin'
      LIMIT 1`,
    [companyId],
  );

export const listDepartmentApproversForOperation = (
  env: Env,
  companyId: string,
  departmentId: string,
  input: { permissionKey?: string | null; roleId?: string | null; minLevel?: number | null; maxLevel?: number | null } = {},
) =>
  many<{ user_id: string; employee_id: string | null; full_name: string | null; employee_name: string | null; level: number | null; department_id: string | null }>(
    env,
    `SELECT u.id AS user_id, e.id AS employee_id, u.full_name, e.full_name AS employee_name, e.level, e.department_id
       FROM users u
       LEFT JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id AND e.deleted_at IS NULL
      WHERE u.company_id = ? AND u.deleted_at IS NULL AND COALESCE(u.status, 'active') = 'active'
        AND e.department_id = ?
        AND (? IS NULL OR e.level >= ?)
        AND (? IS NULL OR e.level <= ?)
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM user_roles ur_role
          WHERE ur_role.company_id = u.company_id AND ur_role.user_id = u.id AND ur_role.role_id = ?
        ))
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.company_id = ur.company_id AND rp.role_id = ur.role_id
          WHERE ur.company_id = u.company_id AND ur.user_id = u.id AND rp.permission_key = ?
        ))
      ORDER BY e.level DESC, u.full_name ASC LIMIT 25`,
    [
      companyId,
      departmentId,
      input.minLevel ?? null,
      input.minLevel ?? null,
      input.maxLevel ?? null,
      input.maxLevel ?? null,
      input.roleId ?? null,
      input.roleId ?? null,
      input.permissionKey ?? null,
      input.permissionKey ?? null,
    ],
  );
