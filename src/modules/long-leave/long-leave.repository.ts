import type {
  LongLeaveEmployee,
  LongLeaveFilters,
  LongLeaveImpactRecord,
  LongLeaveOutletScope,
  LongLeavePayrollImpactRecord,
  LongLeaveRecord,
  LongLeaveSettings,
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
      employment_status, deleted_at, date_of_joining, hire_date, joined_at
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
      e.employee_type, e.department_id,
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
    `SELECT l.*, e.employee_code, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id,
      e.employee_type, e.department_id, o.name AS outlet_name
     FROM long_leave_records l
     JOIN employees e ON e.id = l.employee_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
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
      actual_return_date, total_days, status, approval_status, payroll_status,
      salary_treatment, deduction_method, payable_days_policy, reason, notes,
      created_by, submitted_by, submitted_at, salary_impact_confirmed, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      record.approval_status ?? "pending",
      record.payroll_status ?? "not_started",
      record.salary_treatment ?? "unpaid",
      record.deduction_method ?? "calendar_days",
      record.payable_days_policy ?? "monthly_deduction",
      record.reason ?? null,
      record.notes ?? null,
      record.created_by ?? null,
      record.submitted_by ?? null,
      record.submitted_at ?? null,
      record.salary_impact_confirmed,
      record.created_at,
      record.updated_at,
    ],
  );

export const updateLongLeave = (env: Env, companyId: string, id: string, values: Partial<LongLeaveRecord>) => {
  const allowed: Array<keyof LongLeaveRecord> = [
    "actual_return_date",
    "start_date",
    "expected_return_date",
    "total_days",
    "status",
    "approval_status",
    "payroll_status",
    "submitted_by",
    "submitted_at",
    "approved_by",
    "approved_at",
    "rejected_by",
    "rejected_at",
    "cancelled_by",
    "cancelled_at",
    "cancel_reason",
    "returned_by",
    "returned_at",
    "return_notes",
    "reason",
    "notes",
    "salary_treatment",
    "deduction_method",
    "payable_days_policy",
    "expected_return_date_original",
    "extended_from_long_leave_id",
    "salary_impact_confirmed",
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
  return run(env, `UPDATE long_leave_records SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, params);
};

export const findOverlappingLongLeave = (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
) =>
  one<LongLeaveRecord>(
    env,
    `SELECT * FROM long_leave_records
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('draft', 'submitted', 'pending', 'pending_approval', 'approved', 'active', 'extended')
       AND start_date <= ? AND COALESCE(actual_return_date, expected_return_date) >= ?
       ${excludeId ? "AND id <> ?" : ""}
     LIMIT 1`,
    excludeId ? [companyId, employeeId, endDate, startDate, excludeId] : [companyId, employeeId, endDate, startDate],
  );

export const findOverlappingNormalLeave = (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
) =>
  one<{ id: string; status: string }>(
    env,
    `SELECT id, status FROM leave_requests
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('pending', 'submitted', 'pending_approval', 'partially_approved', 'approved', 'direct_approved', 'finalized', 'taken')
       AND start_date <= ? AND end_date >= ?
     LIMIT 1`,
    [companyId, employeeId, endDate, startDate],
  );

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

export const listPayrollImpacts = (env: Env, companyId: string, longLeaveId: string) =>
  many<LongLeavePayrollImpactRecord>(
    env,
    "SELECT * FROM long_leave_payroll_impacts WHERE company_id = ? AND long_leave_id = ? ORDER BY payroll_month ASC",
    [companyId, longLeaveId],
  );

export const findPayrollImpactByMonth = (env: Env, companyId: string, longLeaveId: string, payrollMonth: string) =>
  one<LongLeavePayrollImpactRecord>(
    env,
    "SELECT * FROM long_leave_payroll_impacts WHERE company_id = ? AND long_leave_id = ? AND payroll_month = ? LIMIT 1",
    [companyId, longLeaveId, payrollMonth],
  );

