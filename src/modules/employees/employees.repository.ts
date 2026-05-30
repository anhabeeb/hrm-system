import type {
  EmployeeAccessibleOutletScope,
  DocumentMetadataInput,
  EmployeeListFilters,
  EmployeeListRow,
  EmployeeNoteInput,
  EmployeeRecord,
  EmployeeWriteInput,
  JobChangeInput,
  OutletAssignmentInput,
  SalaryHistoryInput,
} from "./employees.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const queryOne = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T | null> => bind(env.DB.prepare(sql), values).first<T>();

const queryMany = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const execute = async (
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
) => bind(env.DB.prepare(sql), values).run();

const employeeSelect = `SELECT e.*,
  o.name AS primary_outlet_name,
  d.name AS department_name,
  p.title AS position_title,
  CASE
    WHEN MIN(ed.expiry_date) IS NULL THEN NULL
    WHEN MIN(ed.expiry_date) <= date('now', '+30 day') THEN 'expiring_soon'
    ELSE 'valid'
  END AS document_expiry_status
FROM employees e
LEFT JOIN outlets o ON o.id = e.primary_outlet_id
LEFT JOIN departments d ON d.id = e.department_id
LEFT JOIN positions p ON p.id = e.position_id
LEFT JOIN employee_documents ed ON ed.employee_id = e.id AND ed.deleted_at IS NULL`;

const buildEmployeeFilters = (
  companyId: string,
  filters: EmployeeListFilters,
  outletScope?: EmployeeAccessibleOutletScope,
) => {
  const clauses = ["e.company_id = ?", "e.deleted_at IS NULL"];
  const values: unknown[] = [companyId];

  if (!outletScope?.isSuperAdmin) {
    const allowedOutletIds = outletScope?.outletIds ?? [];

    if (allowedOutletIds.length === 0) {
      clauses.push("1 = 0");
    } else if (filters.outlet_id && !allowedOutletIds.includes(filters.outlet_id)) {
      clauses.push("1 = 0");
    } else {
      clauses.push(
        `e.primary_outlet_id IN (${allowedOutletIds.map(() => "?").join(", ")})`,
      );
      values.push(...allowedOutletIds);
    }
  }

  if (filters.search) {
    clauses.push(
      "(lower(e.employee_code) LIKE lower(?) OR lower(e.full_name) LIKE lower(?) OR lower(COALESCE(e.phone, '')) LIKE lower(?))",
    );
    values.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  const exactFilters: Array<[keyof EmployeeListFilters, string]> = [
    ["outlet_id", "e.primary_outlet_id = ?"],
    ["department_id", "e.department_id = ?"],
    ["position_id", "e.position_id = ?"],
    ["employment_status", "e.employment_status = ?"],
    ["employee_type", "e.employee_type = ?"],
    ["nationality", "e.nationality = ?"],
  ];

  for (const [key, clause] of exactFilters) {
    const value = filters[key];

    if (value) {
      clauses.push(clause);
      values.push(value);
    }
  }

  if (filters.joined_from) {
    clauses.push("e.joined_at >= ?");
    values.push(filters.joined_from);
  }

  if (filters.joined_to) {
    clauses.push("e.joined_at <= ?");
    values.push(filters.joined_to);
  }

  if (filters.document_expiring_before) {
    clauses.push(
      "EXISTS (SELECT 1 FROM employee_documents dx WHERE dx.employee_id = e.id AND dx.deleted_at IS NULL AND dx.expiry_date <= ?)",
    );
    values.push(filters.document_expiring_before);
  }

  return {
    whereSql: clauses.join(" AND "),
    values,
  };
};

export const countEmployees = async (
  env: Env,
  companyId: string,
  filters: EmployeeListFilters,
  outletScope?: EmployeeAccessibleOutletScope,
): Promise<number> => {
  const { whereSql, values } = buildEmployeeFilters(companyId, filters, outletScope);
  const row = await queryOne<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM employees e WHERE ${whereSql}`,
    values,
  );

  return row?.total ?? 0;
};

export const listEmployees = (
  env: Env,
  companyId: string,
  filters: EmployeeListFilters,
  outletScope?: EmployeeAccessibleOutletScope,
): Promise<EmployeeListRow[]> => {
  const { whereSql, values } = buildEmployeeFilters(companyId, filters, outletScope);
  const offset = (filters.page - 1) * filters.page_size;

  return queryMany<EmployeeListRow>(
    env,
    `${employeeSelect}
     WHERE ${whereSql}
     GROUP BY e.id
     ORDER BY e.${filters.sort_by} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, offset],
  );
};

