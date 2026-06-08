import type {
  EmployeeAccessibleOutletScope,
  DocumentMetadataInput,
  EmployeeListFilters,
  EmployeeListRow,
  EmployeePersistInput,
  EmployeeStartingSalaryInput,
  EmployeeNoteInput,
  EmployeeRecord,
  EmployeeStatusHistoryRecord,
  CompensationComponentDefinitionFilters,
  CompensationComponentDefinitionInput,
  CompensationApprovalApplicationAction,
  CompensationApprovalApplicationRecord,
  EmployeeCompensationComponentInput,
  EmployeeCompensationComponentRecord,
  EmployeeCompensationComponentEndInput,
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

const compensationIdentityOverlapClause = (input: {
  componentDefinitionId?: string | null;
  componentType: string;
  componentCode?: string | null;
  componentName: string;
  alias?: string;
}) => {
  const alias = input.alias ? `${input.alias}.` : "";
  if (input.componentDefinitionId) {
    return {
      sql: `${alias}component_definition_id = ?`,
      values: [input.componentDefinitionId],
    };
  }
  if (input.componentCode) {
    return {
      sql: `${alias}component_type = ? AND ${alias}component_code = ?`,
      values: [input.componentType, input.componentCode],
    };
  }
  return {
    sql: `${alias}component_type = ? AND lower(${alias}component_name) = lower(?)`,
    values: [input.componentType, input.componentName],
  };
};

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

export const findEmployeeByIdentityField = (
  env: Env,
  companyId: string,
  field: "id_card_number" | "passport_number" | "work_permit_number",
  value: string,
): Promise<EmployeeRecord | null> =>
  queryOne<EmployeeRecord>(
    env,
    `SELECT * FROM employees WHERE company_id = ? AND ${field} = ? AND deleted_at IS NULL LIMIT 1`,
    [companyId, value],
  );

export const getEmployeeCodeSequence = (
  env: Env,
  companyId: string,
): Promise<{ company_id: string; prefix: string; next_number: number; padding: number } | null> =>
  queryOne(
    env,
    "SELECT company_id, prefix, next_number, padding FROM employee_code_sequences WHERE company_id = ? LIMIT 1",
    [companyId],
  );

export const createEmployeeCodeSequence = (
  env: Env,
  companyId: string,
  nextNumber: number,
) =>
  execute(
    env,
    `INSERT OR IGNORE INTO employee_code_sequences (
      company_id, prefix, next_number, padding, created_at, updated_at
    ) VALUES (?, 'EMP', ?, 6, ?, ?)`,
    [companyId, nextNumber, new Date().toISOString(), new Date().toISOString()],
  );

export const getNextEmployeeCodeNumberFromExisting = async (
  env: Env,
  companyId: string,
): Promise<number> => {
  const row = await queryOne<{ next_number: number }>(
    env,
    `SELECT COALESCE(MAX(CASE
      WHEN employee_code GLOB 'EMP-[0-9]*' THEN CAST(substr(employee_code, 5) AS INTEGER)
      ELSE 0
    END), 0) + 1 AS next_number
     FROM employees
     WHERE company_id = ?`,
    [companyId],
  );

  return row?.next_number ?? 1;
};

export const advanceEmployeeCodeSequence = (
  env: Env,
  companyId: string,
  fromNumber: number,
) =>
  execute(
    env,
    `UPDATE employee_code_sequences
     SET next_number = ?, updated_at = ?
     WHERE company_id = ? AND next_number = ?`,
    [fromNumber + 1, new Date().toISOString(), companyId, fromNumber],
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
): Promise<{ id: string; name?: string | null; status: string } | null> =>
  queryOne(
    env,
    "SELECT id, name, status FROM departments WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, departmentId],
  );

export const findPosition = (
  env: Env,
  companyId: string,
  positionId: string,
): Promise<{ id: string; department_id?: string | null; title?: string | null; status: string } | null> =>
  queryOne(
    env,
    "SELECT id, department_id, title, status FROM positions WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, positionId],
  );

export const createEmployee = (
  env: Env,
  id: string,
  companyId: string,
  input: EmployeePersistInput,
  actorUserId: string,
) =>
  execute(
    env,
    `INSERT INTO employees (
      id, company_id, employee_code, full_name, employee_type, nationality,
      id_card_number, passport_number, passport_expiry_date,
      work_permit_number, work_permit_expiry_date, phone, emergency_contact_name,
      emergency_contact_phone, primary_outlet_id, department_id, position_id,
      contract_type, employment_status, joined_at, bank_name, bank_account_masked,
      notes, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.employee_code,
      input.full_name,
      input.employee_type,
      input.nationality ?? null,
      input.id_card_number ?? null,
      input.passport_number ?? null,
      input.passport_expiry_date ?? null,
      input.work_permit_number ?? null,
      input.work_permit_expiry_date ?? null,
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

export const createEmployeeOnboardingRecords = (
  env: Env,
  input: {
    employeeId: string;
    salaryHistoryId: string;
    jobHistoryId: string;
    statusHistoryId: string;
    companyId: string;
    employee: EmployeePersistInput;
    startingSalary: EmployeeStartingSalaryInput;
    actorUserId: string;
    jobEffectiveFrom: string;
  },
) => {
  const timestamp = new Date().toISOString();

  return env.DB.batch([
    env.DB.prepare(
      `INSERT INTO employees (
        id, company_id, employee_code, full_name, employee_type, nationality,
        id_card_number, passport_number, passport_expiry_date,
        work_permit_number, work_permit_expiry_date, phone, emergency_contact_name,
        emergency_contact_phone, primary_outlet_id, department_id, position_id,
        contract_type, employment_status, joined_at, bank_name, bank_account_masked,
        notes, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.employeeId,
      input.companyId,
      input.employee.employee_code,
      input.employee.full_name,
      input.employee.employee_type,
      input.employee.nationality ?? null,
      input.employee.id_card_number ?? null,
      input.employee.passport_number ?? null,
      input.employee.passport_expiry_date ?? null,
      input.employee.work_permit_number ?? null,
      input.employee.work_permit_expiry_date ?? null,
      input.employee.phone ?? null,
      input.employee.emergency_contact_name ?? null,
      input.employee.emergency_contact_phone ?? null,
      input.employee.primary_outlet_id,
      input.employee.department_id ?? null,
      input.employee.position_id ?? null,
      input.employee.contract_type ?? null,
      input.employee.employment_status,
      input.employee.joined_at ?? null,
      input.employee.bank_name ?? null,
      input.employee.bank_account_masked ?? null,
      input.employee.notes ?? null,
      input.actorUserId,
      input.actorUserId,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT INTO employee_salary_history (
        id, company_id, employee_id, monthly_salary_amount, currency,
        effective_from, reason, created_by, created_at, change_type, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.salaryHistoryId,
      input.companyId,
      input.employeeId,
      input.startingSalary.monthly_salary_amount,
      input.startingSalary.currency,
      input.startingSalary.effective_from,
      input.startingSalary.reason,
      input.actorUserId,
      timestamp,
      "starting_salary",
      timestamp,
    ),
    env.DB.prepare(
      `INSERT INTO employee_job_history (
        id, company_id, employee_id, outlet_id, department_id, position_id,
        change_type, effective_from, reason, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.jobHistoryId,
      input.companyId,
      input.employeeId,
      input.employee.primary_outlet_id,
      input.employee.department_id ?? null,
      input.employee.position_id ?? null,
      "initial_assignment",
      input.jobEffectiveFrom,
      "Employee created",
      input.actorUserId,
      timestamp,
    ),
    env.DB.prepare(
      `INSERT INTO employee_status_history (
        id, company_id, employee_id, old_status, new_status, effective_from,
        effective_to, reason, notes, approval_request_id, approved_by, created_by,
        changed_by, changed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.statusHistoryId,
      input.companyId,
      input.employeeId,
      null,
      input.employee.employment_status,
      input.employee.joined_at ?? timestamp.slice(0, 10),
      null,
      "Employee created",
      null,
      null,
      null,
      input.actorUserId,
      input.actorUserId,
      timestamp,
      timestamp,
      timestamp,
    ),
  ]);
};

export const updateEmployee = (
  env: Env,
  companyId: string,
  id: string,
  input: EmployeePersistInput & {
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
      id_card_number = ?, passport_number = ?, passport_expiry_date = ?,
      work_permit_number = ?, work_permit_expiry_date = ?, phone = ?, emergency_contact_name = ?,
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
      input.passport_expiry_date ?? null,
      input.work_permit_number ?? null,
      input.work_permit_expiry_date ?? null,
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
    oldOutletId?: string | null;
    newOutletId?: string | null;
    oldDepartmentId?: string | null;
    newDepartmentId?: string | null;
    oldPositionId?: string | null;
    newPositionId?: string | null;
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
      old_outlet_id, new_outlet_id, old_department_id, new_department_id,
      old_position_id, new_position_id,
      change_type, effective_from, reason, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.outletId ?? null,
      input.departmentId ?? null,
      input.positionId ?? null,
      input.oldOutletId ?? null,
      input.newOutletId ?? input.outletId ?? null,
      input.oldDepartmentId ?? null,
      input.newDepartmentId ?? input.departmentId ?? null,
      input.oldPositionId ?? null,
      input.newPositionId ?? input.positionId ?? null,
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
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    reason?: string | null;
    notes?: string | null;
    approvalRequestId?: string | null;
    approvedBy?: string | null;
    createdBy?: string | null;
    changedBy: string;
  },
) =>
  execute(
    env,
    `INSERT INTO employee_status_history (
      id, company_id, employee_id, old_status, new_status, effective_from,
      effective_to, reason, notes, approval_request_id, approved_by, created_by,
      changed_by, changed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.oldStatus ?? null,
      input.newStatus,
      input.effectiveFrom ?? null,
      input.effectiveTo ?? null,
      input.reason ?? null,
      input.notes ?? null,
      input.approvalRequestId ?? null,
      input.approvedBy ?? null,
      input.createdBy ?? input.changedBy,
      input.changedBy,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const closeOpenStatusHistoryBefore = (
  env: Env,
  companyId: string,
  employeeId: string,
  newEffectiveFrom: string,
) =>
  execute(
    env,
    `UPDATE employee_status_history
     SET effective_to = date(?, '-1 day'), updated_at = ?
     WHERE company_id = ? AND employee_id = ?
       AND effective_from IS NOT NULL
       AND effective_from < ?
       AND (effective_to IS NULL OR effective_to >= ?)`,
    [newEffectiveFrom, new Date().toISOString(), companyId, employeeId, newEffectiveFrom, newEffectiveFrom],
  );

export const applyEmployeeStatusChange = (
  env: Env,
  input: {
    companyId: string;
    employeeId: string;
    employee: EmployeePersistInput & {
      resigned_at?: string | null;
      terminated_at?: string | null;
      deleted_at?: string | null;
    };
    actorUserId: string;
    statusHistory: {
      id: string;
      oldStatus?: string | null;
      newStatus: string;
      effectiveFrom: string;
      reason?: string | null;
      notes?: string | null;
      approvalRequestId?: string | null;
      approvedBy?: string | null;
    };
  },
) => {
  const now = new Date().toISOString();
  return env.DB.batch([
    env.DB.prepare(
      `UPDATE employees SET
        employee_code = ?, full_name = ?, employee_type = ?, nationality = ?,
        id_card_number = ?, passport_number = ?, passport_expiry_date = ?,
        work_permit_number = ?, work_permit_expiry_date = ?, phone = ?, emergency_contact_name = ?,
        emergency_contact_phone = ?, primary_outlet_id = ?, department_id = ?,
        position_id = ?, contract_type = ?, employment_status = ?, joined_at = ?,
        resigned_at = ?, terminated_at = ?, bank_name = ?, bank_account_masked = ?,
        notes = ?, updated_by = ?, updated_at = ?, deleted_at = ?
       WHERE company_id = ? AND id = ?`,
    ).bind(
      input.employee.employee_code,
      input.employee.full_name,
      input.employee.employee_type,
      input.employee.nationality ?? null,
      input.employee.id_card_number ?? null,
      input.employee.passport_number ?? null,
      input.employee.passport_expiry_date ?? null,
      input.employee.work_permit_number ?? null,
      input.employee.work_permit_expiry_date ?? null,
      input.employee.phone ?? null,
      input.employee.emergency_contact_name ?? null,
      input.employee.emergency_contact_phone ?? null,
      input.employee.primary_outlet_id,
      input.employee.department_id ?? null,
      input.employee.position_id ?? null,
      input.employee.contract_type ?? null,
      input.employee.employment_status,
      input.employee.joined_at ?? null,
      input.employee.resigned_at ?? null,
      input.employee.terminated_at ?? null,
      input.employee.bank_name ?? null,
      input.employee.bank_account_masked ?? null,
      input.employee.notes ?? null,
      input.actorUserId,
      now,
      input.employee.deleted_at ?? null,
      input.companyId,
      input.employeeId,
    ),
    env.DB.prepare(
      `UPDATE employee_status_history
       SET effective_to = date(?, '-1 day'), updated_at = ?
       WHERE company_id = ? AND employee_id = ?
         AND effective_from IS NOT NULL
         AND effective_from < ?
         AND (effective_to IS NULL OR effective_to >= ?)`,
    ).bind(
      input.statusHistory.effectiveFrom,
      now,
      input.companyId,
      input.employeeId,
      input.statusHistory.effectiveFrom,
      input.statusHistory.effectiveFrom,
    ),
    env.DB.prepare(
      `INSERT INTO employee_status_history (
        id, company_id, employee_id, old_status, new_status, effective_from,
        effective_to, reason, notes, approval_request_id, approved_by, created_by,
        changed_by, changed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.statusHistory.id,
      input.companyId,
      input.employeeId,
      input.statusHistory.oldStatus ?? null,
      input.statusHistory.newStatus,
      input.statusHistory.effectiveFrom,
      null,
      input.statusHistory.reason ?? null,
      input.statusHistory.notes ?? null,
      input.statusHistory.approvalRequestId ?? null,
      input.statusHistory.approvedBy ?? null,
      input.actorUserId,
      input.actorUserId,
      now,
      now,
      now,
    ),
  ]);
};