export const upsertPayrollImpact = (env: Env, impact: LongLeavePayrollImpactRecord) =>
  run(
    env,
    `INSERT INTO long_leave_payroll_impacts (
      id, company_id, long_leave_id, employee_id, payroll_month, period_start, period_end,
      base_salary, total_days, long_leave_days, payable_days, unpaid_days, per_day_rate,
      deduction_amount, payable_salary, status, payroll_run_id, payroll_adjustment_id,
      calculated_at, applied_at, applied_by, idempotency_key, notes, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, long_leave_id, payroll_month) DO UPDATE SET
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      base_salary = excluded.base_salary,
      total_days = excluded.total_days,
      long_leave_days = excluded.long_leave_days,
      payable_days = excluded.payable_days,
      unpaid_days = excluded.unpaid_days,
      per_day_rate = excluded.per_day_rate,
      deduction_amount = excluded.deduction_amount,
      payable_salary = excluded.payable_salary,
      status = CASE WHEN long_leave_payroll_impacts.status = 'applied' THEN long_leave_payroll_impacts.status ELSE excluded.status END,
      calculated_at = excluded.calculated_at,
      notes = excluded.notes,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`,
    [
      impact.id,
      impact.company_id,
      impact.long_leave_id,
      impact.employee_id,
      impact.payroll_month,
      impact.period_start,
      impact.period_end,
      impact.base_salary,
      impact.total_days,
      impact.long_leave_days,
      impact.payable_days,
      impact.unpaid_days,
      impact.per_day_rate,
      impact.deduction_amount,
      impact.payable_salary,
      impact.status,
      impact.payroll_run_id,
      impact.payroll_adjustment_id,
      impact.calculated_at,
      impact.applied_at,
      impact.applied_by,
      impact.idempotency_key,
      impact.notes,
      impact.metadata_json,
      impact.created_at,
      impact.updated_at,
    ],
  );

export const markPayrollImpactApplied = (
  env: Env,
  companyId: string,
  longLeaveId: string,
  payrollMonth: string,
  appliedBy: string,
) =>
  run(
    env,
    `UPDATE long_leave_payroll_impacts
     SET status = 'applied', applied_by = ?, applied_at = ?, updated_at = ?
     WHERE company_id = ? AND long_leave_id = ? AND payroll_month = ? AND status <> 'applied'`,
    [appliedBy, new Date().toISOString(), new Date().toISOString(), companyId, longLeaveId, payrollMonth],
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

export const countHolidayDays = async (
  env: Env,
  companyId: string,
  startDate: string,
  endDate: string,
  outletId?: string | null,
) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT d.date_value) AS total
     FROM (
       WITH RECURSIVE dates(date_value) AS (
         SELECT ?
         UNION ALL
         SELECT date(date_value, '+1 day') FROM dates WHERE date_value < ?
       )
       SELECT date_value FROM dates
     ) d
     JOIN holidays h
       ON h.company_id = ?
      AND h.start_date <= d.date_value
      AND COALESCE(h.end_date, h.start_date) >= d.date_value
     WHERE COALESCE(h.is_enabled, 1) = 1
       AND COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND COALESCE(h.affects_long_leave_payroll, h.affects_payroll, 1) = 1
       AND (
       ? IS NULL
       OR COALESCE(h.applies_to_all_outlets, 1) = 1
       OR h.outlet_id = ?
       OR NOT EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id)
       OR EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id AND ho.outlet_id = ?)
     )`,
    [startDate, endDate, companyId, outletId ?? null, outletId ?? null, outletId ?? null],
  );
  return row?.total ?? 0;
};

export const countRosteredDays = async (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT COALESCE(roster_date, shift_date)) AS total
     FROM roster_shifts
     WHERE company_id = ? AND employee_id = ?
       AND COALESCE(roster_date, shift_date) BETWEEN ? AND ?
       AND status IN ('draft', 'published', 'completed')`,
    [companyId, employeeId, startDate, endDate],
  );
  return row?.total ?? 0;
};