export const findEmployeeById = (
  env: Env,
  companyId: string,
  id: string,
): Promise<EmployeeListRow | null> =>
  queryOne<EmployeeListRow>(
    env,
    `${employeeSelect}
     WHERE e.company_id = ? AND e.id = ?
     GROUP BY e.id
     LIMIT 1`,
    [companyId, id],
  );

export const findEmployeeByCode = (
  env: Env,
  companyId: string,
  employeeCode: string,
): Promise<EmployeeRecord | null> =>
  queryOne<EmployeeRecord>(
    env,
    "SELECT * FROM employees WHERE company_id = ? AND employee_code = ? LIMIT 1",
    [companyId, employeeCode],
  );

export const findActiveOutlet = (
  env: Env,
  companyId: string,
  outletId: string,
): Promise<{ id: string; name: string; status: string } | null> =>
  queryOne(
    env,
    "SELECT id, name, status FROM outlets WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, outletId],
  );

export const findDepartment = (
  env: Env,
  companyId: string,
  departmentId: string,
): Promise<{ id: string; status: string } | null> =>
  queryOne(
    env,
    "SELECT id, status FROM departments WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, departmentId],
  );

export const findPosition = (
  env: Env,
  companyId: string,
  positionId: string,
): Promise<{ id: string; status: string } | null> =>
  queryOne(
    env,
    "SELECT id, status FROM positions WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, positionId],
  );

export const createEmployee = (
  env: Env,
  id: string,
  companyId: string,
  input: EmployeeWriteInput,
  actorUserId: string,
) =>
  execute(
    env,
    `INSERT INTO employees (
      id, company_id, employee_code, full_name, employee_type, nationality,
      id_card_number, passport_number, phone, emergency_contact_name,
      emergency_contact_phone, primary_outlet_id, department_id, position_id,
      contract_type, employment_status, joined_at, bank_name, bank_account_masked,
      notes, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.employee_code,
      input.full_name,
      input.employee_type,
      input.nationality ?? null,
      input.id_card_number ?? null,
      input.passport_number ?? null,
      input.phone ?? null,
      input.emergency_contact_name ?? null,
      input.emergency_contact_phone ?? null,
      input.primary_outlet_id,
      input.department_id ?? null,
      input.position_id ?? null,
      input.contract_type ?? null,
      input.employment_status,
      input.joined_at ?? null,
      input.bank_name ?? null,
      input.bank_account_masked ?? null,
      input.notes ?? null,
      actorUserId,
      actorUserId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateEmployee = (
  env: Env,
  companyId: string,
  id: string,
  input: EmployeeWriteInput & {
    resigned_at?: string | null;
    terminated_at?: string | null;
    deleted_at?: string | null;
  },
  actorUserId: string,
) =>
  execute(
    env,
    `UPDATE employees SET
      employee_code = ?, full_name = ?, employee_type = ?, nationality = ?,
      id_card_number = ?, passport_number = ?, phone = ?, emergency_contact_name = ?,
      emergency_contact_phone = ?, primary_outlet_id = ?, department_id = ?,
      position_id = ?, contract_type = ?, employment_status = ?, joined_at = ?,
      resigned_at = ?, terminated_at = ?, bank_name = ?, bank_account_masked = ?,
      notes = ?, updated_by = ?, updated_at = ?, deleted_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.employee_code,
      input.full_name,
      input.employee_type,
      input.nationality ?? null,
      input.id_card_number ?? null,
      input.passport_number ?? null,
      input.phone ?? null,
      input.emergency_contact_name ?? null,
      input.emergency_contact_phone ?? null,
      input.primary_outlet_id,
      input.department_id ?? null,
      input.position_id ?? null,
      input.contract_type ?? null,
      input.employment_status,
      input.joined_at ?? null,
      input.resigned_at ?? null,
      input.terminated_at ?? null,
      input.bank_name ?? null,
      input.bank_account_masked ?? null,
      input.notes ?? null,
      actorUserId,
      new Date().toISOString(),
      input.deleted_at ?? null,
      companyId,
      id,
    ],
  );