export const listJobHistory = (env: Env, companyId: string, employeeId: string) =>
  queryMany(
    env,
    `SELECT h.*,
       COALESCE(h.old_outlet_id, NULL) AS old_outlet_id,
       COALESCE(h.new_outlet_id, h.outlet_id) AS new_outlet_id,
       COALESCE(h.old_department_id, NULL) AS old_department_id,
       COALESCE(h.new_department_id, h.department_id) AS new_department_id,
       COALESCE(h.old_position_id, NULL) AS old_position_id,
       COALESCE(h.new_position_id, h.position_id) AS new_position_id,
       old_o.name AS old_outlet_name,
       new_o.name AS new_outlet_name,
       old_d.name AS old_department_name,
       new_d.name AS new_department_name,
       old_p.title AS old_position_title,
       new_p.title AS new_position_title,
       u.full_name AS created_by_name
     FROM employee_job_history h
     LEFT JOIN outlets old_o ON old_o.company_id = h.company_id AND old_o.id = h.old_outlet_id
     LEFT JOIN outlets new_o ON new_o.company_id = h.company_id AND new_o.id = COALESCE(h.new_outlet_id, h.outlet_id)
     LEFT JOIN departments old_d ON old_d.company_id = h.company_id AND old_d.id = h.old_department_id
     LEFT JOIN departments new_d ON new_d.company_id = h.company_id AND new_d.id = COALESCE(h.new_department_id, h.department_id)
     LEFT JOIN positions old_p ON old_p.company_id = h.company_id AND old_p.id = h.old_position_id
     LEFT JOIN positions new_p ON new_p.company_id = h.company_id AND new_p.id = COALESCE(h.new_position_id, h.position_id)
     LEFT JOIN users u ON u.company_id = h.company_id AND u.id = h.created_by
     WHERE h.company_id = ? AND h.employee_id = ?
     ORDER BY h.effective_from DESC, h.created_at DESC`,
    [companyId, employeeId],
  );

