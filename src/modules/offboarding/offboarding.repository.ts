import { ACTIVE_OFFBOARDING_STATUSES, FINALIZED_PAYROLL_STATUSES } from "./offboarding.constants";
import type {
  FinalSettlementDraftRecord,
  OffboardingCaseRecord,
  OffboardingEmployeeRecord,
  OffboardingListFilters,
  OffboardingTaskRecord,
  OffboardingTaskSeed,
} from "./offboarding.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const activeStatusSql = ACTIVE_OFFBOARDING_STATUSES.map(() => "?").join(", ");
const finalizedStatusSql = FINALIZED_PAYROLL_STATUSES.map(() => "?").join(", ");

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<OffboardingEmployeeRecord>(
    env,
    `SELECT e.id, e.company_id, e.employee_code, e.full_name, e.employee_type,
       e.primary_outlet_id, o.name AS outlet_name, e.department_id,
       e.employment_status, e.joined_at, e.deleted_at
     FROM employees e
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     WHERE e.company_id = ? AND e.id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const findFinalizedPayrollRunByMonth = (env: Env, companyId: string, payrollMonth: string) =>
  one<{ id: string; status: string }>(
    env,
    `SELECT id, status FROM payroll_runs
     WHERE company_id = ? AND payroll_month = ? AND status IN (${finalizedStatusSql})
     LIMIT 1`,
    [companyId, payrollMonth, ...FINALIZED_PAYROLL_STATUSES],
  );

export const findActiveCaseForEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<OffboardingCaseRecord>(
    env,
    `SELECT * FROM employee_offboarding_cases
     WHERE company_id = ? AND employee_id = ? AND status IN (${activeStatusSql})
     ORDER BY created_at DESC LIMIT 1`,
    [companyId, employeeId, ...ACTIVE_OFFBOARDING_STATUSES],
  );

const caseSelect = `
  SELECT c.*,
    e.employee_code,
    e.full_name AS employee_name,
    e.primary_outlet_id AS outlet_id,
    o.name AS outlet_name,
    e.department_id,
    d.name AS department_name,
    u.full_name AS initiated_by_name,
    COUNT(t.id) AS task_total,
    SUM(CASE WHEN t.status IN ('completed', 'waived') THEN 1 ELSE 0 END) AS task_completed,
    SUM(CASE WHEN t.status IN ('pending', 'blocked') THEN 1 ELSE 0 END) AS task_pending
  FROM employee_offboarding_cases c
  JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
  LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
  LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
  LEFT JOIN users u ON u.company_id = c.company_id AND u.id = c.initiated_by
  LEFT JOIN employee_offboarding_tasks t ON t.company_id = c.company_id AND t.offboarding_case_id = c.id
`;

const applyOutletScope = (clauses: string[], values: unknown[], outletIds: string[], isSuperAdmin: boolean) => {
  if (isSuperAdmin) return;
  if (outletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  clauses.push(`e.primary_outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
  values.push(...outletIds);
};

const buildCaseFilters = (
  companyId: string,
  filters: OffboardingListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, outletIds, isSuperAdmin);
  if (filters.status) {
    clauses.push("c.status = ?");
    values.push(filters.status);
  }
  if (filters.offboarding_type) {
    clauses.push("c.offboarding_type = ?");
    values.push(filters.offboarding_type);
  }
  if (filters.outlet_id) {
    clauses.push("e.primary_outlet_id = ?");
    values.push(filters.outlet_id);
  }
  if (filters.department_id) {
    clauses.push("e.department_id = ?");
    values.push(filters.department_id);
  }
  if (filters.employee_id) {
    clauses.push("c.employee_id = ?");
    values.push(filters.employee_id);
  }
  if (filters.date_from) {
    clauses.push("c.effective_exit_date >= ?");
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("c.effective_exit_date <= ?");
    values.push(filters.date_to);
  }
  return { sql: clauses.join(" AND "), values };
};