export const createJobHistory = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    outletId?: string | null;
    departmentId?: string | null;
    positionId?: string | null;
    changeType: string;
    effectiveFrom: string;
    reason?: string | null;
    createdBy: string;
  },
) =>
  execute(
    env,
    `INSERT INTO employee_job_history (
      id, company_id, employee_id, outlet_id, department_id, position_id,
      change_type, effective_from, reason, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.outletId ?? null,
      input.departmentId ?? null,
      input.positionId ?? null,
      input.changeType,
      input.effectiveFrom,
      input.reason ?? null,
      input.createdBy,
      new Date().toISOString(),
    ],
  );

export const createStatusHistory = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    oldStatus?: string | null;
    newStatus: string;
    reason?: string | null;
    changedBy: string;
  },
) =>
  execute(
    env,
    `INSERT INTO employee_status_history (
      id, company_id, employee_id, old_status, new_status, reason,
      changed_by, changed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.oldStatus ?? null,
      input.newStatus,
      input.reason ?? null,
      input.changedBy,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const listJobHistory = (env: Env, companyId: string, employeeId: string) =>
  queryMany(
    env,
    "SELECT * FROM employee_job_history WHERE company_id = ? AND employee_id = ? ORDER BY effective_from DESC, created_at DESC",
    [companyId, employeeId],
  );

export const listStatusHistory = (env: Env, companyId: string, employeeId: string) =>
  queryMany(
    env,
    "SELECT * FROM employee_status_history WHERE company_id = ? AND employee_id = ? ORDER BY changed_at DESC",
    [companyId, employeeId],
  );

export const listSalaryHistory = (env: Env, companyId: string, employeeId: string) =>
  queryMany(
    env,
    "SELECT * FROM employee_salary_history WHERE company_id = ? AND employee_id = ? ORDER BY effective_from DESC",
    [companyId, employeeId],
  );

export const createSalaryHistory = (
  env: Env,
  id: string,
  companyId: string,
  employeeId: string,
  input: SalaryHistoryInput,
  actorUserId: string,
) =>
  execute(
    env,
    `INSERT INTO employee_salary_history (
      id, company_id, employee_id, monthly_salary_amount, currency,
      effective_from, reason, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      employeeId,
      input.monthly_salary_amount,
      input.currency ?? "MVR",
      input.effective_from,
      input.reason,
      actorUserId,
      new Date().toISOString(),
    ],
  );

export const listDocuments = (
  env: Env,
  companyId: string,
  employeeId: string,
  includeSensitive: boolean,
) =>
  queryMany(
    env,
    `SELECT id, company_id, employee_id, document_type, file_key, file_name,
      mime_type, expiry_date, status, is_sensitive, uploaded_by, created_at,
      updated_at, deleted_at
     FROM employee_documents
     WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL
       AND (? = 1 OR is_sensitive = 0)
     ORDER BY expiry_date ASC, created_at DESC`,
    [companyId, employeeId, includeSensitive ? 1 : 0],
  );

export const createDocument = (
  env: Env,
  id: string,
  companyId: string,
  employeeId: string,
  input: DocumentMetadataInput,
  actorUserId: string,
) =>
  execute(
    env,
    `INSERT INTO employee_documents (
      id, company_id, employee_id, document_type, file_key, file_name,
      mime_type, expiry_date, status, is_sensitive, uploaded_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?, ?)`,
    [
      id,
      companyId,
      employeeId,
      input.document_type,
      input.file_key,
      input.file_name ?? null,
      input.mime_type ?? null,
      input.expiry_date ?? null,
      input.is_sensitive === false ? 0 : 1,
      actorUserId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const listNotes = (
  env: Env,
  companyId: string,
  employeeId: string,
  includeSensitive: boolean,
) =>
  queryMany(
    env,
    `SELECT * FROM employee_notes
     WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL
       AND (? = 1 OR is_sensitive = 0)
     ORDER BY created_at DESC`,
    [companyId, employeeId, includeSensitive ? 1 : 0],
  );

export const createNote = (
  env: Env,
  id: string,
  companyId: string,
  employeeId: string,
  input: EmployeeNoteInput,
  actorUserId: string,
) =>
  execute(
    env,
    `INSERT INTO employee_notes (
      id, company_id, employee_id, note_type, note, is_sensitive,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      employeeId,
      input.note_type ?? "general",
      input.note,
      input.is_sensitive ? 1 : 0,
      actorUserId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const listEmployeeAuditLog = (
  env: Env,
  companyId: string,
  employeeId: string,
) =>
  queryMany(
    env,
    "SELECT * FROM audit_logs WHERE company_id = ? AND employee_id = ? ORDER BY created_at DESC LIMIT 100",
    [companyId, employeeId],
  );

export const findLinkedUsersByEmployeeId = (
  env: Env,
  companyId: string,
  employeeId: string,
): Promise<Array<{ id: string; status: string }>> =>
  queryMany(
    env,
    "SELECT id, status FROM users WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL",
    [companyId, employeeId],
  );

export const disableLinkedUser = (
  env: Env,
  companyId: string,
  userId: string,
) =>
  execute(
    env,
    "UPDATE users SET status = 'disabled', updated_at = ? WHERE company_id = ? AND id = ?",
    [new Date().toISOString(), companyId, userId],
  );

export const revokeUserSessions = (env: Env, companyId: string, userId: string) =>
  execute(
    env,
    "UPDATE sessions SET revoked_at = ? WHERE company_id = ? AND user_id = ? AND revoked_at IS NULL",
    [new Date().toISOString(), companyId, userId],
  );