export const listStatusHistory = (env: Env, companyId: string, employeeId: string) =>
  queryMany<EmployeeStatusHistoryRecord>(
    env,
    `SELECT h.*, creator.full_name AS created_by_name, changer.full_name AS changed_by_name
     FROM employee_status_history h
     LEFT JOIN users creator ON creator.company_id = h.company_id AND creator.id = h.created_by
     LEFT JOIN users changer ON changer.company_id = h.company_id AND changer.id = h.changed_by
     WHERE h.company_id = ? AND h.employee_id = ?
     ORDER BY COALESCE(h.effective_from, h.changed_at) DESC, h.created_at DESC`,
    [companyId, employeeId],
  );

export const listSalaryHistory = (env: Env, companyId: string, employeeId: string) =>
  queryMany(
    env,
    `SELECT h.*, u.full_name AS created_by_name
     FROM employee_salary_history h
     LEFT JOIN users u ON u.company_id = h.company_id AND u.id = h.created_by
     WHERE h.company_id = ? AND h.employee_id = ?
     ORDER BY h.effective_from DESC, h.created_at DESC`,
    [companyId, employeeId],
  );

export const findSalaryHistoryById = (
  env: Env,
  companyId: string,
  employeeId: string,
  id: string,
) =>
  queryOne<Record<string, unknown>>(
    env,
    "SELECT * FROM employee_salary_history WHERE company_id = ? AND employee_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId, id],
  );

export const findSalaryHistoryByApprovalRequestId = (
  env: Env,
  companyId: string,
  approvalRequestId: string,
) =>
  queryOne<Record<string, unknown>>(
    env,
    "SELECT * FROM employee_salary_history WHERE company_id = ? AND approval_request_id = ? LIMIT 1",
    [companyId, approvalRequestId],
  );

export const findJobHistoryByApprovalRequestId = (
  env: Env,
  companyId: string,
  approvalRequestId: string,
) =>
  queryOne<Record<string, unknown>>(
    env,
    "SELECT * FROM employee_job_history WHERE company_id = ? AND approval_request_id = ? LIMIT 1",
    [companyId, approvalRequestId],
  );

export const findActiveSalaryAtOrBefore = (
  env: Env,
  companyId: string,
  employeeId: string,
  effectiveFrom: string,
) =>
  queryOne<{
    id: string;
    monthly_salary_amount: number;
    currency: string;
    effective_from: string;
    effective_to: string | null;
    reason: string | null;
    change_type?: string | null;
  }>(
    env,
    `SELECT * FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    [companyId, employeeId, effectiveFrom, effectiveFrom],
  );

export const findFutureSalary = (
  env: Env,
  companyId: string,
  employeeId: string,
  effectiveFrom: string,
) =>
  queryOne<{ id: string; effective_from: string }>(
    env,
    `SELECT id, effective_from FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_from >= ?
     ORDER BY effective_from ASC LIMIT 1`,
    [companyId, employeeId, effectiveFrom],
  );

export const countOpenSalaryRows = async (
  env: Env,
  companyId: string,
  employeeId: string,
) => {
  const row = await queryOne<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_to IS NULL`,
    [companyId, employeeId],
  );
  return row?.total ?? 0;
};

export const findFinalizedPayrollRunByMonth = (
  env: Env,
  companyId: string,
  payrollMonth: string,
) =>
  queryOne<{ id: string; status: string }>(
    env,
    `SELECT id, status FROM payroll_runs
     WHERE company_id = ? AND payroll_month = ? AND status IN ('finalizing', 'finalized', 'locked', 'paid')
     LIMIT 1`,
    [companyId, payrollMonth],
  );

export const closeSalaryHistory = (
  env: Env,
  companyId: string,
  employeeId: string,
  id: string,
  effectiveTo: string,
) =>
  execute(
    env,
    `UPDATE employee_salary_history
     SET effective_to = ?, updated_at = ?
     WHERE company_id = ? AND employee_id = ? AND id = ?`,
    [effectiveTo, new Date().toISOString(), companyId, employeeId, id],
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
      effective_from, reason, created_by, created_at, change_type, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.change_type,
      new Date().toISOString(),
    ],
  );

export const createSalaryTimelineChange = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    salary: SalaryHistoryInput;
    actorUserId: string;
    closePrevious?: { id: string; effectiveTo: string } | null;
    approvalRequestId?: string | null;
  },
) => {
  const timestamp = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  if (input.closePrevious) {
    statements.push(
      env.DB.prepare(
        `UPDATE employee_salary_history
         SET effective_to = ?, updated_at = ?
         WHERE company_id = ? AND employee_id = ? AND id = ?`,
      ).bind(
        input.closePrevious.effectiveTo,
        timestamp,
        input.companyId,
        input.employeeId,
        input.closePrevious.id,
      ),
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO employee_salary_history (
        id, company_id, employee_id, monthly_salary_amount, currency,
        effective_from, effective_to, reason, approval_request_id, created_by, created_at, change_type, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.id,
      input.companyId,
      input.employeeId,
      input.salary.monthly_salary_amount,
      input.salary.currency ?? "MVR",
      input.salary.effective_from,
      input.salary.reason,
      input.approvalRequestId ?? null,
      input.actorUserId,
      timestamp,
      input.salary.change_type,
      timestamp,
    ),
  );

  return env.DB.batch(statements);
};

export const findCompensationComponentDefinition = (
  env: Env,
  companyId: string,
  id: string,
) =>
  queryOne<{
    id: string;
    component_type: string;
    component_code: string;
    component_name: string;
    category: string | null;
    default_amount: number | null;
    currency: string;
    calculation_type: string;
    affects_gross_pay: number;
    affects_net_pay: number;
    status: string;
  }>(
    env,
    `SELECT * FROM compensation_component_definitions
     WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, id],
  );

const buildDefinitionFilters = (
  companyId: string,
  filters: CompensationComponentDefinitionFilters,
) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];

  if (filters.search) {
    clauses.push("(lower(component_code) LIKE lower(?) OR lower(component_name) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  if (filters.component_type) {
    clauses.push("component_type = ?");
    values.push(filters.component_type);
  }

  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }

  return { whereSql: clauses.join(" AND "), values };
};

export const countCompensationComponentDefinitions = async (
  env: Env,
  companyId: string,
  filters: CompensationComponentDefinitionFilters,
) => {
  const { whereSql, values } = buildDefinitionFilters(companyId, filters);
  const row = await queryOne<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM compensation_component_definitions WHERE ${whereSql}`,
    values,
  );
  return row?.total ?? 0;
};