export const listCases = (
  env: Env,
  companyId: string,
  filters: OffboardingListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  const built = buildCaseFilters(companyId, filters, outletIds, isSuperAdmin);
  return many<OffboardingCaseRecord>(
    env,
    `${caseSelect}
     WHERE ${built.sql}
     GROUP BY c.id
     ORDER BY c.effective_exit_date DESC, c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countCases = async (
  env: Env,
  companyId: string,
  filters: OffboardingListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  const built = buildCaseFilters(companyId, filters, outletIds, isSuperAdmin);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT c.id) AS total
     FROM employee_offboarding_cases c
     JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
     WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findCaseById = (env: Env, companyId: string, employeeId: string, caseId: string) =>
  one<OffboardingCaseRecord>(
    env,
    `${caseSelect}
     WHERE c.company_id = ? AND c.employee_id = ? AND c.id = ?
     GROUP BY c.id
     LIMIT 1`,
    [companyId, employeeId, caseId],
  );

export const listCasesForEmployee = (env: Env, companyId: string, employeeId: string) =>
  many<OffboardingCaseRecord>(
    env,
    `${caseSelect}
     WHERE c.company_id = ? AND c.employee_id = ?
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [companyId, employeeId],
  );

export const createCase = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    offboardingType: string;
    effectiveExitDate: string;
    reason: string;
    notes?: string | null;
    initiatedBy: string;
  },
) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO employee_offboarding_cases (
      id, company_id, employee_id, status, offboarding_type, effective_exit_date,
      reason, notes, initiated_by, initiated_at, final_settlement_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, 'not_prepared', ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.offboardingType,
      input.effectiveExitDate,
      input.reason,
      input.notes ?? null,
      input.initiatedBy,
      now,
      now,
      now,
    ],
  );
};

export const updateCase = (
  env: Env,
  companyId: string,
  caseId: string,
  input: { status?: string; notes?: string | null },
) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.status !== undefined) {
    sets.push("status = ?");
    values.push(input.status);
  }
  if (input.notes !== undefined) {
    sets.push("notes = ?");
    values.push(input.notes);
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, caseId);
  return run(env, `UPDATE employee_offboarding_cases SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const cancelCase = (env: Env, companyId: string, caseId: string, actorUserId: string, reason: string) =>
  run(
    env,
    `UPDATE employee_offboarding_cases
     SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [actorUserId, new Date().toISOString(), reason, new Date().toISOString(), companyId, caseId],
  );

export const markReady = (env: Env, companyId: string, caseId: string) =>
  run(
    env,
    "UPDATE employee_offboarding_cases SET status = 'ready_for_final_settlement', updated_at = ? WHERE company_id = ? AND id = ?",
    [new Date().toISOString(), companyId, caseId],
  );

export const completeCase = (env: Env, companyId: string, caseId: string, actorUserId: string) =>
  run(
    env,
    `UPDATE employee_offboarding_cases
     SET status = 'completed', completed_by = ?, completed_at = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [actorUserId, new Date().toISOString(), new Date().toISOString(), companyId, caseId],
  );

export const listTasks = (env: Env, companyId: string, caseId: string) =>
  many<OffboardingTaskRecord>(
    env,
    `SELECT t.*, u.full_name AS completed_by_name
     FROM employee_offboarding_tasks t
     LEFT JOIN users u ON u.company_id = t.company_id AND u.id = t.completed_by
     WHERE t.company_id = ? AND t.offboarding_case_id = ?
     ORDER BY t.required DESC, t.created_at ASC`,
    [companyId, caseId],
  );

export const findTaskById = (env: Env, companyId: string, caseId: string, taskId: string) =>
  one<OffboardingTaskRecord>(
    env,
    "SELECT * FROM employee_offboarding_tasks WHERE company_id = ? AND offboarding_case_id = ? AND id = ? LIMIT 1",
    [companyId, caseId, taskId],
  );

export const upsertTask = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    caseId: string;
    employeeId: string;
    task: OffboardingTaskSeed;
  },
) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT OR IGNORE INTO employee_offboarding_tasks (
      id, company_id, offboarding_case_id, employee_id, task_type, title,
      description, status, required, due_date, source_type, source_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.caseId,
      input.employeeId,
      input.task.taskType,
      input.task.title,
      input.task.description ?? null,
      input.task.required ? 1 : 0,
      input.task.dueDate ?? null,
      input.task.sourceType ?? "manual",
      input.task.sourceId ?? input.task.taskType,
      now,
      now,
    ],
  );
};

export const completeTask = (env: Env, companyId: string, taskId: string, actorUserId: string, notes?: string | null) =>
  run(
    env,
    `UPDATE employee_offboarding_tasks
     SET status = 'completed', completed_by = ?, completed_at = ?, notes = COALESCE(?, notes), updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [actorUserId, new Date().toISOString(), notes ?? null, new Date().toISOString(), companyId, taskId],
  );

