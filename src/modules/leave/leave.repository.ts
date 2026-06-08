import type {
  LeaveBalanceFilters,
  LeaveBalanceRecord,
  LeaveBalanceTransactionFilters,
  LeaveBalanceTransactionRecord,
  LeaveCalendarFilters,
  LeaveApprovalStepRecord,
  LeaveEmployeeRecord,
  LeaveOutletScope,
  LeavePolicyFilters,
  LeavePolicyInput,
  LeavePolicyRecord,
  LeavePolicyUpdateInput,
  LeaveRequestFilters,
  LeaveRequestRecord,
  LeaveTypeFilters,
  LeaveTypeRecord,
} from "./leave.types";

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

const batch = (env: Env, statements: D1PreparedStatement[]) => env.DB.batch(statements);

const applyOutletScope = (
  clauses: string[],
  values: unknown[],
  alias: string,
  filters: { outlet_id?: string },
  scope: LeaveOutletScope,
) => {
  if (scope.isSuperAdmin) return;
  if (scope.outletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  if (filters.outlet_id && !scope.outletIds.includes(filters.outlet_id)) {
    clauses.push("1 = 0");
    return;
  }
  clauses.push(`${alias}.primary_outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
  values.push(...scope.outletIds);
};

const paginate = (page: number, pageSize: number) => [pageSize, (page - 1) * pageSize];

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<LeaveEmployeeRecord>(
    env,
    `SELECT id, employee_code, full_name, employee_type, primary_outlet_id,
      department_id, position_id, employment_status, deleted_at,
      date_of_joining, hire_date, joined_at, exit_date, termination_date
     FROM employees WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const listLeaveTypes = (env: Env, companyId: string, filters: LeaveTypeFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.is_enabled !== undefined) { clauses.push("is_enabled = ?"); values.push(filters.is_enabled === "true" || filters.is_enabled === "1" ? 1 : 0); }
  if (filters.is_statutory !== undefined) { clauses.push("is_statutory = ?"); values.push(filters.is_statutory === "true" || filters.is_statutory === "1" ? 1 : 0); }
  if (filters.is_paid !== undefined) { clauses.push("is_paid = ?"); values.push(filters.is_paid === "true" || filters.is_paid === "1" ? 1 : 0); }
  if (filters.search) { clauses.push("(leave_name LIKE ? OR leave_key LIKE ?)"); values.push(`%${filters.search}%`, `%${filters.search}%`); }
  return many<LeaveTypeRecord>(
    env,
    `SELECT * FROM leave_types WHERE ${clauses.join(" AND ")} ORDER BY leave_name LIMIT ? OFFSET ?`,
    [...values, ...paginate(filters.page, filters.page_size)],
  );
};

export const countLeaveTypes = async (env: Env, companyId: string, filters: LeaveTypeFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.is_enabled !== undefined) { clauses.push("is_enabled = ?"); values.push(filters.is_enabled === "true" || filters.is_enabled === "1" ? 1 : 0); }
  if (filters.is_statutory !== undefined) { clauses.push("is_statutory = ?"); values.push(filters.is_statutory === "true" || filters.is_statutory === "1" ? 1 : 0); }
  if (filters.is_paid !== undefined) { clauses.push("is_paid = ?"); values.push(filters.is_paid === "true" || filters.is_paid === "1" ? 1 : 0); }
  if (filters.search) { clauses.push("(leave_name LIKE ? OR leave_key LIKE ?)"); values.push(`%${filters.search}%`, `%${filters.search}%`); }
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM leave_types WHERE ${clauses.join(" AND ")}`, values);
  return row?.total ?? 0;
};

export const findLeaveType = (env: Env, companyId: string, id: string) =>
  one<LeaveTypeRecord>(env, "SELECT * FROM leave_types WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const updateLeaveType = (
  env: Env,
  companyId: string,
  id: string,
  values: Record<string, number | string | null | undefined>,
) => {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      params.push(value);
    }
  }
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE leave_types SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, params);
};

export const listPolicies = (env: Env, companyId: string, filters: LeavePolicyFilters) => {
  const clauses = ["p.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.employee_type) { clauses.push("p.employee_type = ?"); values.push(filters.employee_type); }
  if (filters.leave_type_id) { clauses.push("p.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.status) { clauses.push("p.status = ?"); values.push(filters.status); }
  if (filters.effective_from) { clauses.push("p.effective_from >= ?"); values.push(filters.effective_from); }
  return many<LeavePolicyRecord & { leave_type_name: string }>(
    env,
    `SELECT p.*, lt.leave_name AS leave_type_name
     FROM leave_policies p JOIN leave_types lt ON lt.id = p.leave_type_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY p.effective_from DESC LIMIT ? OFFSET ?`,
    [...values, ...paginate(filters.page, filters.page_size)],
  );
};

export const countPolicies = async (env: Env, companyId: string, filters: LeavePolicyFilters) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.employee_type) { clauses.push("employee_type = ?"); values.push(filters.employee_type); }
  if (filters.leave_type_id) { clauses.push("leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.effective_from) { clauses.push("effective_from >= ?"); values.push(filters.effective_from); }
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM leave_policies WHERE ${clauses.join(" AND ")}`, values);
  return row?.total ?? 0;
};