export const listCompensationComponentDefinitions = (
  env: Env,
  companyId: string,
  filters: CompensationComponentDefinitionFilters,
) => {
  const { whereSql, values } = buildDefinitionFilters(companyId, filters);
  const offset = (filters.page - 1) * filters.page_size;

  return queryMany(
    env,
    `SELECT *
     FROM compensation_component_definitions
     WHERE ${whereSql}
     ORDER BY component_type ASC, component_name ASC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, offset],
  );
};

export const findCompensationComponentDefinitionByCode = (
  env: Env,
  companyId: string,
  componentCode: string,
  excludeId?: string,
) =>
  queryOne<{ id: string }>(
    env,
    `SELECT id FROM compensation_component_definitions
     WHERE company_id = ? AND component_code = ? ${excludeId ? "AND id <> ?" : ""}
     LIMIT 1`,
    excludeId ? [companyId, componentCode, excludeId] : [companyId, componentCode],
  );

export const createCompensationComponentDefinition = (
  env: Env,
  id: string,
  companyId: string,
  input: CompensationComponentDefinitionInput,
  actorUserId: string,
) =>
  execute(
    env,
    `INSERT INTO compensation_component_definitions (
      id, company_id, component_type, component_code, component_name, category,
      default_amount, currency, calculation_type, affects_gross_pay, affects_net_pay,
      status, description, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.component_type,
      input.component_code,
      input.component_name,
      input.category ?? null,
      input.default_amount ?? null,
      input.currency ?? "MVR",
      input.calculation_type,
      input.affects_gross_pay === false ? 0 : 1,
      input.affects_net_pay === false ? 0 : 1,
      input.description ?? null,
      actorUserId,
      new Date().toISOString(),
      actorUserId,
      new Date().toISOString(),
    ],
  );

export const updateCompensationComponentDefinition = (
  env: Env,
  companyId: string,
  id: string,
  input: CompensationComponentDefinitionInput,
  actorUserId: string,
) =>
  execute(
    env,
    `UPDATE compensation_component_definitions
     SET component_type = ?, component_code = ?, component_name = ?, category = ?,
         default_amount = ?, currency = ?, calculation_type = ?,
         affects_gross_pay = ?, affects_net_pay = ?, description = ?,
         updated_by = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.component_type,
      input.component_code,
      input.component_name,
      input.category ?? null,
      input.default_amount ?? null,
      input.currency ?? "MVR",
      input.calculation_type,
      input.affects_gross_pay === false ? 0 : 1,
      input.affects_net_pay === false ? 0 : 1,
      input.description ?? null,
      actorUserId,
      new Date().toISOString(),
      companyId,
      id,
    ],
  );

export const setCompensationComponentDefinitionStatus = (
  env: Env,
  companyId: string,
  id: string,
  status: "active" | "inactive",
  actorUserId: string,
) =>
  execute(
    env,
    `UPDATE compensation_component_definitions
     SET status = ?, updated_by = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [status, actorUserId, new Date().toISOString(), companyId, id],
  );

export const listCompensationComponents = (
  env: Env,
  companyId: string,
  employeeId: string,
) =>
  queryMany<EmployeeCompensationComponentRecord>(
    env,
    `SELECT c.*, u.full_name AS created_by_name
     FROM employee_compensation_components c
     LEFT JOIN users u ON u.company_id = c.company_id AND u.id = c.created_by
     WHERE c.company_id = ? AND c.employee_id = ?
     ORDER BY c.effective_from DESC, c.created_at DESC`,
    [companyId, employeeId],
  );

export const findCompensationComponentById = (
  env: Env,
  companyId: string,
  employeeId: string,
  componentId: string,
) =>
  queryOne<EmployeeCompensationComponentRecord>(
    env,
    `SELECT c.*, u.full_name AS created_by_name
     FROM employee_compensation_components c
     LEFT JOIN users u ON u.company_id = c.company_id AND u.id = c.created_by
     WHERE c.company_id = ? AND c.employee_id = ? AND c.id = ? LIMIT 1`,
    [companyId, employeeId, componentId],
  );

export const findCompensationComponentByApprovalRequestId = (
  env: Env,
  companyId: string,
  approvalRequestId: string,
) =>
  queryOne<EmployeeCompensationComponentRecord>(
    env,
    `SELECT * FROM employee_compensation_components
     WHERE company_id = ? AND approval_request_id = ? LIMIT 1`,
    [companyId, approvalRequestId],
  );

export const findCompensationApprovalApplication = (
  env: Env,
  companyId: string,
  approvalRequestId: string,
) =>
  queryOne<CompensationApprovalApplicationRecord>(
    env,
    `SELECT * FROM compensation_approval_applications
     WHERE company_id = ? AND approval_request_id = ? LIMIT 1`,
    [companyId, approvalRequestId],
  );

export const createCompensationApprovalApplication = async (
  env: Env,
  input: {
    id: string;
    companyId: string;
    approvalRequestId: string;
    employeeId: string;
    componentId: string;
    actionType: CompensationApprovalApplicationAction;
    appliedAt: string;
  },
) => {
  await execute(
    env,
    `INSERT OR IGNORE INTO compensation_approval_applications (
      id, company_id, approval_request_id, employee_id, component_id, action_type, applied_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.approvalRequestId,
      input.employeeId,
      input.componentId,
      input.actionType,
      input.appliedAt,
      input.appliedAt,
    ],
  );

  return findCompensationApprovalApplication(env, input.companyId, input.approvalRequestId);
};

export const listCompensationApprovalApplicationsForComponent = (
  env: Env,
  companyId: string,
  componentId: string,
) =>
  queryMany<CompensationApprovalApplicationRecord>(
    env,
    `SELECT * FROM compensation_approval_applications
     WHERE company_id = ? AND component_id = ?
     ORDER BY applied_at ASC, created_at ASC`,
    [companyId, componentId],
  );

export const listCompensationApprovalApplicationsForEmployee = (
  env: Env,
  companyId: string,
  employeeId: string,
) =>
  queryMany<CompensationApprovalApplicationRecord>(
    env,
    `SELECT * FROM compensation_approval_applications
     WHERE company_id = ? AND employee_id = ?
     ORDER BY applied_at ASC, created_at ASC`,
    [companyId, employeeId],
  );

export const findActiveCompensationComponentsForDate = (
  env: Env,
  companyId: string,
  employeeId: string,
  payrollDate: string,
) =>
  queryMany<EmployeeCompensationComponentRecord>(
    env,
    `SELECT *
     FROM employee_compensation_components
     WHERE company_id = ? AND employee_id = ?
       AND status NOT IN ('cancelled', 'pending_approval')
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY component_type ASC, component_name ASC, effective_from DESC`,
    [companyId, employeeId, payrollDate, payrollDate],
  );

export const findOverlappingCompensationComponent = (
  env: Env,
  companyId: string,
  employeeId: string,
  input: {
    componentDefinitionId?: string | null;
    componentType: string;
    componentCode?: string | null;
    componentName: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
    excludeId?: string | null;
  },
) => {
  const values: unknown[] = [
    companyId,
    employeeId,
    input.effectiveTo ?? "9999-12-31",
    input.effectiveFrom,
  ];
  const clauses = [
    "company_id = ?",
    "employee_id = ?",
    "status NOT IN ('cancelled', 'pending_approval')",
    "effective_from <= ?",
    "COALESCE(effective_to, '9999-12-31') >= ?",
  ];

  if (input.componentDefinitionId) {
    clauses.push("component_definition_id = ?");
    values.push(input.componentDefinitionId);
  } else if (input.componentCode) {
    clauses.push("component_definition_id IS NULL");
    clauses.push("component_type = ?");
    clauses.push("component_code = ?");
    values.push(input.componentType, input.componentCode);
  } else {
    clauses.push("component_definition_id IS NULL");
    clauses.push("component_type = ?");
    clauses.push("lower(component_name) = lower(?)");
    values.push(input.componentType, input.componentName);
  }

  if (input.excludeId) {
    clauses.push("id <> ?");
    values.push(input.excludeId);
  }

  return queryOne<EmployeeCompensationComponentRecord>(
    env,
    `SELECT * FROM employee_compensation_components
     WHERE ${clauses.join(" AND ")}
     ORDER BY effective_from DESC LIMIT 1`,
    values,
  );
};

export const createCompensationComponent = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    component: EmployeeCompensationComponentInput;
    status: string;
    actorUserId: string;
    approvalRequestId?: string | null;
  },
) => {
  const timestamp = new Date().toISOString();
  const identity = compensationIdentityOverlapClause({
    componentDefinitionId: input.component.component_definition_id,
    componentType: input.component.component_type,
    componentCode: input.component.component_code,
    componentName: input.component.component_name,
    alias: "existing",
  });

  return execute(
    env,
    `INSERT INTO employee_compensation_components (
      id, company_id, employee_id, component_definition_id, component_type,
      component_code, component_name, category, amount, currency, calculation_type,
      affects_gross_pay, affects_net_pay, effective_from, effective_to, status,
      revision, reason, notes, approval_request_id, created_by, created_at, updated_by, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM employee_compensation_components existing
      WHERE existing.company_id = ? AND existing.employee_id = ?
        AND existing.status NOT IN ('cancelled', 'pending_approval')
        AND existing.effective_from <= COALESCE(?, '9999-12-31')
        AND COALESCE(existing.effective_to, '9999-12-31') >= ?
        AND ${identity.sql}
    )`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.component.component_definition_id ?? null,
      input.component.component_type,
      input.component.component_code ?? null,
      input.component.component_name,
      input.component.category ?? null,
      input.component.amount,
      input.component.currency ?? "MVR",
      input.component.calculation_type,
      input.component.affects_gross_pay === false ? 0 : 1,
      input.component.affects_net_pay === false ? 0 : 1,
      input.component.effective_from,
      input.status,
      input.component.reason,
      input.component.notes ?? null,
      input.approvalRequestId ?? null,
      input.actorUserId,
      timestamp,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
      null,
      input.component.effective_from,
      ...identity.values,
    ],
  );
};

export const createCompensationComponentVersion = async (
  env: Env,
  input: {
    previousId: string;
    newId: string;
    companyId: string;
    employeeId: string;
    component: EmployeeCompensationComponentInput;
    closePreviousEffectiveTo: string;
    previousStatus: string;
    status: string;
    actorUserId: string;
    approvalRequestId?: string | null;
    expectedCurrent: {
      status: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      amount: number;
      currency: string;
      calculationType: string;
      affectsGrossPay: number;
      affectsNetPay: number;
      revision: number;
      updatedAt: string;
    };
  },
) => {
  const timestamp = new Date().toISOString();
  const identity = compensationIdentityOverlapClause({
    componentDefinitionId: input.component.component_definition_id,
    componentType: input.component.component_type,
    componentCode: input.component.component_code,
    componentName: input.component.component_name,
    alias: "existing",
  });

  const [insertResult, closeResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO employee_compensation_components (
        id, company_id, employee_id, component_definition_id, component_type,
        component_code, component_name, category, amount, currency, calculation_type,
        affects_gross_pay, affects_net_pay, effective_from, effective_to, status,
        revision, reason, notes, approval_request_id, created_by, created_at, updated_by, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?
      FROM employee_compensation_components current
      WHERE current.company_id = ? AND current.employee_id = ? AND current.id = ?
        AND current.status = ?
        AND current.effective_from = ?
        AND COALESCE(current.effective_to, '') = COALESCE(?, '')
        AND current.amount = ?
        AND current.currency = ?
        AND current.calculation_type = ?
        AND current.affects_gross_pay = ?
        AND current.affects_net_pay = ?
        AND current.revision = ?
        AND current.updated_at = ?
        AND NOT EXISTS (
          SELECT 1 FROM employee_compensation_components existing
          WHERE existing.company_id = ? AND existing.employee_id = ?
            AND existing.id <> current.id
            AND existing.status NOT IN ('cancelled', 'pending_approval')
            AND existing.effective_from <= COALESCE(?, '9999-12-31')
            AND COALESCE(existing.effective_to, '9999-12-31') >= ?
            AND ${identity.sql}
        )`,
    ).bind(
      input.newId,
      input.companyId,
      input.employeeId,
      input.component.component_definition_id ?? null,
      input.component.component_type,
      input.component.component_code ?? null,
      input.component.component_name,
      input.component.category ?? null,
      input.component.amount,
      input.component.currency ?? "MVR",
      input.component.calculation_type,
      input.component.affects_gross_pay === false ? 0 : 1,
      input.component.affects_net_pay === false ? 0 : 1,
      input.component.effective_from,
      input.status,
      input.component.reason,
      input.component.notes ?? null,
      input.approvalRequestId ?? null,
      input.actorUserId,
      timestamp,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
      input.previousId,
      input.expectedCurrent.status,
      input.expectedCurrent.effectiveFrom,
      input.expectedCurrent.effectiveTo ?? null,
      input.expectedCurrent.amount,
      input.expectedCurrent.currency,
      input.expectedCurrent.calculationType,
      input.expectedCurrent.affectsGrossPay,
      input.expectedCurrent.affectsNetPay,
      input.expectedCurrent.revision,
      input.expectedCurrent.updatedAt,
      input.companyId,
      input.employeeId,
      null,
      input.component.effective_from,
      ...identity.values,
    ),
    env.DB.prepare(
      `UPDATE employee_compensation_components
       SET effective_to = ?, status = ?, revision = revision + 1, updated_by = ?, updated_at = ?
       WHERE company_id = ? AND employee_id = ? AND id = ?
         AND revision = ?
         AND updated_at = ?
         AND EXISTS (
           SELECT 1 FROM employee_compensation_components inserted
           WHERE inserted.company_id = ? AND inserted.employee_id = ? AND inserted.id = ?
         )`,
    ).bind(
      input.closePreviousEffectiveTo,
      input.previousStatus,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
      input.previousId,
      input.expectedCurrent.revision,
      input.expectedCurrent.updatedAt,
      input.companyId,
      input.employeeId,
      input.newId,
    ),
  ]);

  return {
    changed: (insertResult.meta?.changes ?? 0) === 1 && (closeResult.meta?.changes ?? 0) === 1,
    insertResult,
    closeResult,
  };
};