export const countAttendanceDuringLongLeave = async (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_events
     WHERE company_id = ? AND employee_id = ?
       AND substr(event_time, 1, 10) BETWEEN ? AND ?`,
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
  one<LongLeaveSettings>(
    env,
    `SELECT is_enabled, applies_to_foreigners, applies_to_locals, trigger_days,
      max_continuous_days, salary_rule, require_salary_impact_preview, pay_only_worked_days,
      deduct_full_salary_if_zero_worked_days, count_holidays_inside_leave,
      pay_holidays_during_long_leave, pay_weekly_off_days_during_long_leave,
      allow_hr_override, default_salary_treatment, default_deduction_method,
      require_payroll_review, require_return_to_work_confirmation, approval_required,
      partial_pay_ratio
     FROM long_leave_settings WHERE company_id = ? LIMIT 1`,
    [companyId],
  );

export const upsertLongLeaveSettings = (
  env: Env,
  companyId: string,
  values: LongLeaveSettings,
) =>
  run(
    env,
    `UPDATE long_leave_settings
     SET is_enabled = ?, applies_to_foreigners = ?, applies_to_locals = ?,
       trigger_days = ?, max_continuous_days = ?, salary_rule = ?,
       pay_only_worked_days = ?, deduct_full_salary_if_zero_worked_days = ?,
       count_holidays_inside_leave = ?, pay_holidays_during_long_leave = ?,
       pay_weekly_off_days_during_long_leave = ?, allow_hr_override = ?,
       require_salary_impact_preview = ?, default_salary_treatment = ?,
       default_deduction_method = ?, require_payroll_review = ?,
       require_return_to_work_confirmation = ?, approval_required = ?,
       partial_pay_ratio = ?, updated_at = ?
     WHERE company_id = ?`,
    [
      values.is_enabled,
      values.applies_to_foreigners,
      values.applies_to_locals,
      values.trigger_days,
      values.max_continuous_days,
      values.salary_rule,
      values.pay_only_worked_days,
      values.deduct_full_salary_if_zero_worked_days,
      values.count_holidays_inside_leave,
      values.pay_holidays_during_long_leave,
      values.pay_weekly_off_days_during_long_leave,
      values.allow_hr_override,
      values.require_salary_impact_preview,
      values.default_salary_treatment ?? "unpaid",
      values.default_deduction_method ?? "calendar_days",
      values.require_payroll_review ?? 1,
      values.require_return_to_work_confirmation ?? 1,
      values.approval_required ?? 1,
      values.partial_pay_ratio ?? 0.5,
      new Date().toISOString(),
      companyId,
    ],
  );

export const insertLongLeaveSettings = (
  env: Env,
  companyId: string,
  values: LongLeaveSettings,
) =>
  run(
    env,
    `INSERT INTO long_leave_settings (
      id, company_id, is_enabled, applies_to_foreigners, applies_to_locals,
      trigger_days, max_continuous_days, salary_rule, pay_only_worked_days,
      deduct_full_salary_if_zero_worked_days, count_holidays_inside_leave,
      pay_holidays_during_long_leave, pay_weekly_off_days_during_long_leave,
      allow_hr_override, require_salary_impact_preview, default_salary_treatment,
      default_deduction_method, require_payroll_review, require_return_to_work_confirmation,
      approval_required, partial_pay_ratio, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      companyId,
      values.is_enabled,
      values.applies_to_foreigners,
      values.applies_to_locals,
      values.trigger_days,
      values.max_continuous_days,
      values.salary_rule,
      values.pay_only_worked_days,
      values.deduct_full_salary_if_zero_worked_days,
      values.count_holidays_inside_leave,
      values.pay_holidays_during_long_leave,
      values.pay_weekly_off_days_during_long_leave,
      values.allow_hr_override,
      values.require_salary_impact_preview,
      values.default_salary_treatment ?? "unpaid",
      values.default_deduction_method ?? "calendar_days",
      values.require_payroll_review ?? 1,
      values.require_return_to_work_confirmation ?? 1,
      values.approval_required ?? 1,
      values.partial_pay_ratio ?? 0.5,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const findApprovalRequestForLongLeave = (env: Env, companyId: string, longLeaveId: string) =>
  one<{ id: string; status: string; current_step: number | null }>(
    env,
    `SELECT id, status, current_step FROM approval_requests
     WHERE company_id = ? AND module = 'long_leave'
       AND entity_type = 'long_leave_record' AND entity_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [companyId, longLeaveId],
  );

export const updateApprovalRequestsForLongLeave = (env: Env, companyId: string, longLeaveId: string, status: string) =>
  run(
    env,
    `UPDATE approval_requests
     SET status = ?, updated_at = ?
     WHERE company_id = ? AND module = 'long_leave'
       AND entity_type = 'long_leave_record' AND entity_id = ?
       AND status IN ('pending', 'in_progress', 'applying', 'returned', 'returned_for_more_info')`,
    [status, new Date().toISOString(), companyId, longLeaveId],
  );

export const findLongLeaveCoverageForDate = (env: Env, companyId: string, employeeId: string, date: string) =>
  one<LongLeaveRecord>(
    env,
    `SELECT * FROM long_leave_records
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('approved', 'active', 'extended', 'returned')
       AND start_date <= ? AND COALESCE(actual_return_date, expected_return_date) >= ?
     ORDER BY start_date DESC LIMIT 1`,
    [companyId, employeeId, date, date],
  );

export const listAuditTimeline = (env: Env, companyId: string, longLeaveId: string) =>
  many<any>(
    env,
    `SELECT action, actor_id, reason, created_at, old_value_json, new_value_json
     FROM audit_logs
     WHERE company_id = ? AND entity_id = ?
     ORDER BY created_at ASC`,
    [companyId, longLeaveId],
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