export const findPolicy = (env: Env, companyId: string, id: string) =>
  one<LeavePolicyRecord>(env, "SELECT * FROM leave_policies WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const findActivePolicyForEmployee = (
  env: Env,
  companyId: string,
  employeeType: string,
  leaveTypeId: string,
  effectiveDate: string,
) =>
  one<LeavePolicyRecord>(
    env,
    `SELECT * FROM leave_policies
     WHERE company_id = ? AND leave_type_id = ? AND status = 'active'
       AND (employee_type IS NULL OR employee_type = ?)
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY CASE WHEN employee_type = ? THEN 0 ELSE 1 END, effective_from DESC
     LIMIT 1`,
    [companyId, leaveTypeId, employeeType, effectiveDate, effectiveDate, employeeType],
  );

export const createPolicy = (env: Env, id: string, companyId: string, input: LeavePolicyInput) =>
  run(
    env,
    `INSERT INTO leave_policies (
      id, company_id, policy_name, employee_type, leave_type_id, entitlement_days,
      carry_forward_days, allow_negative_balance, max_continuous_days, effective_from,
      effective_to, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      companyId,
      input.policy_name,
      input.employee_type ?? null,
      input.leave_type_id,
      input.entitlement_days,
      input.carry_forward_days ?? 0,
      input.allow_negative_balance ? 1 : 0,
      input.max_continuous_days ?? null,
      input.effective_from,
      input.effective_to ?? null,
      input.status ?? "active",
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updatePolicy = (env: Env, companyId: string, id: string, input: LeavePolicyUpdateInput) => {
  const allowed: Array<keyof LeavePolicyUpdateInput> = [
    "policy_name", "employee_type", "leave_type_id", "entitlement_days", "carry_forward_days",
    "allow_negative_balance", "max_continuous_days", "effective_from", "effective_to", "status",
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      const value = input[key];
      values.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
    }
  }
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE leave_policies SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

const balanceWhere = (companyId: string, filters: LeaveBalanceFilters, scope: LeaveOutletScope) => {
  const clauses = ["b.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.employee_id) { clauses.push("b.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.department_id) { clauses.push("e.department_id = ?"); values.push(filters.department_id); }
  if (filters.leave_type_id) { clauses.push("b.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.year) { clauses.push("b.year = ?"); values.push(filters.year); }
  if (filters.status) { clauses.push("COALESCE(b.status, 'active') = ?"); values.push(filters.status); }
  return { sql: clauses.join(" AND "), values };
};

export const listBalances = (env: Env, companyId: string, filters: LeaveBalanceFilters, scope: LeaveOutletScope) => {
  const built = balanceWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT b.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id,
      o.name AS outlet_name, dep.name AS department_name, lt.leave_name AS leave_type_name,
      (b.opening_balance + b.accrued_days + COALESCE(b.adjusted_days, 0) + COALESCE(b.carried_forward_days, 0)
        - b.used_days - COALESCE(b.pending_days, 0) - COALESCE(b.expired_days, 0)) AS calculated_available_days
     FROM leave_balances b
     JOIN employees e ON e.id = b.employee_id
     JOIN leave_types lt ON lt.id = b.leave_type_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     LEFT JOIN departments dep ON dep.id = e.department_id
     WHERE ${built.sql}
     ORDER BY e.full_name ASC, lt.leave_name ASC LIMIT ? OFFSET ?`,
    [...built.values, ...paginate(filters.page, filters.page_size)],
  );
};

