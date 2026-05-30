import type {
  LeaveBalanceFilters,
  LeaveBalanceRecord,
  LeaveCalendarFilters,
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
      department_id, position_id, employment_status, deleted_at
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
  values: { is_enabled?: number; default_days?: number | null; requires_attachment?: number; affects_payroll?: number },
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
  return { sql: clauses.join(" AND "), values };
};

export const listBalances = (env: Env, companyId: string, filters: LeaveBalanceFilters, scope: LeaveOutletScope) => {
  const built = balanceWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT b.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id,
      o.name AS outlet_name, lt.leave_name AS leave_type_name
     FROM leave_balances b
     JOIN employees e ON e.id = b.employee_id
     JOIN leave_types lt ON lt.id = b.leave_type_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
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
    `SELECT b.*, lt.leave_name AS leave_type_name
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

export const upsertBalance = (env: Env, balance: LeaveBalanceRecord) =>
  run(
    env,
    `INSERT INTO leave_balances (
      id, company_id, employee_id, leave_type_id, year, opening_balance,
      accrued_days, used_days, remaining_days, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, employee_id, leave_type_id, year)
    DO UPDATE SET opening_balance = excluded.opening_balance,
      accrued_days = excluded.accrued_days, used_days = excluded.used_days,
      remaining_days = excluded.remaining_days, updated_at = excluded.updated_at`,
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
      balance.updated_at,
    ],
  );

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
      r.approval_request_id AS approval_status, r.created_at, 'view,approve,reject,cancel' AS actions_available
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

export const createApprovalRequest = (
  env: Env,
  input: {
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
  },
) =>
  run(
    env,
    `INSERT INTO approval_requests (
      id, company_id, workflow_id, module, entity_type, entity_id,
      employee_id, requested_by, status, current_step, summary, payload_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?)`,
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

export const createRequest = (env: Env, request: LeaveRequestRecord) =>
  run(
    env,
    `INSERT INTO leave_requests (
      id, company_id, employee_id, leave_type_id, start_date, end_date,
      total_days, reason, status, created_by, approval_request_id,
      affects_payroll, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      request.affects_payroll,
      request.created_at,
      request.updated_at,
    ],
  );

export const updateRequest = (env: Env, companyId: string, id: string, values: Partial<LeaveRequestRecord>) => {
  const allowed: Array<keyof LeaveRequestRecord> = ["leave_type_id", "start_date", "end_date", "total_days", "reason", "status", "approval_request_id", "affects_payroll"];
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
  return run(env, `UPDATE leave_requests SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, params);
};

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
    outlet_specific_holidays_enabled: number;
    holiday_leave_rules_enabled: number;
    exclude_holidays_from_leave: number;
  }>(
    env,
    `SELECT holiday_module_enabled, public_holidays_enabled, company_holidays_enabled,
      other_holidays_enabled, outlet_specific_holidays_enabled,
      holiday_leave_rules_enabled, exclude_holidays_from_leave
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
    "h.is_enabled = 1",
    "h.affects_leave = 1",
    "h.start_date <= ?",
    "COALESCE(h.end_date, h.start_date) >= ?",
  ];
  const values: unknown[] = [companyId, endDate, startDate];

  if (options.enabledHolidayTypes && options.enabledHolidayTypes.length > 0) {
    clauses.push(`h.holiday_type IN (${options.enabledHolidayTypes.map(() => "?").join(", ")})`);
    values.push(...options.enabledHolidayTypes);
  }

  if (options.outletSpecificEnabled === false) {
    clauses.push("NOT EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.holiday_id = h.id)");
  } else if (options.outletId) {
    clauses.push(
      `(
        NOT EXISTS (SELECT 1 FROM holiday_outlets ho_all WHERE ho_all.holiday_id = h.id)
        OR EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.holiday_id = h.id AND ho.outlet_id = ?)
      )`,
    );
    values.push(options.outletId);
  }

  return many<{ start_date: string; end_date: string | null }>(
    env,
    `SELECT h.start_date, h.end_date FROM holidays h WHERE ${clauses.join(" AND ")}`,
    values,
  );
};