export const waiveTask = (env: Env, companyId: string, taskId: string, actorUserId: string, reason: string) =>
  run(
    env,
    `UPDATE employee_offboarding_tasks
     SET status = 'waived', completed_by = ?, completed_at = ?, notes = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [actorUserId, new Date().toISOString(), reason, new Date().toISOString(), companyId, taskId],
  );

export const listPendingAssetAssignments = (env: Env, companyId: string, employeeId: string) =>
  many<any>(
    env,
    `SELECT aa.id, aa.asset_id, aa.status, a.asset_code, a.asset_name, a.purchase_value_amount
     FROM asset_assignments aa
     JOIN assets a ON a.company_id = aa.company_id AND a.id = aa.asset_id
     WHERE aa.company_id = ? AND aa.employee_id = ?
       AND aa.returned_date IS NULL
       AND aa.status IN ('issued', 'lost', 'damaged')`,
    [companyId, employeeId],
  );

export const sumOpenAssetDeductions = async (env: Env, companyId: string, employeeId: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM asset_deductions
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('pending', 'approved')
       AND payroll_item_id IS NULL`,
    [companyId, employeeId],
  );
  return row?.total ?? 0;
};

export const listPendingUniformIssues = (env: Env, companyId: string, employeeId: string) =>
  many<any>(
    env,
    `SELECT id, uniform_type, quantity, issued_date, status
     FROM uniform_issues
     WHERE company_id = ? AND employee_id = ?
       AND returned_date IS NULL
       AND status IN ('issued', 'lost', 'damaged')`,
    [companyId, employeeId],
  );

export const listLinkedUsers = (env: Env, companyId: string, employeeId: string) =>
  many<{ id: string; company_id: string; employee_id: string | null; status: string; full_name: string | null }>(
    env,
    "SELECT id, company_id, employee_id, status, full_name FROM users WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL",
    [companyId, employeeId],
  );

export const countActiveSuperAdmins = (env: Env, companyId: string) =>
  one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
     JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
     WHERE u.company_id = ? AND u.status = 'active'
       AND u.deleted_at IS NULL AND r.role_key = 'super_admin' AND r.is_active = 1`,
    [companyId],
  ).then((row) => row?.total ?? 0);

export const countActiveSuperAdminsExcludingUser = (env: Env, companyId: string, userId: string) =>
  one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
     JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
     WHERE u.company_id = ? AND u.id <> ? AND u.status = 'active'
       AND u.deleted_at IS NULL AND r.role_key = 'super_admin' AND r.is_active = 1`,
    [companyId, userId],
  ).then((row) => row?.total ?? 0);