export const createApprovedCompensationComponent = async (
  env: Env,
  input: {
    id: string;
    applicationId: string;
    companyId: string;
    employeeId: string;
    component: EmployeeCompensationComponentInput;
    status: string;
    actorUserId: string;
    approvalRequestId: string;
    appliedAt: string;
  },
) => {
  const timestamp = input.appliedAt;
  const identity = compensationIdentityOverlapClause({
    componentDefinitionId: input.component.component_definition_id,
    componentType: input.component.component_type,
    componentCode: input.component.component_code,
    componentName: input.component.component_name,
    alias: "existing",
  });

  const [componentResult, applicationResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO employee_compensation_components (
        id, company_id, employee_id, component_definition_id, component_type,
        component_code, component_name, category, amount, currency, calculation_type,
        affects_gross_pay, affects_net_pay, effective_from, effective_to, status,
        revision, reason, notes, approval_request_id, created_by, created_at, updated_by, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM employee_compensation_components existing
        WHERE existing.company_id = ? AND existing.employee_id = ?
          AND existing.status NOT IN ('cancelled', 'pending_approval')
          AND existing.effective_from <= COALESCE(?, '9999-12-31')
          AND COALESCE(existing.effective_to, '9999-12-31') >= ?
          AND ${identity.sql}
      )`,
    ).bind(
      input.id,
      input.companyId,
      input.employeeId,
      input.component.component_definition_id ?? null,
      input.component.component_type,
      input.component.component_code ?? null,
      input.component.component_name,
      input.component.category ?? null,
      input.component.amount,
      input.component.currency ?? "MVR",
      input.component.calculation_type,
      input.component.affects_gross_pay === false ? 0 : 1,
      input.component.affects_net_pay === false ? 0 : 1,
      input.component.effective_from,
      input.status,
      input.component.reason,
      input.component.notes ?? null,
      input.approvalRequestId,
      input.actorUserId,
      timestamp,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
      null,
      input.component.effective_from,
      ...identity.values,
    ),
    env.DB.prepare(
      `INSERT INTO compensation_approval_applications (
        id, company_id, approval_request_id, employee_id, component_id, action_type, applied_at, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'create', ?, ?
      FROM employee_compensation_components component
      WHERE component.company_id = ? AND component.employee_id = ? AND component.id = ?`,
    ).bind(
      input.applicationId,
      input.companyId,
      input.approvalRequestId,
      input.employeeId,
      input.id,
      timestamp,
      timestamp,
      input.companyId,
      input.employeeId,
      input.id,
    ),
  ]);

  return {
    changed: (componentResult.meta?.changes ?? 0) === 1 && (applicationResult.meta?.changes ?? 0) === 1,
    componentResult,
    applicationResult,
  };
};

export const changeApprovedCompensationComponent = async (
  env: Env,
  input: {
    previousId: string;
    newId: string;
    applicationId: string;
    companyId: string;
    employeeId: string;
    component: EmployeeCompensationComponentInput;
    closePreviousEffectiveTo: string;
    previousStatus: string;
    status: string;
    actorUserId: string;
    approvalRequestId: string;
    appliedAt: string;
    expectedCurrent: {
      status: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      amount: number;
      currency: string;
      calculationType: string;
      affectsGrossPay: number;
      affectsNetPay: number;
      revision: number;
      updatedAt: string;
    };
  },
) => {
  const timestamp = input.appliedAt;
  const identity = compensationIdentityOverlapClause({
    componentDefinitionId: input.component.component_definition_id,
    componentType: input.component.component_type,
    componentCode: input.component.component_code,
    componentName: input.component.component_name,
    alias: "existing",
  });

  const [insertResult, closeResult, applicationResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO employee_compensation_components (
        id, company_id, employee_id, component_definition_id, component_type,
        component_code, component_name, category, amount, currency, calculation_type,
        affects_gross_pay, affects_net_pay, effective_from, effective_to, status,
        revision, reason, notes, approval_request_id, created_by, created_at, updated_by, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?
      FROM employee_compensation_components current
      WHERE current.company_id = ? AND current.employee_id = ? AND current.id = ?
        AND current.status = ?
        AND current.effective_from = ?
        AND COALESCE(current.effective_to, '') = COALESCE(?, '')
        AND current.amount = ?
        AND current.currency = ?
        AND current.calculation_type = ?
        AND current.affects_gross_pay = ?
        AND current.affects_net_pay = ?
        AND current.revision = ?
        AND current.updated_at = ?
        AND NOT EXISTS (
          SELECT 1 FROM employee_compensation_components existing
          WHERE existing.company_id = ? AND existing.employee_id = ?
            AND existing.id <> current.id
            AND existing.status NOT IN ('cancelled', 'pending_approval')
            AND existing.effective_from <= COALESCE(?, '9999-12-31')
            AND COALESCE(existing.effective_to, '9999-12-31') >= ?
            AND ${identity.sql}
        )`,
    ).bind(
      input.newId,
      input.companyId,
      input.employeeId,
      input.component.component_definition_id ?? null,
      input.component.component_type,
      input.component.component_code ?? null,
      input.component.component_name,
      input.component.category ?? null,
      input.component.amount,
      input.component.currency ?? "MVR",
      input.component.calculation_type,
      input.component.affects_gross_pay === false ? 0 : 1,
      input.component.affects_net_pay === false ? 0 : 1,
      input.component.effective_from,
      input.status,
      input.component.reason,
      input.component.notes ?? null,
      input.approvalRequestId,
      input.actorUserId,
      timestamp,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
      input.previousId,
      input.expectedCurrent.status,
      input.expectedCurrent.effectiveFrom,
      input.expectedCurrent.effectiveTo ?? null,
      input.expectedCurrent.amount,
      input.expectedCurrent.currency,
      input.expectedCurrent.calculationType,
      input.expectedCurrent.affectsGrossPay,
      input.expectedCurrent.affectsNetPay,
      input.expectedCurrent.revision,
      input.expectedCurrent.updatedAt,
      input.companyId,
      input.employeeId,
      null,
      input.component.effective_from,
      ...identity.values,
    ),
    env.DB.prepare(
      `UPDATE employee_compensation_components
       SET effective_to = ?, status = ?, revision = revision + 1, updated_by = ?, updated_at = ?
       WHERE company_id = ? AND employee_id = ? AND id = ?
         AND revision = ?
         AND updated_at = ?
         AND EXISTS (
           SELECT 1 FROM employee_compensation_components inserted
           WHERE inserted.company_id = ? AND inserted.employee_id = ? AND inserted.id = ?
         )`,
    ).bind(
      input.closePreviousEffectiveTo,
      input.previousStatus,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
      input.previousId,
      input.expectedCurrent.revision,
      input.expectedCurrent.updatedAt,
      input.companyId,
      input.employeeId,
      input.newId,
    ),
    env.DB.prepare(
      `INSERT INTO compensation_approval_applications (
        id, company_id, approval_request_id, employee_id, component_id, action_type, applied_at, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'change', ?, ?
      FROM employee_compensation_components replacement
      WHERE replacement.company_id = ? AND replacement.employee_id = ? AND replacement.id = ?
        AND EXISTS (
          SELECT 1 FROM employee_compensation_components previous
          WHERE previous.company_id = ? AND previous.employee_id = ? AND previous.id = ?
            AND previous.effective_to = ?
            AND previous.status = ?
            AND previous.revision = ?
            AND previous.updated_at = ?
        )`,
    ).bind(
      input.applicationId,
      input.companyId,
      input.approvalRequestId,
      input.employeeId,
      input.newId,
      timestamp,
      timestamp,
      input.companyId,
      input.employeeId,
      input.newId,
      input.companyId,
      input.employeeId,
      input.previousId,
      input.closePreviousEffectiveTo,
      input.previousStatus,
      input.expectedCurrent.revision + 1,
      timestamp,
    ),
  ]);

  return {
    changed:
      (insertResult.meta?.changes ?? 0) === 1 &&
      (closeResult.meta?.changes ?? 0) === 1 &&
      (applicationResult.meta?.changes ?? 0) === 1,
    insertResult,
    closeResult,
    applicationResult,
  };
};

