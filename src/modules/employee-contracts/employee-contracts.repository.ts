import {
  CONTRACT_STATUSES,
  DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS,
} from "./employee-contracts.constants";
import type {
  ContractCreateInput,
  ContractEmployeeRecord,
  ContractListFilters,
  ContractUpdateInput,
  EmployeeContractRecord,
} from "./employee-contracts.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const activeLikeStatuses = ["draft", "active", "expiring_soon"] as const;

const statusExpression = `
  CASE
    WHEN c.contract_status IN ('renewed', 'archived', 'cancelled') THEN c.contract_status
    WHEN c.end_date IS NOT NULL AND c.end_date < date('now') THEN 'expired'
    WHEN c.end_date IS NOT NULL AND c.end_date <= date('now', '+' || ? || ' day') THEN 'expiring_soon'
    WHEN c.start_date <= date('now') AND (c.end_date IS NULL OR c.end_date >= date('now')) THEN 'active'
    ELSE c.contract_status
  END
`;

const contractSelect = `
  SELECT c.*,
    e.employee_code,
    e.full_name AS employee_name,
    e.employee_type,
    e.primary_outlet_id AS outlet_id,
    o.name AS outlet_name,
    dpt.name AS department_name,
    p.title AS position_title,
    doc.document_type AS document_type,
    doc.file_name AS document_file_name,
    doc.expiry_date AS document_expiry_date,
    doc.status AS document_status,
    CAST(julianday(c.end_date) - julianday(date('now')) AS INTEGER) AS days_until_expiry,
    ${statusExpression} AS effective_status
  FROM employee_contracts c
  JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
  LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = COALESCE(c.outlet_id, e.primary_outlet_id)
  LEFT JOIN departments dpt ON dpt.company_id = e.company_id AND dpt.id = COALESCE(c.department_id, e.department_id)
  LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = COALESCE(c.position_id, e.position_id)
  LEFT JOIN employee_documents doc ON doc.company_id = c.company_id AND doc.id = c.document_id AND doc.deleted_at IS NULL
`;

const mapContract = (row: any): EmployeeContractRecord => ({
  ...row,
  contract_status: row.effective_status ?? row.contract_status,
  document: row.document_id ? {
    id: row.document_id,
    document_type: row.document_type,
    file_name: row.document_file_name,
    expiry_date: row.document_expiry_date,
    status: row.document_status,
  } : null,
  warning: row.end_date && row.effective_status === "expired"
    ? "Contract expired."
    : row.end_date && row.effective_status === "expiring_soon"
      ? "Contract expires soon."
      : row.document_id ? null : "Missing contract document.",
});