export const countBalances = async (env: Env, companyId: string, filters: LeaveBalanceFilters, scope: LeaveOutletScope) => {
  const built = balanceWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM leave_balances b JOIN employees e ON e.id = b.employee_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listEmployeeBalances = (env: Env, companyId: string, employeeId: string) =>
  many<LeaveBalanceRecord & { leave_type_name: string }>(
    env,
    `SELECT b.*, lt.leave_name AS leave_type_name,
      (b.opening_balance + b.accrued_days + COALESCE(b.adjusted_days, 0) + COALESCE(b.carried_forward_days, 0)
        - b.used_days - COALESCE(b.pending_days, 0) - COALESCE(b.expired_days, 0)) AS calculated_available_days
     FROM leave_balances b JOIN leave_types lt ON lt.id = b.leave_type_id
     WHERE b.company_id = ? AND b.employee_id = ?
     ORDER BY b.year DESC, lt.leave_name ASC`,
    [companyId, employeeId],
  );

export const findBalance = (env: Env, companyId: string, employeeId: string, leaveTypeId: string, year: number) =>
  one<LeaveBalanceRecord>(
    env,
    "SELECT * FROM leave_balances WHERE company_id = ? AND employee_id = ? AND leave_type_id = ? AND year = ? LIMIT 1",
    [companyId, employeeId, leaveTypeId, year],
  );

const prepareUpsertBalance = (env: Env, balance: LeaveBalanceRecord) =>
  bind(
    env.DB.prepare(
    `INSERT INTO leave_balances (
      id, company_id, employee_id, leave_type_id, year, opening_balance,
      accrued_days, used_days, remaining_days, pending_days, adjusted_days,
      carried_forward_days, expired_days, available_days, entitlement_days,
      policy_year, accrual_period_start, accrual_period_end, last_accrual_date,
      next_accrual_date, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, employee_id, leave_type_id, year)
    DO UPDATE SET opening_balance = excluded.opening_balance,
      accrued_days = excluded.accrued_days, used_days = excluded.used_days,
      remaining_days = excluded.remaining_days, pending_days = excluded.pending_days,
      adjusted_days = excluded.adjusted_days, carried_forward_days = excluded.carried_forward_days,
      expired_days = excluded.expired_days, available_days = excluded.available_days,
      entitlement_days = excluded.entitlement_days, policy_year = excluded.policy_year,
      accrual_period_start = excluded.accrual_period_start,
      accrual_period_end = excluded.accrual_period_end,
      last_accrual_date = excluded.last_accrual_date,
      next_accrual_date = excluded.next_accrual_date,
      status = excluded.status, updated_at = excluded.updated_at`,
    ),
    [
      balance.id,
      balance.company_id,
      balance.employee_id,
      balance.leave_type_id,
      balance.year,
      balance.opening_balance,
      balance.accrued_days,
      balance.used_days,
      balance.remaining_days,
      balance.pending_days ?? 0,
      balance.adjusted_days ?? 0,
      balance.carried_forward_days ?? 0,
      balance.expired_days ?? 0,
      balance.available_days ?? balance.remaining_days,
      balance.entitlement_days ?? balance.opening_balance + balance.accrued_days,
      balance.policy_year ?? balance.year,
      balance.accrual_period_start ?? `${balance.year}-01-01`,
      balance.accrual_period_end ?? `${balance.year}-12-31`,
      balance.last_accrual_date ?? null,
      balance.next_accrual_date ?? null,
      balance.status ?? "active",
      balance.created_at ?? balance.updated_at,
      balance.updated_at,
    ],
  );

export const upsertBalance = (env: Env, balance: LeaveBalanceRecord) =>
  prepareUpsertBalance(env, balance).run();

export const findTransactionByIdempotencyKey = (env: Env, companyId: string, idempotencyKey: string) =>
  one<LeaveBalanceTransactionRecord>(
    env,
    "SELECT * FROM leave_balance_transactions WHERE company_id = ? AND idempotency_key = ? LIMIT 1",
    [companyId, idempotencyKey],
  );

const prepareCreateBalanceTransaction = (env: Env, transaction: LeaveBalanceTransactionRecord) =>
  bind(
    env.DB.prepare(
    `INSERT INTO leave_balance_transactions (
      id, company_id, employee_id, leave_type_id, balance_id, leave_request_id,
      transaction_type, quantity_days, balance_before, balance_after,
      effective_date, reason, source, idempotency_key, created_by, created_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    [
      transaction.id,
      transaction.company_id,
      transaction.employee_id,
      transaction.leave_type_id,
      transaction.balance_id,
      transaction.leave_request_id,
      transaction.transaction_type,
      transaction.quantity_days,
      transaction.balance_before,
      transaction.balance_after,
      transaction.effective_date,
      transaction.reason,
      transaction.source,
      transaction.idempotency_key,
      transaction.created_by,
      transaction.created_at,
      transaction.metadata_json,
    ],
  );

export const createBalanceTransaction = (env: Env, transaction: LeaveBalanceTransactionRecord) =>
  prepareCreateBalanceTransaction(env, transaction).run();

export const createBalanceTransactionAndUpdateBalance = (
  env: Env,
  transaction: LeaveBalanceTransactionRecord,
  balance: LeaveBalanceRecord,
) =>
  batch(env, [
    prepareCreateBalanceTransaction(env, transaction),
    prepareUpsertBalance(env, balance),
  ]);

export const listBalanceTransactions = (
  env: Env,
  companyId: string,
  filters: LeaveBalanceTransactionFilters,
  scope: LeaveOutletScope,
) => {
  const clauses = ["t.company_id = ?", "t.employee_id = ?"];
  const values: unknown[] = [companyId, filters.employee_id];
  applyOutletScope(clauses, values, "e", {}, scope);
  if (filters.leave_type_id) { clauses.push("t.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.year) {
    clauses.push("substr(t.effective_date, 1, 4) = ?");
    values.push(String(filters.year));
  }
  if (filters.transaction_type) { clauses.push("t.transaction_type = ?"); values.push(filters.transaction_type); }
  return many<LeaveBalanceTransactionRecord & { leave_type_name: string; employee_name: string }>(
    env,
    `SELECT t.*, lt.leave_name AS leave_type_name, e.full_name AS employee_name
     FROM leave_balance_transactions t
     JOIN employees e ON e.company_id = t.company_id AND e.id = t.employee_id
     JOIN leave_types lt ON lt.company_id = t.company_id AND lt.id = t.leave_type_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY t.effective_date DESC, t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, ...paginate(filters.page, filters.page_size)],
  );
};

export const listBalanceTransactionsForRebuild = (
  env: Env,
  companyId: string,
  employeeId: string,
  leaveTypeId: string,
  year: number,
) =>
  many<LeaveBalanceTransactionRecord>(
    env,
    `SELECT * FROM leave_balance_transactions
     WHERE company_id = ? AND employee_id = ? AND leave_type_id = ?
       AND substr(effective_date, 1, 4) = ?
     ORDER BY effective_date ASC, created_at ASC, id ASC`,
    [companyId, employeeId, leaveTypeId, String(year)],
  );