export const listActiveSuperAdminIdsForUsers = (env: Env, companyId: string, userIds: string[]) => {
  if (userIds.length === 0) return Promise.resolve([]);
  return many<{ id: string }>(
    env,
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur ON ur.company_id = u.company_id AND ur.user_id = u.id
     JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
     WHERE u.company_id = ? AND u.id IN (${userIds.map(() => "?").join(", ")})
       AND u.status = 'active' AND u.deleted_at IS NULL
       AND r.role_key = 'super_admin' AND r.is_active = 1`,
    [companyId, ...userIds],
  ).then((rows) => rows.map((row) => row.id));
};

export const disableLinkedUser = (env: Env, companyId: string, userId: string) =>
  run(env, "UPDATE users SET status = 'disabled', updated_at = ? WHERE company_id = ? AND id = ?", [new Date().toISOString(), companyId, userId]);

export const revokeUserSessions = (env: Env, companyId: string, userId: string) =>
  run(env, "UPDATE sessions SET revoked_at = ? WHERE company_id = ? AND user_id = ? AND revoked_at IS NULL", [new Date().toISOString(), companyId, userId]);

export const completeRevokeUserAccessTask = (
  env: Env,
  companyId: string,
  taskId: string,
  actorUserId: string,
  userIds: string[],
  notes?: string | null,
) => {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const userId of userIds) {
    statements.push(
      env.DB.prepare("UPDATE users SET status = 'disabled', updated_at = ? WHERE company_id = ? AND id = ? AND status <> 'disabled'")
        .bind(now, companyId, userId),
      env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE company_id = ? AND user_id = ? AND revoked_at IS NULL")
        .bind(now, companyId, userId),
    );
  }
  statements.push(
    env.DB.prepare(
      `UPDATE employee_offboarding_tasks
       SET status = 'completed', completed_by = ?, completed_at = ?, notes = COALESCE(?, notes), updated_at = ?
       WHERE company_id = ? AND id = ?`,
    ).bind(actorUserId, now, notes ?? null, now, companyId, taskId),
  );
  return env.DB.batch(statements);
};

export const listOutstandingAdvances = (env: Env, companyId: string, employeeId: string) =>
  many<any>(
    env,
    `SELECT id, amount, COALESCE(repaid_amount, 0) AS repaid_amount, status, deduction_month
     FROM advance_payments
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('pending', 'approved')
       AND amount > COALESCE(repaid_amount, 0)`,
    [companyId, employeeId],
  );

export const listOutstandingLoans = (env: Env, companyId: string, employeeId: string) =>
  many<any>(
    env,
    `SELECT id, loan_amount, outstanding_amount, status, start_month
     FROM salary_loans
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('approved', 'active', 'paused', 'pending')
       AND outstanding_amount > 0`,
    [companyId, employeeId],
  );

export const listPendingLeaveAfterExit = (env: Env, companyId: string, employeeId: string, exitDate: string) =>
  many<any>(
    env,
    `SELECT id, status, start_date, end_date, total_days
     FROM leave_requests
     WHERE company_id = ? AND employee_id = ?
       AND status IN ('pending', 'approved')
       AND end_date > ?`,
    [companyId, employeeId, exitDate],
  );

export const listLeaveBalances = (env: Env, companyId: string, employeeId: string, year: number) =>
  many<any>(
    env,
    `SELECT b.*, lt.name AS leave_type_name
     FROM leave_balances b
     LEFT JOIN leave_types lt ON lt.company_id = b.company_id AND lt.id = b.leave_type_id
     WHERE b.company_id = ? AND b.employee_id = ? AND b.year = ?`,
    [companyId, employeeId, year],
  );

export const listEmployeeDocuments = (env: Env, companyId: string, employeeId: string) =>
  many<any>(
    env,
    `SELECT id, document_type, expiry_date, status, document_category
     FROM employee_documents
     WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL
       AND status NOT IN ('deleted', 'archived', 'replaced')`,
    [companyId, employeeId],
  );

export const findLatestSalary = (env: Env, companyId: string, employeeId: string, effectiveDate: string) =>
  one<any>(
    env,
    `SELECT id, monthly_salary_amount, currency, effective_from
     FROM employee_salary_history
     WHERE company_id = ? AND employee_id = ? AND effective_from <= ?
     ORDER BY effective_from DESC, created_at DESC LIMIT 1`,
    [companyId, employeeId, effectiveDate],
  );

export const listActiveCompensationComponents = (env: Env, companyId: string, employeeId: string, effectiveDate: string) =>
  many<any>(
    env,
    `SELECT id, component_name, component_type, amount, affects_gross_pay, affects_net_pay
     FROM employee_compensation_components
     WHERE company_id = ? AND employee_id = ? AND status IN ('active', 'scheduled')
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)`,
    [companyId, employeeId, effectiveDate, effectiveDate],
  );

export const sumUnpaidLeaveDays = async (env: Env, companyId: string, employeeId: string, dateFrom: string, dateTo: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COALESCE(SUM(lr.total_days), 0) AS total
     FROM leave_requests lr
     JOIN leave_types lt ON lt.company_id = lr.company_id AND lt.id = lr.leave_type_id
     WHERE lr.company_id = ? AND lr.employee_id = ? AND lr.status = 'approved'
       AND lt.is_paid = 0
       AND lr.start_date <= ? AND lr.end_date >= ?`,
    [companyId, employeeId, dateTo, dateFrom],
  );
  return row?.total ?? 0;
};

