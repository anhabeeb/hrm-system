import type {
  LongLeaveEmployee,
  LongLeaveFilters,
  LongLeaveImpactRecord,
  LongLeaveOutletScope,
  LongLeaveRecord,
} from "./long-leave.types";

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
  scope: LongLeaveOutletScope,
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

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<LongLeaveEmployee>(
    env,
    `SELECT id, employee_code, full_name, employee_type, primary_outlet_id,
      employment_status, deleted_at
     FROM employees WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, employeeId],
  );

const listWhere = (companyId: string, filters: LongLeaveFilters, scope: LongLeaveOutletScope) => {
  const clauses = ["l.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.status) { clauses.push("l.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("l.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("l.expected_return_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("l.start_date <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const listLongLeave = (env: Env, companyId: string, filters: LongLeaveFilters, scope: LongLeaveOutletScope) => {
  const built = listWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT l.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id,
      o.name AS outlet_name
     FROM long_leave_records l
     JOIN employees e ON e.id = l.employee_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${built.sql}
     ORDER BY l.start_date DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countLongLeave = async (env: Env, companyId: string, filters: LongLeaveFilters, scope: LongLeaveOutletScope) => {
  const built = listWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM long_leave_records l JOIN employees e ON e.id = l.employee_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findLongLeave = (env: Env, companyId: string, id: string) =>
  one<LongLeaveRecord & { employee_code: string; employee_name: string; outlet_id: string | null }>(
    env,
    `SELECT l.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id
     FROM long_leave_records l
     JOIN employees e ON e.id = l.employee_id
     WHERE l.company_id = ? AND l.id = ? LIMIT 1`,
    [companyId, id],
  );

export const findLongLeaveByLeaveRequestId = (
  env: Env,
  companyId: string,
  leaveRequestId: string,
) =>
  one<LongLeaveRecord>(
    env,
    "SELECT * FROM long_leave_records WHERE company_id = ? AND leave_request_id = ? LIMIT 1",
    [companyId, leaveRequestId],
  );

export const createLongLeave = (env: Env, record: LongLeaveRecord) =>
  run(
    env,
    `INSERT INTO long_leave_records (
      id, company_id, employee_id, leave_request_id, start_date, expected_return_date,
      actual_return_date, total_days, status, salary_impact_confirmed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.company_id,
      record.employee_id,
      record.leave_request_id,
      record.start_date,
      record.expected_return_date,
      record.actual_return_date,
      record.total_days,
      record.status,
      record.salary_impact_confirmed,
      record.created_at,
      record.updated_at,
    ],
  );