export const endApprovedCompensationComponent = async (
  env: Env,
  input: {
    applicationId: string;
    companyId: string;
    employeeId: string;
    componentId: string;
    component: EmployeeCompensationComponentEndInput;
    actorUserId: string;
    status: string;
    approvalRequestId: string;
    appliedAt: string;
    expectedCurrent: {
      status: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      amount: number;
      currency: string;
      calculationType: string;
      affectsGrossPay: number;
      affectsNetPay: number;
      revision: number;
      updatedAt: string;
    };
  },
) => {
  const timestamp = input.appliedAt;
  const [endResult, applicationResult] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE employee_compensation_components
       SET effective_to = ?, status = ?, reason = ?,
           revision = revision + 1, updated_by = ?, updated_at = ?
       WHERE company_id = ? AND employee_id = ? AND id = ?
         AND status = ?
         AND effective_from = ?
         AND COALESCE(effective_to, '') = COALESCE(?, '')
         AND amount = ?
         AND currency = ?
         AND calculation_type = ?
         AND affects_gross_pay = ?
         AND affects_net_pay = ?
         AND revision = ?
         AND updated_at = ?`,
    ).bind(
      input.component.effective_to,
      input.status,
      input.component.reason,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
      input.componentId,
      input.expectedCurrent.status,
      input.expectedCurrent.effectiveFrom,
      input.expectedCurrent.effectiveTo ?? null,
      input.expectedCurrent.amount,
      input.expectedCurrent.currency,
      input.expectedCurrent.calculationType,
      input.expectedCurrent.affectsGrossPay,
      input.expectedCurrent.affectsNetPay,
      input.expectedCurrent.revision,
      input.expectedCurrent.updatedAt,
    ),
    env.DB.prepare(
      `INSERT INTO compensation_approval_applications (
        id, company_id, approval_request_id, employee_id, component_id, action_type, applied_at, created_at
      )
      SELECT ?, ?, ?, ?, ?, 'end', ?, ?
      FROM employee_compensation_components component
      WHERE component.company_id = ? AND component.employee_id = ? AND component.id = ?
        AND component.effective_to = ?
        AND component.status = ?
        AND component.revision = ?
        AND component.updated_at = ?`,
    ).bind(
      input.applicationId,
      input.companyId,
      input.approvalRequestId,
      input.employeeId,
      input.componentId,
      timestamp,
      timestamp,
      input.companyId,
      input.employeeId,
      input.componentId,
      input.component.effective_to,
      input.status,
      input.expectedCurrent.revision + 1,
      timestamp,
    ),
  ]);

  return {
    changed: (endResult.meta?.changes ?? 0) === 1 && (applicationResult.meta?.changes ?? 0) === 1,
    endResult,
    applicationResult,
  };
};

export const endCompensationComponent = (
  env: Env,
  companyId: string,
  employeeId: string,
  componentId: string,
  input: EmployeeCompensationComponentEndInput,
  actorUserId: string,
  status = "ended",
  _approvalRequestId?: string | null,
  expectedCurrent?: {
    status: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
    amount: number;
    currency: string;
    calculationType: string;
    affectsGrossPay: number;
    affectsNetPay: number;
    revision: number;
    updatedAt: string;
  },
) =>
  execute(
    env,
    `UPDATE employee_compensation_components
     SET effective_to = ?, status = ?, reason = ?,
         revision = revision + 1, updated_by = ?, updated_at = ?
     WHERE company_id = ? AND employee_id = ? AND id = ?
       ${expectedCurrent ? `AND status = ?
       AND effective_from = ?
       AND COALESCE(effective_to, '') = COALESCE(?, '')
       AND amount = ?
       AND currency = ?
       AND calculation_type = ?
       AND affects_gross_pay = ?
       AND affects_net_pay = ?
       AND revision = ?
       AND updated_at = ?` : ""}`,
    [
      input.effective_to,
      status,
      input.reason,
      actorUserId,
      new Date().toISOString(),
      companyId,
      employeeId,
      componentId,
      ...(expectedCurrent
        ? [
            expectedCurrent.status,
            expectedCurrent.effectiveFrom,
            expectedCurrent.effectiveTo ?? null,
            expectedCurrent.amount,
            expectedCurrent.currency,
            expectedCurrent.calculationType,
            expectedCurrent.affectsGrossPay,
            expectedCurrent.affectsNetPay,
            expectedCurrent.revision,
            expectedCurrent.updatedAt,
          ]
        : []),
    ],
  );

export const createJobChangeWithOptionalSalary = (
  env: Env,
  input: {
    jobHistoryId: string;
    salaryHistoryId?: string | null;
    companyId: string;
    employeeId: string;
    actorUserId: string;
    job: {
      oldOutletId?: string | null;
      newOutletId?: string | null;
      oldDepartmentId?: string | null;
      newDepartmentId?: string | null;
      oldPositionId?: string | null;
      newPositionId?: string | null;
      changeType: string;
      effectiveFrom: string;
      reason: string;
    };
    salary?: SalaryHistoryInput | null;
    closePreviousSalary?: { id: string; effectiveTo: string } | null;
    approvalRequestId?: string | null;
  },
) => {
  const timestamp = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE employees
       SET primary_outlet_id = ?, department_id = ?, position_id = ?,
           updated_by = ?, updated_at = ?
       WHERE company_id = ? AND id = ?`,
    ).bind(
      input.job.newOutletId ?? null,
      input.job.newDepartmentId ?? null,
      input.job.newPositionId ?? null,
      input.actorUserId,
      timestamp,
      input.companyId,
      input.employeeId,
    ),
    env.DB.prepare(
      `INSERT INTO employee_job_history (
        id, company_id, employee_id, outlet_id, department_id, position_id,
        old_outlet_id, new_outlet_id, old_department_id, new_department_id,
        old_position_id, new_position_id,
        change_type, effective_from, reason, approval_request_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.jobHistoryId,
      input.companyId,
      input.employeeId,
      input.job.newOutletId ?? null,
      input.job.newDepartmentId ?? null,
      input.job.newPositionId ?? null,
      input.job.oldOutletId ?? null,
      input.job.newOutletId ?? null,
      input.job.oldDepartmentId ?? null,
      input.job.newDepartmentId ?? null,
      input.job.oldPositionId ?? null,
      input.job.newPositionId ?? null,
      input.job.changeType,
      input.job.effectiveFrom,
      input.job.reason,
      input.approvalRequestId ?? null,
      input.actorUserId,
      timestamp,
    ),
  ];

  if (input.salary && input.salaryHistoryId) {
    if (input.closePreviousSalary) {
      statements.push(
        env.DB.prepare(
          `UPDATE employee_salary_history
           SET effective_to = ?, updated_at = ?
           WHERE company_id = ? AND employee_id = ? AND id = ?`,
        ).bind(
          input.closePreviousSalary.effectiveTo,
          timestamp,
          input.companyId,
          input.employeeId,
          input.closePreviousSalary.id,
        ),
      );
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO employee_salary_history (
          id, company_id, employee_id, monthly_salary_amount, currency,
          effective_from, effective_to, reason, approval_request_id, created_by, created_at, change_type, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        input.salaryHistoryId,
        input.companyId,
        input.employeeId,
        input.salary.monthly_salary_amount,
        input.salary.currency ?? "MVR",
        input.salary.effective_from,
        input.salary.reason,
        input.approvalRequestId ?? null,
        input.actorUserId,
        timestamp,
        input.salary.change_type,
        timestamp,
      ),
    );
  }

  return env.DB.batch(statements);
};

export const listDocuments = (
  env: Env,
  companyId: string,
  employeeId: string,
  includeSensitive: boolean,
) =>
  queryMany(
    env,
    `SELECT id, employee_id, document_type,
      CASE
        WHEN is_sensitive = 1 AND ? = 0 THEN 'Sensitive document'
        ELSE file_name
      END AS file_name,
      mime_type, expiry_date, status, is_sensitive, uploaded_by,
      created_at AS uploaded_at, created_at, updated_at
     FROM employee_documents
     WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL
     ORDER BY expiry_date ASC, created_at DESC`,
    [includeSensitive ? 1 : 0, companyId, employeeId],
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

export const findLinkedEmployeeIdForUser = (
  env: Env,
  companyId: string,
  userId: string,
): Promise<{ employee_id: string | null } | null> =>
  queryOne(
    env,
    `SELECT employee_id
     FROM users
     WHERE company_id = ? AND id = ? AND status = 'active' AND deleted_at IS NULL
     LIMIT 1`,
    [companyId, userId],
  );

export const countActiveSuperAdminsExcludingUser = (
  env: Env,
  companyId: string,
  userId: string,
) =>
  queryOne<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
     JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
     WHERE u.company_id = ?
       AND u.id <> ?
       AND u.status = 'active'
       AND u.deleted_at IS NULL
       AND r.role_key = 'super_admin'
       AND r.is_active = 1`,
    [companyId, userId],
  ).then((row) => row?.total ?? 0);

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