export const countAbsentDays = async (env: Env, companyId: string, employeeId: string, dateFrom: string, dateTo: string) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ? AND work_date BETWEEN ? AND ?
       AND status IN ('absent', 'missing_clock_in', 'missing_clock_out', 'conflict')`,
    [companyId, employeeId, dateFrom, dateTo],
  );
  return row?.total ?? 0;
};

export const findLatestFinalizedPayrollMonth = (env: Env, companyId: string, employeeId: string, beforeOrEqualMonth: string) =>
  one<{ payroll_month: string }>(
    env,
    `SELECT r.payroll_month
     FROM payroll_items i
     JOIN payroll_runs r ON r.company_id = i.company_id AND r.id = i.payroll_run_id
     WHERE i.company_id = ? AND i.employee_id = ?
       AND r.payroll_month <= ?
       AND r.status IN (${finalizedStatusSql})
     ORDER BY r.payroll_month DESC LIMIT 1`,
    [companyId, employeeId, beforeOrEqualMonth, ...FINALIZED_PAYROLL_STATUSES],
  );

export const upsertSettlementDraft = (
  env: Env,
  draft: Omit<FinalSettlementDraftRecord, "created_at" | "updated_at"> & { created_by?: string | null },
) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO employee_final_settlement_drafts (
      id, company_id, employee_id, offboarding_case_id, status, period_start, period_end,
      basic_salary_due, allowances_due, unpaid_leave_deductions, attendance_deductions,
      advances_outstanding, loans_outstanding, asset_deductions, uniform_deductions,
      leave_encashment, gratuity_or_service_benefit, other_earnings, other_deductions,
      estimated_net_settlement, currency, calculation_metadata_json, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, offboarding_case_id) DO UPDATE SET
      status = excluded.status,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      basic_salary_due = excluded.basic_salary_due,
      allowances_due = excluded.allowances_due,
      unpaid_leave_deductions = excluded.unpaid_leave_deductions,
      attendance_deductions = excluded.attendance_deductions,
      advances_outstanding = excluded.advances_outstanding,
      loans_outstanding = excluded.loans_outstanding,
      asset_deductions = excluded.asset_deductions,
      uniform_deductions = excluded.uniform_deductions,
      leave_encashment = excluded.leave_encashment,
      gratuity_or_service_benefit = excluded.gratuity_or_service_benefit,
      other_earnings = excluded.other_earnings,
      other_deductions = excluded.other_deductions,
      estimated_net_settlement = excluded.estimated_net_settlement,
      currency = excluded.currency,
      calculation_metadata_json = excluded.calculation_metadata_json,
      updated_at = excluded.updated_at`,
    [
      draft.id,
      draft.company_id,
      draft.employee_id,
      draft.offboarding_case_id,
      draft.status,
      draft.period_start,
      draft.period_end,
      draft.basic_salary_due,
      draft.allowances_due,
      draft.unpaid_leave_deductions,
      draft.attendance_deductions,
      draft.advances_outstanding,
      draft.loans_outstanding,
      draft.asset_deductions,
      draft.uniform_deductions,
      draft.leave_encashment,
      draft.gratuity_or_service_benefit,
      draft.other_earnings,
      draft.other_deductions,
      draft.estimated_net_settlement,
      draft.currency,
      draft.calculation_metadata_json ?? null,
      draft.created_by ?? null,
      now,
      now,
    ],
  );
};

export const getSettlementDraft = (env: Env, companyId: string, caseId: string) =>
  one<FinalSettlementDraftRecord>(
    env,
    "SELECT * FROM employee_final_settlement_drafts WHERE company_id = ? AND offboarding_case_id = ? LIMIT 1",
    [companyId, caseId],
  );

export const updateCaseSettlementStatus = (env: Env, companyId: string, caseId: string, status: string) =>
  run(
    env,
    "UPDATE employee_offboarding_cases SET final_settlement_status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [status, new Date().toISOString(), companyId, caseId],
  );