export const updateLongLeave = (env: Env, companyId: string, id: string, values: Partial<LongLeaveRecord>) => {
  const allowed: Array<keyof LongLeaveRecord> = ["actual_return_date", "status", "salary_impact_confirmed"];
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
  return run(env, `UPDATE long_leave_records SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, params);
};

export const listImpacts = (env: Env, companyId: string, longLeaveId: string) =>
  many<LongLeaveImpactRecord>(
    env,
    "SELECT * FROM long_leave_salary_impacts WHERE company_id = ? AND long_leave_record_id = ? ORDER BY payroll_month ASC",
    [companyId, longLeaveId],
  );

export const upsertImpact = (env: Env, impact: LongLeaveImpactRecord) =>
  run(
    env,
    `INSERT INTO long_leave_salary_impacts (
      id, company_id, employee_id, long_leave_record_id, payroll_month,
      monthly_salary_amount, salary_calculation_days, worked_days, long_leave_days,
      daily_salary_amount, estimated_payable_amount, final_payable_amount,
      override_amount, override_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET monthly_salary_amount = excluded.monthly_salary_amount,
      salary_calculation_days = excluded.salary_calculation_days,
      worked_days = excluded.worked_days,
      long_leave_days = excluded.long_leave_days,
      daily_salary_amount = excluded.daily_salary_amount,
      estimated_payable_amount = excluded.estimated_payable_amount,
      final_payable_amount = excluded.final_payable_amount,
      override_amount = excluded.override_amount,
      override_reason = excluded.override_reason,
      updated_at = excluded.updated_at`,
    [
      impact.id,
      impact.company_id,
      impact.employee_id,
      impact.long_leave_record_id,
      impact.payroll_month,
      impact.monthly_salary_amount,
      impact.salary_calculation_days,
      impact.worked_days,
      impact.long_leave_days,
      impact.daily_salary_amount,
      impact.estimated_payable_amount,
      impact.final_payable_amount,
      impact.override_amount,
      impact.override_reason,
      impact.created_at,
      impact.updated_at,
    ],
  );

export const findImpactByMonth = (env: Env, companyId: string, longLeaveId: string, payrollMonth: string) =>
  one<LongLeaveImpactRecord>(
    env,
    "SELECT * FROM long_leave_salary_impacts WHERE company_id = ? AND long_leave_record_id = ? AND payroll_month = ? LIMIT 1",
    [companyId, longLeaveId, payrollMonth],
  );

export const updateImpactOverride = (
  env: Env,
  companyId: string,
  longLeaveId: string,
  payrollMonth: string,
  overrideAmount: number,
  reason: string,
) =>
  run(
    env,
    `UPDATE long_leave_salary_impacts
     SET override_amount = ?, override_reason = ?, updated_at = ?
     WHERE company_id = ? AND long_leave_record_id = ? AND payroll_month = ?`,
    [overrideAmount, reason, new Date().toISOString(), companyId, longLeaveId, payrollMonth],
  );

export const findSalaryForMonth = (env: Env, companyId: string, employeeId: string, monthEndDate: string) =>
  one<{ monthly_salary_amount: number }>(
    env,
    `SELECT monthly_salary_amount FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC LIMIT 1`,
    [companyId, employeeId, monthEndDate, monthEndDate.slice(0, 8) + "01"],
  );

export const countWorkedDays = async (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ?
       AND attendance_date BETWEEN ? AND ?
       AND status IN ('present', 'checked_in')`,
    [companyId, employeeId, startDate, endDate],
  );
  return row?.total ?? 0;
};

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

export const findPayrollRunForMonth = (env: Env, companyId: string, payrollMonth: string) =>
  one<{ status: string }>(
    env,
    "SELECT status FROM payroll_runs WHERE company_id = ? AND payroll_month = ? LIMIT 1",
    [companyId, payrollMonth],
  );

export const getLongLeaveSettings = (env: Env, companyId: string) =>
  one<{
    trigger_days: number;
    require_salary_impact_preview: number;
    pay_only_worked_days: number;
    deduct_full_salary_if_zero_worked_days: number;
    pay_holidays_during_long_leave: number;
    pay_weekly_off_days_during_long_leave: number;
  }>(
    env,
    `SELECT trigger_days, require_salary_impact_preview, pay_only_worked_days,
      deduct_full_salary_if_zero_worked_days, pay_holidays_during_long_leave,
      pay_weekly_off_days_during_long_leave
     FROM long_leave_settings WHERE company_id = ? LIMIT 1`,
    [companyId],
  );

export const updateEmployeeStatus = (env: Env, companyId: string, employeeId: string, status: string, userId: string) =>
  run(
    env,
    "UPDATE employees SET employment_status = ?, updated_by = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [status, userId, new Date().toISOString(), companyId, employeeId],
  );

export const createEmployeeStatusHistory = (
  env: Env,
  companyId: string,
  employeeId: string,
  oldStatus: string | null,
  newStatus: string,
  reason: string,
  userId: string,
) =>
  run(
    env,
    `INSERT INTO employee_status_history (
      id, company_id, employee_id, old_status, new_status, reason,
      changed_by, changed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      companyId,
      employeeId,
      oldStatus,
      newStatus,
      reason,
      userId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