export const profileSummary = (
  env: Env,
  companyId: string,
  employeeId: string,
) =>
  queryOne<any>(
    env,
    `${employeeSelect}
     WHERE e.company_id = ? AND e.id = ? AND e.deleted_at IS NULL
     GROUP BY e.id
     LIMIT 1`,
    [companyId, employeeId],
  );

export const profileWarnings = (
  env: Env,
  companyId: string,
  employeeId: string,
) =>
  queryOne<any>(
    env,
    `SELECT
      (SELECT COUNT(*) FROM expiry_alerts a WHERE a.company_id = ? AND a.employee_id = ? AND a.status IN ('open', 'acknowledged', 'snoozed') AND a.severity IN ('critical', 'urgent', 'high')) AS expiring_documents,
      (SELECT COUNT(*) FROM long_leave_records ll WHERE ll.company_id = ? AND ll.employee_id = ? AND ll.status IN ('approved', 'active', 'extended')) AS active_long_leave,
      (SELECT COUNT(*) FROM attendance_daily_summary s WHERE s.company_id = ? AND s.employee_id = ? AND s.attendance_date >= date('now', '-7 day') AND s.status IN ('missing_clock_in', 'missing_clock_out', 'missing_check_in', 'missing_checkout', 'conflict')) AS missing_punches,
      (SELECT COUNT(*) FROM leave_requests l WHERE l.company_id = ? AND l.employee_id = ? AND (l.status IN ('submitted', 'pending', 'pending_approval', 'partially_approved') OR l.approval_status IN ('pending', 'pending_approval'))) AS pending_approvals,
      (SELECT COUNT(*) FROM long_leave_payroll_impacts i WHERE i.company_id = ? AND i.employee_id = ? AND i.status IN ('pending_review', 'blocked')) AS payroll_warnings,
      (SELECT COUNT(*) FROM expiry_alerts a WHERE a.company_id = ? AND a.employee_id = ? AND a.status IN ('open', 'acknowledged', 'snoozed')) AS unresolved_expiry_alerts`,
    [
      companyId,
      employeeId,
      companyId,
      employeeId,
      companyId,
      employeeId,
      companyId,
      employeeId,
      companyId,
      employeeId,
      companyId,
      employeeId,
    ],
  );