export const countBalanceTransactions = async (
  env: Env,
  companyId: string,
  filters: LeaveBalanceTransactionFilters,
  scope: LeaveOutletScope,
) => {
  const clauses = ["t.company_id = ?", "t.employee_id = ?"];
  const values: unknown[] = [companyId, filters.employee_id];
  applyOutletScope(clauses, values, "e", {}, scope);
  if (filters.leave_type_id) { clauses.push("t.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.year) { clauses.push("substr(t.effective_date, 1, 4) = ?"); values.push(String(filters.year)); }
  if (filters.transaction_type) { clauses.push("t.transaction_type = ?"); values.push(filters.transaction_type); }
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM leave_balance_transactions t
     JOIN employees e ON e.company_id = t.company_id AND e.id = t.employee_id
     WHERE ${clauses.join(" AND ")}`,
    values,
  );
  return row?.total ?? 0;
};

export const listAccrualLeaveTypes = (env: Env, companyId: string, leaveTypeId?: string) => {
  const clauses = ["company_id = ?", "is_enabled = 1", "COALESCE(accrual_enabled, 0) = 1"];
  const values: unknown[] = [companyId];
  if (leaveTypeId) { clauses.push("id = ?"); values.push(leaveTypeId); }
  return many<LeaveTypeRecord>(env, `SELECT * FROM leave_types WHERE ${clauses.join(" AND ")} ORDER BY sort_order, leave_name`, values);
};

export const listEligibleEmployeesForAccrual = (
  env: Env,
  companyId: string,
  filters: { employee_id?: string; outlet_id?: string; department_id?: string },
  scope: LeaveOutletScope,
) => {
  const clauses = ["company_id = ?", "deleted_at IS NULL", "employment_status IN ('active', 'confirmed', 'on_leave')"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "employees", filters, scope);
  if (filters.employee_id) { clauses.push("id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.department_id) { clauses.push("department_id = ?"); values.push(filters.department_id); }
  return many<LeaveEmployeeRecord>(
    env,
    `SELECT id, employee_code, full_name, employee_type, primary_outlet_id,
      department_id, position_id, employment_status, deleted_at,
      date_of_joining, hire_date, joined_at, exit_date, termination_date
     FROM employees WHERE ${clauses.join(" AND ")} ORDER BY employee_code`,
    values,
  );
};

const requestWhere = (companyId: string, filters: LeaveRequestFilters, scope: LeaveOutletScope) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.department_id) { clauses.push("e.department_id = ?"); values.push(filters.department_id); }
  if (filters.leave_type_id) { clauses.push("r.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.employee_type) { clauses.push("e.employee_type = ?"); values.push(filters.employee_type); }
  if (filters.approval_status) { clauses.push("COALESCE(r.approval_status, r.status) = ?"); values.push(filters.approval_status); }
  if (filters.date_from) { clauses.push("r.end_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("r.start_date <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const listRequests = (env: Env, companyId: string, filters: LeaveRequestFilters, scope: LeaveOutletScope) => {
  const built = requestWhere(companyId, filters, scope);
  const sort = filters.sort_by === "employee_name" ? "e.full_name" : filters.sort_by === "leave_type_name" ? "lt.leave_name" : `r.${filters.sort_by}`;
  return many<any>(
    env,
    `SELECT r.id, r.employee_id, e.employee_code, e.full_name AS employee_name,
      e.primary_outlet_id AS outlet_id, o.name AS outlet_name, lt.leave_name AS leave_type_name,
      r.start_date, r.end_date, r.total_days, r.status, r.affects_payroll,
      r.approval_request_id, COALESCE(r.approval_status, r.status) AS approval_status,
      r.created_by AS requested_by, r.submitted_at, r.approved_at, r.rejected_at, r.cancelled_at, r.withdrawn_at,
      r.created_at, 'view,approve,reject,cancel,withdraw,delegate,timeline' AS actions_available
     FROM leave_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${built.sql}
     ORDER BY ${sort} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...built.values, ...paginate(filters.page, filters.page_size)],
  );
};