const applyOutletScope = (clauses: string[], values: unknown[], outletIds: string[], isSuperAdmin: boolean) => {
  if (isSuperAdmin) return;
  if (outletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  clauses.push(`e.primary_outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
  values.push(...outletIds);
};

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<ContractEmployeeRecord>(
    env,
    `SELECT id, company_id, employee_code, full_name, employee_type,
      primary_outlet_id, department_id, position_id, deleted_at
     FROM employees WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const findDocumentForEmployee = (env: Env, companyId: string, employeeId: string, documentId: string) =>
  one<{ id: string; employee_id: string; company_id: string; document_type: string; file_name: string | null; file_key?: string }>(
    env,
    `SELECT id, employee_id, company_id, document_type, file_name
     FROM employee_documents
     WHERE company_id = ? AND employee_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1`,
    [companyId, employeeId, documentId],
  );

export const findDuplicateContractNumber = (env: Env, companyId: string, contractNumber: string, excludeId?: string) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM employee_contracts
     WHERE company_id = ? AND contract_number = ? AND (? IS NULL OR id <> ?)
     LIMIT 1`,
    [companyId, contractNumber, excludeId ?? null, excludeId ?? null],
  );

export const findOverlappingContract = (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string | null,
  excludeId?: string,
) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM employee_contracts
     WHERE company_id = ? AND employee_id = ?
       AND contract_status IN (${activeLikeStatuses.map(() => "?").join(", ")})
       AND (? IS NULL OR id <> ?)
       AND start_date <= COALESCE(?, '9999-12-31')
       AND COALESCE(end_date, '9999-12-31') >= ?
     LIMIT 1`,
    [companyId, employeeId, ...activeLikeStatuses, excludeId ?? null, excludeId ?? null, endDate, startDate],
  );

export const createContract = (env: Env, input: {
  id: string;
  companyId: string;
  employeeId: string;
  payload: ContractCreateInput & {
    contract_status: string;
    version_number: number;
    renewal_of_contract_id?: string | null;
    created_by: string;
    position_id?: string | null;
    department_id?: string | null;
    outlet_id?: string | null;
  };
}) => {
  const now = new Date().toISOString();
  const payload = input.payload;
  return run(
    env,
    `INSERT INTO employee_contracts (
      id, company_id, employee_id, contract_number, contract_type, contract_status,
      start_date, end_date, signed_date, probation_end_date, renewal_of_contract_id,
      version_number, document_id, salary_snapshot_amount, currency, position_id,
      department_id, outlet_id, notes, reason, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      payload.contract_number ?? null,
      payload.contract_type,
      payload.contract_status,
      payload.start_date,
      payload.end_date ?? null,
      payload.signed_date ?? null,
      payload.probation_end_date ?? null,
      payload.renewal_of_contract_id ?? null,
      payload.version_number,
      payload.document_id ?? null,
      payload.salary_snapshot_amount ?? null,
      payload.currency ?? "MVR",
      payload.position_id ?? null,
      payload.department_id ?? null,
      payload.outlet_id ?? null,
      payload.notes ?? null,
      payload.reason,
      payload.created_by,
      now,
      payload.created_by,
      now,
    ],
  );
};

export const updateContract = (env: Env, companyId: string, contractId: string, input: ContractUpdateInput, updatedBy: string) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of [
    "contract_number",
    "contract_type",
    "contract_status",
    "start_date",
    "end_date",
    "signed_date",
    "probation_end_date",
    "document_id",
    "salary_snapshot_amount",
    "currency",
    "position_id",
    "department_id",
    "outlet_id",
    "notes",
    "reason",
  ] as const) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(input[key] ?? null);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_by = ?", "updated_at = ?");
  values.push(updatedBy, new Date().toISOString(), companyId, contractId);
  return run(env, `UPDATE employee_contracts SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const markRenewedAndCreate = (env: Env, input: {
  oldContractId: string;
  newContractId: string;
  companyId: string;
  employeeId: string;
  actorUserId: string;
  payload: ContractCreateInput & {
    contract_status: string;
    version_number: number;
    renewal_of_contract_id: string;
    position_id?: string | null;
    department_id?: string | null;
    outlet_id?: string | null;
  };
}) => {
  const now = new Date().toISOString();
  return env.DB.batch([
    env.DB.prepare(
      `UPDATE employee_contracts
       SET contract_status = 'renewed', updated_by = ?, updated_at = ?
       WHERE company_id = ? AND id = ?`,
    ).bind(input.actorUserId, now, input.companyId, input.oldContractId),
    env.DB.prepare(
      `INSERT INTO employee_contracts (
        id, company_id, employee_id, contract_number, contract_type, contract_status,
        start_date, end_date, signed_date, probation_end_date, renewal_of_contract_id,
        version_number, document_id, salary_snapshot_amount, currency, position_id,
        department_id, outlet_id, notes, reason, created_by, created_at, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.newContractId,
      input.companyId,
      input.employeeId,
      input.payload.contract_number ?? null,
      input.payload.contract_type,
      input.payload.contract_status,
      input.payload.start_date,
      input.payload.end_date ?? null,
      input.payload.signed_date ?? null,
      input.payload.probation_end_date ?? null,
      input.payload.renewal_of_contract_id,
      input.payload.version_number,
      input.payload.document_id ?? null,
      input.payload.salary_snapshot_amount ?? null,
      input.payload.currency ?? "MVR",
      input.payload.position_id ?? null,
      input.payload.department_id ?? null,
      input.payload.outlet_id ?? null,
      input.payload.notes ?? null,
      input.payload.reason,
      input.actorUserId,
      now,
      input.actorUserId,
      now,
    ),
  ]);
};

export const archiveContract = (env: Env, companyId: string, contractId: string, actorUserId: string, reason: string, notes?: string | null) =>
  run(
    env,
    `UPDATE employee_contracts
     SET contract_status = 'archived', archived_at = ?, archived_by = ?,
       reason = ?, notes = COALESCE(?, notes), updated_by = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [new Date().toISOString(), actorUserId, reason, notes ?? null, actorUserId, new Date().toISOString(), companyId, contractId],
  );

export const findContractById = async (env: Env, companyId: string, employeeId: string, contractId: string, warningDays = DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS) => {
  const row = await one<any>(
    env,
    `${contractSelect}
     WHERE c.company_id = ? AND c.employee_id = ? AND c.id = ? LIMIT 1`,
    [warningDays, companyId, employeeId, contractId],
  );
  return row ? mapContract(row) : null;
};

export const listContractsForEmployee = async (env: Env, companyId: string, employeeId: string, warningDays = DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS) => {
  const rows = await many<any>(
    env,
    `${contractSelect}
     WHERE c.company_id = ? AND c.employee_id = ?
     ORDER BY c.start_date DESC, c.version_number DESC, c.created_at DESC`,
    [warningDays, companyId, employeeId],
  );
  return rows.map(mapContract);
};

const buildListWhere = (
  companyId: string,
  filters: ContractListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
  warningDays: number,
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, outletIds, isSuperAdmin);
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.department_id) { clauses.push("COALESCE(c.department_id, e.department_id) = ?"); values.push(filters.department_id); }
  if (filters.position_id) { clauses.push("COALESCE(c.position_id, e.position_id) = ?"); values.push(filters.position_id); }
  if (filters.contract_type) { clauses.push("c.contract_type = ?"); values.push(filters.contract_type); }
  if (filters.contract_status) { clauses.push(`(${statusExpression}) = ?`); values.push(warningDays, filters.contract_status); }
  if (filters.expiring_within_days) {
    clauses.push("c.end_date IS NOT NULL AND c.end_date >= date('now') AND c.end_date <= date('now', '+' || ? || ' day')");
    values.push(filters.expiring_within_days);
  }
  if (filters.expired) clauses.push("c.end_date IS NOT NULL AND c.end_date < date('now')");
  if (filters.date_from) { clauses.push("c.start_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("COALESCE(c.end_date, c.start_date) <= ?"); values.push(filters.date_to); }
  if (filters.search) {
    clauses.push("(LOWER(e.employee_code) LIKE ? OR LOWER(e.full_name) LIKE ? OR LOWER(COALESCE(c.contract_number, '')) LIKE ?)");
    const pattern = `%${filters.search.toLowerCase()}%`;
    values.push(pattern, pattern, pattern);
  }
  return { sql: clauses.join(" AND "), values };
};

export const listContracts = async (
  env: Env,
  companyId: string,
  filters: ContractListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
  warningDays = DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS,
) => {
  const built = buildListWhere(companyId, filters, outletIds, isSuperAdmin, warningDays);
  const rows = await many<any>(
    env,
    `${contractSelect}
     WHERE ${built.sql}
     ORDER BY c.end_date ASC, c.start_date DESC
     LIMIT ? OFFSET ?`,
    [warningDays, ...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return rows.map(mapContract);
};

export const countContracts = async (
  env: Env,
  companyId: string,
  filters: ContractListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
  warningDays = DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS,
) => {
  const built = buildListWhere(companyId, filters, outletIds, isSuperAdmin, warningDays);
  const counted = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM employee_contracts c
     JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
     WHERE ${built.sql}`,
    built.values,
  );
  return counted?.total ?? 0;
};

export const listContractHistory = (env: Env, companyId: string, employeeId: string, contractId: string) =>
  many<EmployeeContractRecord>(
    env,
    `WITH RECURSIVE chain(id) AS (
      SELECT id FROM employee_contracts WHERE company_id = ? AND employee_id = ? AND id = ?
      UNION
      SELECT c.id FROM employee_contracts c JOIN chain ON c.renewal_of_contract_id = chain.id WHERE c.company_id = ?
      UNION
      SELECT parent.id FROM employee_contracts child JOIN employee_contracts parent
        ON parent.company_id = child.company_id AND parent.id = child.renewal_of_contract_id
       JOIN chain ON child.id = chain.id WHERE parent.company_id = ?
     )
     SELECT * FROM employee_contracts WHERE company_id = ? AND id IN (SELECT id FROM chain)
     ORDER BY version_number ASC, start_date ASC`,
    [companyId, employeeId, contractId, companyId, companyId, companyId],
  );

export const getExpiringContracts = (
  env: Env,
  companyId: string,
  withinDays = DEFAULT_CONTRACT_EXPIRY_WARNING_DAYS,
) =>
  many<EmployeeContractRecord>(
    env,
    `SELECT * FROM employee_contracts
     WHERE company_id = ? AND end_date IS NOT NULL
       AND end_date >= date('now') AND end_date <= date('now', '+' || ? || ' day')
       AND contract_status NOT IN ('renewed', 'archived', 'cancelled')
     ORDER BY end_date ASC`,
    [companyId, withinDays],
  );

export const getExpiredContracts = (env: Env, companyId: string) =>
  many<EmployeeContractRecord>(
    env,
    `SELECT * FROM employee_contracts
     WHERE company_id = ? AND end_date IS NOT NULL AND end_date < date('now')
       AND contract_status NOT IN ('renewed', 'archived', 'cancelled')
     ORDER BY end_date DESC`,
    [companyId],
  );