export const profileAttendanceSummary = (
  env: Env,
  companyId: string,
  employeeId: string,
  fromDate: string,
  toDate: string,
) =>
  queryOne<any>(
    env,
    `SELECT
      SUM(CASE WHEN status IN ('present', 'checked_in', 'holiday_work') THEN 1 ELSE 0 END) AS present_days,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_days,
      SUM(CASE WHEN COALESCE(late_minutes, 0) > 0 THEN 1 ELSE 0 END) AS late_days,
      SUM(CASE WHEN COALESCE(early_out_minutes, 0) > 0 THEN 1 ELSE 0 END) AS early_checkout_days,
      SUM(CASE WHEN status IN ('missing_clock_in', 'missing_clock_out', 'missing_check_in', 'missing_checkout') THEN 1 ELSE 0 END) AS missing_punch_days,
      SUM(CASE WHEN COALESCE(overtime_minutes, 0) > 0 THEN 1 ELSE 0 END) AS overtime_days,
      SUM(CASE WHEN status = 'holiday_work' THEN 1 ELSE 0 END) AS holiday_work_days
     FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ? AND attendance_date BETWEEN ? AND ?`,
    [companyId, employeeId, fromDate, toDate],
  );

export const profileAttendanceRows = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, attendance_date, first_clock_in, last_clock_out, worked_minutes, late_minutes,
      early_out_minutes, overtime_minutes, status, payroll_status
     FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ?
     ORDER BY attendance_date DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileAttendanceSources = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, device_id, event_type, event_time, attendance_method, source, sync_status, approval_status
     FROM attendance_events
     WHERE company_id = ? AND employee_id = ?
     ORDER BY event_time DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileLeaveBalances = (env: Env, companyId: string, employeeId: string) =>
  queryMany<any>(
    env,
    `SELECT lb.id, lb.leave_type_id, lt.leave_name, lt.leave_key, lb.year, lb.policy_year,
      lb.entitlement_days, lb.opening_balance, lb.accrued_days, lb.used_days, lb.pending_days,
      lb.adjusted_days, lb.carried_forward_days, lb.expired_days,
      COALESCE(lb.available_days, lb.remaining_days) AS available_days,
      lb.last_accrual_date, lb.next_accrual_date, lb.status
     FROM leave_balances lb
     LEFT JOIN leave_types lt ON lt.company_id = lb.company_id AND lt.id = lb.leave_type_id
     WHERE lb.company_id = ? AND lb.employee_id = ?
     ORDER BY lb.year DESC, lt.sort_order, lt.leave_name`,
    [companyId, employeeId],
  );

export const profileLeaveRequests = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT l.id, l.leave_type_id, lt.leave_name, l.start_date, l.end_date, l.total_days,
      l.status, COALESCE(l.approval_status, l.status) AS approval_status, l.reason, l.created_at
     FROM leave_requests l
     LEFT JOIN leave_types lt ON lt.company_id = l.company_id AND lt.id = l.leave_type_id
     WHERE l.company_id = ? AND l.employee_id = ?
     ORDER BY l.start_date DESC, l.created_at DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileLeaveTransactions = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, leave_type_id, leave_request_id, transaction_type, quantity_days,
      balance_before, balance_after, effective_date, source, reason, created_at
     FROM leave_balance_transactions
     WHERE company_id = ? AND employee_id = ?
     ORDER BY effective_date DESC, created_at DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileLongLeave = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, leave_request_id, start_date, expected_return_date, actual_return_date,
      total_days, status, approval_status, payroll_status, salary_treatment, deduction_method,
      reason, submitted_at, approved_at, returned_at, updated_at
     FROM long_leave_records
     WHERE company_id = ? AND employee_id = ?
     ORDER BY start_date DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileLongLeaveImpacts = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, long_leave_id, payroll_month, total_days, long_leave_days, payable_days,
      unpaid_days, deduction_amount, payable_salary, status, calculated_at
     FROM long_leave_payroll_impacts
     WHERE company_id = ? AND employee_id = ?
     ORDER BY payroll_month DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileDocuments = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, document_type, file_name, mime_type, expiry_date, status, is_sensitive,
      uploaded_by, created_at, updated_at
     FROM employee_documents
     WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL
     ORDER BY COALESCE(expiry_date, created_at) DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileContracts = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, contract_number, contract_type, contract_status, start_date, end_date,
      signed_date, probation_end_date, version_number, salary_snapshot_amount, currency,
      position_id, department_id, outlet_id, created_at, updated_at
     FROM employee_contracts
     WHERE company_id = ? AND employee_id = ? AND archived_at IS NULL
     ORDER BY start_date DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileAssets = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT aa.id, aa.asset_id, a.asset_code, a.asset_name, a.asset_type,
      aa.issued_date, aa.returned_date, aa.status, aa.issue_condition, aa.return_condition
     FROM asset_assignments aa
     LEFT JOIN assets a ON a.company_id = aa.company_id AND a.id = aa.asset_id
     WHERE aa.company_id = ? AND aa.employee_id = ?
     ORDER BY aa.issued_date DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileUniforms = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, uniform_type, quantity, issued_date, returned_date, status
     FROM uniform_issues
     WHERE company_id = ? AND employee_id = ?
     ORDER BY issued_date DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileSalarySummary = (env: Env, companyId: string, employeeId: string) =>
  queryOne<any>(
    env,
    `SELECT id, monthly_salary_amount, currency, effective_from, effective_to, reason, created_at
     FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ?
     ORDER BY effective_from DESC, created_at DESC
     LIMIT 1`,
    [companyId, employeeId],
  );

export const profileAlerts = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, source_type, source_label, expiry_date, days_until_expiry, alert_type,
      severity, status, title, message, action_url, acknowledged_at, resolved_at, dismissed_at,
      snoozed_until, created_at, updated_at
     FROM expiry_alerts
     WHERE company_id = ? AND employee_id = ?
     ORDER BY expiry_date ASC, created_at DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileStatusHistory = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, old_status, new_status, reason, changed_by, changed_at, created_at
     FROM employee_status_history
     WHERE company_id = ? AND employee_id = ?
     ORDER BY COALESCE(changed_at, created_at) DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileJobHistory = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, change_type, old_outlet_id, new_outlet_id, old_department_id, new_department_id,
      old_position_id, new_position_id, effective_from, effective_to, reason, created_by, created_at
     FROM employee_job_history
     WHERE company_id = ? AND employee_id = ?
     ORDER BY effective_from DESC, created_at DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const profileAuditTimeline = (env: Env, companyId: string, employeeId: string, limit: number) =>
  queryMany<any>(
    env,
    `SELECT id, module, action, severity, entity_type, entity_id, actor_user_id,
      reason, effective_date, approval_request_id, created_at
     FROM audit_logs
     WHERE company_id = ? AND employee_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [companyId, employeeId, limit],
  );