export const countRequests = async (env: Env, companyId: string, filters: LeaveRequestFilters, scope: LeaveOutletScope) => {
  const built = requestWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM leave_requests r JOIN employees e ON e.id = r.employee_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findRequest = (env: Env, companyId: string, id: string) =>
  one<LeaveRequestRecord & { employee_code: string; employee_name: string; outlet_id: string | null; leave_type_name: string }>(
    env,
    `SELECT r.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, lt.leave_name AS leave_type_name
     FROM leave_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     WHERE r.company_id = ? AND r.id = ? LIMIT 1`,
    [companyId, id],
  );

export const findOverlappingRequest = (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
) =>
  one<LeaveRequestRecord>(
    env,
    `SELECT * FROM leave_requests
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('pending', 'approved', 'direct_approved')
       AND start_date <= ? AND end_date >= ?
       ${excludeId ? "AND id <> ?" : ""}
     LIMIT 1`,
    excludeId ? [companyId, employeeId, endDate, startDate, excludeId] : [companyId, employeeId, endDate, startDate],
  );

export const findApprovalWorkflow = (env: Env, companyId: string, workflowKey: string) =>
  one<{ id: string; approval_mode: string; is_enabled: number }>(
    env,
    "SELECT id, approval_mode, is_enabled FROM approval_workflows WHERE company_id = ? AND workflow_key = ? LIMIT 1",
    [companyId, workflowKey],
  );

export const listWorkflowSteps = (env: Env, companyId: string, workflowId: string) =>
  many<{ id: string; step_order: number; approver_role_key: string | null; required_permission_key: string | null; approval_type: string | null }>(
    env,
    `SELECT id, step_order, required_role_key AS approver_role_key, required_permission_key, approval_type
     FROM approval_steps
     WHERE company_id = ? AND workflow_id = ? AND is_required = 1
     ORDER BY step_order ASC`,
    [companyId, workflowId],
  );

export interface LeaveGenericApprovalRequestInput {
  id: string;
  companyId: string;
  workflowId: string;
  module: string;
  entityType: string;
  entityId: string;
  employeeId: string;
  requestedBy: string;
  summary: string;
  payloadJson: string;
}

const prepareCreateApprovalRequest = (env: Env, input: LeaveGenericApprovalRequestInput) =>
  bind(
    env.DB.prepare(
      `INSERT INTO approval_requests (
      id, company_id, workflow_id, module, entity_type, entity_id,
      employee_id, requested_by, status, current_step, summary, payload_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?)`,
    ),
    [
      input.id,
      input.companyId,
      input.workflowId,
      input.module,
      input.entityType,
      input.entityId,
      input.employeeId,
      input.requestedBy,
      input.summary,
      input.payloadJson,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const createApprovalRequest = (env: Env, input: LeaveGenericApprovalRequestInput) =>
  prepareCreateApprovalRequest(env, input).run();

export const findGenericApprovalRequestByEntity = (
  env: Env,
  companyId: string,
  entityType: string,
  entityId: string,
) =>
  one<{ id: string; status: string; current_step: number | null; workflow_id: string }>(
    env,
    `SELECT id, status, current_step, workflow_id
     FROM approval_requests
     WHERE company_id = ? AND entity_type = ? AND entity_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [companyId, entityType, entityId],
  );

const prepareUpdateGenericApprovalRequest = (
  env: Env,
  companyId: string,
  approvalRequestId: string,
  values: { status?: string; current_step?: number | null },
) => {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (values.status !== undefined) {
    sets.push("status = ?");
    params.push(values.status);
  }
  if (values.current_step !== undefined) {
    sets.push("current_step = COALESCE(?, current_step)");
    params.push(values.current_step);
  }
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), companyId, approvalRequestId);
  return bind(env.DB.prepare(`UPDATE approval_requests SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`), params);
};

export const updateGenericApprovalRequest = (
  env: Env,
  companyId: string,
  approvalRequestId: string,
  values: { status?: string; current_step?: number | null },
) =>
  prepareUpdateGenericApprovalRequest(env, companyId, approvalRequestId, values).run();

const prepareCreateRequest = (env: Env, request: LeaveRequestRecord) =>
  bind(
    env.DB.prepare(
    `INSERT INTO leave_requests (
      id, company_id, employee_id, leave_type_id, start_date, end_date,
      total_days, reason, status, created_by, approval_request_id,
      approval_status, submitted_at, submitted_by, affects_payroll,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    [
      request.id,
      request.company_id,
      request.employee_id,
      request.leave_type_id,
      request.start_date,
      request.end_date,
      request.total_days,
      request.reason,
      request.status,
      request.created_by,
      request.approval_request_id,
      request.approval_status ?? null,
      request.submitted_at ?? null,
      request.submitted_by ?? null,
      request.affects_payroll,
      request.created_at,
      request.updated_at,
    ],
  );

export const createRequest = (env: Env, request: LeaveRequestRecord) =>
  prepareCreateRequest(env, request).run();

const prepareUpdateRequest = (env: Env, companyId: string, id: string, values: Partial<LeaveRequestRecord>) => {
  const allowed: Array<keyof LeaveRequestRecord> = [
    "leave_type_id", "start_date", "end_date", "total_days", "reason", "status", "approval_request_id",
    "approval_status", "submitted_at", "submitted_by", "approved_at", "approved_by", "rejected_at", "rejected_by",
    "cancelled_at", "cancelled_by", "withdrawn_at", "withdrawn_by", "decision_reason", "affects_payroll",
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (values[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(values[key]);
    }
  }
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), companyId, id);
  return bind(env.DB.prepare(`UPDATE leave_requests SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`), params);
};

export const updateRequest = (env: Env, companyId: string, id: string, values: Partial<LeaveRequestRecord>) =>
  prepareUpdateRequest(env, companyId, id, values).run();

export interface LeaveBalanceBatchEntry {
  transaction: LeaveBalanceTransactionRecord;
  balance: LeaveBalanceRecord;
}

const prepareCreateApprovalStep = (env: Env, step: LeaveApprovalStepRecord) =>
  bind(
    env.DB.prepare(
      `INSERT INTO leave_approval_steps (
        id, company_id, leave_request_id, step_order, approver_type,
        approver_user_id, approver_role_id, approver_role_key,
        required_permission_key, status, decision_by, decision_at,
        decision_note, delegated_to, delegated_by, delegated_at, due_at,
        created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM leave_approval_steps
        WHERE company_id = ? AND leave_request_id = ? AND step_order = ?
      )`,
    ),
    [
      step.id,
      step.company_id,
      step.leave_request_id,
      step.step_order,
      step.approver_type,
      step.approver_user_id,
      step.approver_role_id,
      step.approver_role_key,
      step.required_permission_key,
      step.status,
      step.decision_by,
      step.decision_at,
      step.decision_note,
      step.delegated_to,
      step.delegated_by,
      step.delegated_at,
      step.due_at,
      step.created_at,
      step.updated_at,
      step.company_id,
      step.leave_request_id,
      step.step_order,
    ],
  );

const prepareUpdateApprovalStep = (
  env: Env,
  companyId: string,
  stepId: string,
  values: Partial<LeaveApprovalStepRecord>,
) => {
  const allowed: Array<keyof LeaveApprovalStepRecord> = [
    "status", "approver_type", "approver_user_id", "approver_role_id", "approver_role_key", "required_permission_key",
    "decision_by", "decision_at", "decision_note",
    "delegated_to", "delegated_by", "delegated_at", "due_at",
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (values[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(values[key]);
    }
  }
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), companyId, stepId);
  return bind(env.DB.prepare(`UPDATE leave_approval_steps SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`), params);
};

export const createLeaveRequestWithBalanceTransaction = (
  env: Env,
  request: LeaveRequestRecord,
  entry: LeaveBalanceBatchEntry,
) =>
  batch(env, [
    prepareCreateRequest(env, request),
    prepareCreateBalanceTransaction(env, entry.transaction),
    prepareUpsertBalance(env, entry.balance),
  ]);

export const createLeaveRequestWithApprovalWorkflow = (
  env: Env,
  request: LeaveRequestRecord,
  approvalRequest: LeaveGenericApprovalRequestInput | null,
  steps: LeaveApprovalStepRecord[],
  entry?: LeaveBalanceBatchEntry | null,
) =>
  batch(env, [
    prepareCreateRequest(env, request),
    ...(approvalRequest ? [prepareCreateApprovalRequest(env, approvalRequest)] : []),
    ...steps.map((step) => prepareCreateApprovalStep(env, step)),
    ...(entry ? [prepareCreateBalanceTransaction(env, entry.transaction), prepareUpsertBalance(env, entry.balance)] : []),
  ]);

export const submitLeaveRequestWithApprovalWorkflow = (
  env: Env,
  companyId: string,
  requestId: string,
  requestValues: Partial<LeaveRequestRecord>,
  approvalRequest: LeaveGenericApprovalRequestInput | null,
  steps: LeaveApprovalStepRecord[],
  entry?: LeaveBalanceBatchEntry | null,
) =>
  batch(env, [
    prepareUpdateRequest(env, companyId, requestId, requestValues),
    ...(approvalRequest ? [prepareCreateApprovalRequest(env, approvalRequest)] : []),
    ...steps.map((step) => prepareCreateApprovalStep(env, step)),
    ...(entry ? [prepareCreateBalanceTransaction(env, entry.transaction), prepareUpsertBalance(env, entry.balance)] : []),
  ]);

export const updateLeaveRequestStatusWithBalanceTransaction = (
  env: Env,
  companyId: string,
  requestId: string,
  values: Partial<LeaveRequestRecord>,
  entry: LeaveBalanceBatchEntry,
  approvalRequestUpdate?: { id: string; status?: string; current_step?: number | null } | null,
) =>
  batch(env, [
    prepareUpdateRequest(env, companyId, requestId, values),
    ...(approvalRequestUpdate ? [prepareUpdateGenericApprovalRequest(env, companyId, approvalRequestUpdate.id, approvalRequestUpdate)] : []),
    prepareCreateBalanceTransaction(env, entry.transaction),
    prepareUpsertBalance(env, entry.balance),
  ]);

export const updateLeaveRequestStatus = (
  env: Env,
  companyId: string,
  requestId: string,
  values: Partial<LeaveRequestRecord>,
  approvalRequestUpdate?: { id: string; status?: string; current_step?: number | null } | null,
) =>
  batch(env, [
    prepareUpdateRequest(env, companyId, requestId, values),
    ...(approvalRequestUpdate ? [prepareUpdateGenericApprovalRequest(env, companyId, approvalRequestUpdate.id, approvalRequestUpdate)] : []),
  ]);

export const updateLeaveApprovalStepAndRequestStatus = (
  env: Env,
  companyId: string,
  requestId: string,
  stepId: string,
  stepValues: Partial<LeaveApprovalStepRecord>,
  requestValues: Partial<LeaveRequestRecord>,
  entry?: LeaveBalanceBatchEntry | null,
  approvalRequestUpdate?: { id: string; status?: string; current_step?: number | null } | null,
) =>
  batch(env, [
    prepareUpdateApprovalStep(env, companyId, stepId, stepValues),
    prepareUpdateRequest(env, companyId, requestId, requestValues),
    ...(approvalRequestUpdate ? [prepareUpdateGenericApprovalRequest(env, companyId, approvalRequestUpdate.id, approvalRequestUpdate)] : []),
    ...(entry ? [prepareCreateBalanceTransaction(env, entry.transaction), prepareUpsertBalance(env, entry.balance)] : []),
  ]);

export const updateLeaveApprovalStep = (
  env: Env,
  companyId: string,
  stepId: string,
  values: Partial<LeaveApprovalStepRecord>,
) =>
  prepareUpdateApprovalStep(env, companyId, stepId, values).run();

export const updatePendingLeaveRequestWithRebalance = (
  env: Env,
  companyId: string,
  requestId: string,
  values: Partial<LeaveRequestRecord>,
  entries: LeaveBalanceBatchEntry[],
) =>
  batch(env, [
    prepareUpdateRequest(env, companyId, requestId, values),
    ...entries.flatMap((entry) => [
      prepareCreateBalanceTransaction(env, entry.transaction),
      prepareUpsertBalance(env, entry.balance),
    ]),
  ]);

export const listApprovalSteps = (env: Env, companyId: string, requestId: string) =>
  many<LeaveApprovalStepRecord>(
    env,
    `SELECT * FROM leave_approval_steps
     WHERE company_id = ? AND leave_request_id = ?
     ORDER BY step_order ASC`,
    [companyId, requestId],
  );

export const findCurrentApprovalStep = (env: Env, companyId: string, requestId: string) =>
  one<LeaveApprovalStepRecord>(
    env,
    `SELECT * FROM leave_approval_steps
     WHERE company_id = ? AND leave_request_id = ? AND status IN ('pending', 'delegated')
     ORDER BY step_order ASC LIMIT 1`,
    [companyId, requestId],
  );

export const countPendingApprovalSteps = async (env: Env, companyId: string, requestId: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM leave_approval_steps
     WHERE company_id = ? AND leave_request_id = ? AND status IN ('pending', 'delegated')`,
    [companyId, requestId],
  );
  return row?.total ?? 0;
};

export const countApprovalSteps = async (env: Env, companyId: string, requestId: string) => {
  const row = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM leave_approval_steps WHERE company_id = ? AND leave_request_id = ?",
    [companyId, requestId],
  );
  return row?.total ?? 0;
};

export const actorHasRoleKey = async (env: Env, companyId: string, userId: string, roleKey: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM user_roles ur
     JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
     WHERE ur.company_id = ? AND ur.user_id = ? AND r.role_key = ? AND r.is_active = 1`,
    [companyId, userId, roleKey],
  );
  return Number(row?.total ?? 0) > 0;
};

export const listApprovalInbox = (env: Env, companyId: string, filters: LeaveRequestFilters, scope: LeaveOutletScope, actorUserId: string, permissions: string[]) => {
  const clauses = ["r.company_id = ?", "r.status IN ('pending', 'pending_approval', 'partially_approved')", "s.status IN ('pending', 'delegated')"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.department_id) { clauses.push("e.department_id = ?"); values.push(filters.department_id); }
  if (filters.leave_type_id) { clauses.push("r.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.date_from) { clauses.push("r.end_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("r.start_date <= ?"); values.push(filters.date_to); }
  if (permissions.length > 0) {
    clauses.push(`(
      s.approver_user_id = ?
      OR s.delegated_to = ?
      OR s.required_permission_key IN (${permissions.map(() => "?").join(", ")})
    )`);
    values.push(actorUserId, actorUserId, ...permissions);
  } else {
    clauses.push("(s.approver_user_id = ? OR s.delegated_to = ?)");
    values.push(actorUserId, actorUserId);
  }
  return many<any>(
    env,
    `SELECT r.id, r.employee_id, e.employee_code, e.full_name AS employee_name,
      e.primary_outlet_id AS outlet_id, o.name AS outlet_name, lt.leave_name AS leave_type_name,
      r.start_date, r.end_date, r.total_days, r.status, COALESCE(r.approval_status, 'pending') AS approval_status,
      r.reason, r.created_by AS requested_by, r.submitted_at, r.created_at,
      s.id AS current_step_id, s.step_order AS current_step_order,
      s.approver_type, s.required_permission_key, s.delegated_to
     FROM leave_requests r
     JOIN leave_approval_steps s ON s.company_id = r.company_id AND s.leave_request_id = r.id
     JOIN employees e ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY r.start_date ASC, r.created_at ASC
     LIMIT ? OFFSET ?`,
    [...values, ...paginate(filters.page, filters.page_size)],
  );
};

export const countApprovalInbox = async (env: Env, companyId: string, filters: LeaveRequestFilters, scope: LeaveOutletScope, actorUserId: string, permissions: string[]) => {
  const rows = await listApprovalInbox(env, companyId, { ...filters, page: 1, page_size: 100 }, scope, actorUserId, permissions);
  return rows.length;
};

export const listApprovalHistory = (env: Env, companyId: string, filters: LeaveRequestFilters, scope: LeaveOutletScope) => {
  const built = requestWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT r.id, r.employee_id, e.employee_code, e.full_name AS employee_name,
      e.primary_outlet_id AS outlet_id, o.name AS outlet_name, lt.leave_name AS leave_type_name,
      r.start_date, r.end_date, r.total_days, r.status, COALESCE(r.approval_status, r.status) AS approval_status,
      r.created_by AS requested_by, r.submitted_at, r.approved_at, r.rejected_at, r.cancelled_at, r.withdrawn_at, r.decision_reason, r.created_at
     FROM leave_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${built.sql}
     ORDER BY r.updated_at DESC
     LIMIT ? OFFSET ?`,
    [...built.values, ...paginate(filters.page, filters.page_size)],
  );
};

export const listLeaveRequestTransactions = (env: Env, companyId: string, requestId: string) =>
  many<LeaveBalanceTransactionRecord>(
    env,
    `SELECT * FROM leave_balance_transactions
     WHERE company_id = ? AND leave_request_id = ?
     ORDER BY created_at ASC, id ASC`,
    [companyId, requestId],
  );

export const findUser = (env: Env, companyId: string, userId: string) =>
  one<{ id: string; company_id: string; status: string; is_active?: number | null; email?: string | null; full_name?: string | null }>(
    env,
    "SELECT id, company_id, status, is_active, email, full_name FROM users WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, userId],
  );

export const calendar = (env: Env, companyId: string, filters: LeaveCalendarFilters, scope: LeaveOutletScope) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.employee_id) { clauses.push("r.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.leave_type_id) { clauses.push("r.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.status) { clauses.push("r.status = ?"); values.push(filters.status); }
  if (filters.date_from) { clauses.push("r.end_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("r.start_date <= ?"); values.push(filters.date_to); }
  return many<any>(
    env,
    `SELECT r.id, r.employee_id, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id,
      lt.leave_name AS leave_type_name, r.start_date, r.end_date, r.status
     FROM leave_requests r
     JOIN employees e ON e.id = r.employee_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY r.start_date ASC`,
    values,
  );
};

export const findPayrollRunForMonth = (env: Env, companyId: string, payrollMonth: string) =>
  one<{ status: string }>(
    env,
    "SELECT status FROM payroll_runs WHERE company_id = ? AND payroll_month = ? LIMIT 1",
    [companyId, payrollMonth],
  );

export const getHolidaySettings = (env: Env, companyId: string) =>
  one<{
    holiday_module_enabled: number;
    public_holidays_enabled: number;
    company_holidays_enabled: number;
    other_holidays_enabled: number;
    optional_holidays_enabled?: number;
    outlet_specific_holidays_enabled: number;
    holiday_leave_rules_enabled: number;
    exclude_holidays_from_leave: number;
    holidays_exclude_from_paid_leave?: number;
    holidays_exclude_from_unpaid_leave?: number;
  }>(
    env,
    `SELECT holiday_module_enabled, public_holidays_enabled, company_holidays_enabled,
      other_holidays_enabled, optional_holidays_enabled, outlet_specific_holidays_enabled,
      holiday_leave_rules_enabled, exclude_holidays_from_leave,
      exclude_holidays_from_paid_leave AS holidays_exclude_from_paid_leave,
      exclude_holidays_from_unpaid_leave AS holidays_exclude_from_unpaid_leave
     FROM holiday_settings WHERE company_id = ? LIMIT 1`,
    [companyId],
  );

export const listHolidayDates = async (
  env: Env,
  companyId: string,
  startDate: string,
  endDate: string,
  options: {
    enabledHolidayTypes?: string[];
    outletSpecificEnabled?: boolean;
    outletId?: string | null;
  } = {},
) => {
  const clauses = [
    "h.company_id = ?",
    "COALESCE(h.is_enabled, 1) = 1",
    "COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'",
    "COALESCE(h.affects_leave_duration, h.affects_leave, 1) = 1",
    "COALESCE(h.date, h.start_date) <= ?",
    "COALESCE(h.end_date, h.start_date) >= ?",
  ];
  const values: unknown[] = [companyId, endDate, startDate];

  if (options.enabledHolidayTypes && options.enabledHolidayTypes.length > 0) {
    const aliases = options.enabledHolidayTypes.flatMap((type) =>
      type === "public" ? ["public", "public_holiday"] : type === "company" ? ["company", "company_holiday"] : [type],
    );
    clauses.push(`h.holiday_type IN (${aliases.map(() => "?").join(", ")})`);
    values.push(...aliases);
  }

  if (options.outletSpecificEnabled === false) {
    clauses.push("NOT EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.holiday_id = h.id)");
  } else if (options.outletId) {
    clauses.push(
      `(
        COALESCE(h.applies_to_all_outlets, 1) = 1
        OR h.outlet_id = ?
        OR NOT EXISTS (SELECT 1 FROM holiday_outlets ho_all WHERE ho_all.holiday_id = h.id)
        OR EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.holiday_id = h.id AND ho.outlet_id = ?)
      )`,
    );
    values.push(options.outletId, options.outletId);
  }

  return many<{ start_date: string; end_date: string | null }>(
    env,
    `SELECT COALESCE(h.date, h.start_date) AS start_date, h.end_date FROM holidays h WHERE ${clauses.join(" AND ")}`,
    values,
  );
};
