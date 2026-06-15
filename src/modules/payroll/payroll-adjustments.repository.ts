import type {
  PayrollAdjustmentEmployeeRecord,
  PayrollAdjustmentFilters,
  PayrollAdjustmentRequestRecord,
} from "./payroll-adjustments.types";

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

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<PayrollAdjustmentEmployeeRecord>(
    env,
    `SELECT id, company_id, employee_code, full_name, employment_status, primary_outlet_id,
            department_id, position_id, level, archived_at, deleted_at
       FROM employees
      WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const findEmployeeByUserId = (env: Env, companyId: string, userId: string) =>
  one<PayrollAdjustmentEmployeeRecord>(
    env,
    `SELECT e.id, e.company_id, e.employee_code, e.full_name, e.employment_status, e.primary_outlet_id,
            e.department_id, e.position_id, e.level, e.archived_at, e.deleted_at
       FROM users u
       JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.id = ? LIMIT 1`,
    [companyId, userId],
  );

export const findPayrollRun = (env: Env, companyId: string, id: string) =>
  one<{ id: string; status: string; payroll_month: string; locked_at: string | null; finalized_at: string | null }>(
    env,
    "SELECT id, status, payroll_month, locked_at, finalized_at FROM payroll_runs WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findPayrollItem = (env: Env, companyId: string, id: string) =>
  one<{ id: string; employee_id: string; payroll_run_id: string; outlet_id: string | null; status: string }>(
    env,
    "SELECT id, employee_id, payroll_run_id, outlet_id, status FROM payroll_items WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findPayslip = (env: Env, companyId: string, id: string) =>
  one<{ id: string; employee_id: string; payroll_run_id: string | null; status: string }>(
    env,
    "SELECT id, employee_id, payroll_run_id, status FROM payslips WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

const selectAdjustment = `
  SELECT par.*,
         e.full_name AS employee_name,
         e.employee_code,
         o.name AS outlet_name,
         d.name AS department_name,
         p.title AS position_title,
         ars.step_name AS current_step_name
    FROM payroll_adjustment_requests par
    LEFT JOIN employees e ON e.company_id = par.company_id AND e.id = par.employee_id
    LEFT JOIN outlets o ON o.company_id = par.company_id AND o.id = par.outlet_id
    LEFT JOIN departments d ON d.company_id = par.company_id AND d.id = par.department_id
    LEFT JOIN positions p ON p.company_id = par.company_id AND p.id = par.position_id
    LEFT JOIN approval_request_steps ars ON ars.company_id = par.company_id AND ars.id = par.approval_current_step
`;

const applyFilters = (clauses: string[], values: unknown[], filters: Partial<PayrollAdjustmentFilters>) => {
  if (filters.employee_id) { clauses.push("par.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.department_id) { clauses.push("par.department_id = ?"); values.push(filters.department_id); }
  if (filters.outlet_id) { clauses.push("par.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.payroll_run_id) { clauses.push("par.payroll_run_id = ?"); values.push(filters.payroll_run_id); }
  if (filters.status) { clauses.push("par.status = ?"); values.push(filters.status); }
  if (filters.approval_status) { clauses.push("par.approval_status = ?"); values.push(filters.approval_status); }
  if (filters.effective_payroll_month) { clauses.push("par.effective_payroll_month = ?"); values.push(filters.effective_payroll_month); }
};

export const listAdjustments = async (
  env: Env,
  companyId: string,
  filters: PayrollAdjustmentFilters,
  visibilitySql?: string,
  visibilityValues: unknown[] = [],
) => {
  const clauses = ["par.company_id = ?", "par.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  applyFilters(clauses, values, filters);
  if (visibilitySql) {
    clauses.push(`(${visibilitySql})`);
    values.push(...visibilityValues);
  }
  const where = clauses.join(" AND ");
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM payroll_adjustment_requests par WHERE ${where}`, values);
  const rows = await many<PayrollAdjustmentRequestRecord>(
    env,
    `${selectAdjustment}
     WHERE ${where}
     ORDER BY COALESCE(par.approval_submitted_at, par.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: total?.total ?? 0 };
};

export const findAdjustmentById = (env: Env, companyId: string, id: string) =>
  one<PayrollAdjustmentRequestRecord>(
    env,
    `${selectAdjustment}
     WHERE par.company_id = ? AND par.id = ? AND par.archived_at IS NULL
     LIMIT 1`,
    [companyId, id],
  );

export const findDuplicatePendingAdjustment = (env: Env, input: {
  companyId: string;
  employeeId: string;
  adjustmentType: string;
  effectivePayrollMonth?: string | null;
  payrollRunId?: string | null;
  payrollItemId?: string | null;
}) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM payroll_adjustment_requests
      WHERE company_id = ? AND employee_id = ? AND adjustment_type = ?
        AND COALESCE(effective_payroll_month, '') = COALESCE(?, '')
        AND COALESCE(payroll_run_id, '') = COALESCE(?, '')
        AND COALESCE(payroll_item_id, '') = COALESCE(?, '')
        AND status IN ('DRAFT', 'PENDING', 'PENDING_OWNER_REVIEW', 'PENDING_FINAL_APPROVAL', 'PENDING_EXECUTION', 'PENDING_MANUAL_REVIEW')
      LIMIT 1`,
    [input.companyId, input.employeeId, input.adjustmentType, input.effectivePayrollMonth ?? null, input.payrollRunId ?? null, input.payrollItemId ?? null],
  );

export const createAdjustment = (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  payload: Record<string, unknown>;
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO payroll_adjustment_requests (
      id, company_id, employee_id, requester_employee_id, requester_user_id,
      department_id, position_id, level, outlet_id, payroll_run_id, payroll_item_id, payslip_id,
      adjustment_type, adjustment_direction, amount, currency, effective_payroll_month, reason,
      current_value_json, requested_value_json, status, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.payload.employee_id,
      input.payload.requester_employee_id ?? null,
      input.payload.requester_user_id ?? null,
      input.payload.department_id ?? null,
      input.payload.position_id ?? null,
      input.payload.level ?? null,
      input.payload.outlet_id ?? null,
      input.payload.payroll_run_id ?? null,
      input.payload.payroll_item_id ?? null,
      input.payload.payslip_id ?? null,
      input.payload.adjustment_type,
      input.payload.adjustment_direction,
      input.payload.amount ?? null,
      input.payload.currency ?? "MVR",
      input.payload.effective_payroll_month ?? null,
      input.payload.reason,
      input.payload.current_value_json ?? null,
      input.payload.requested_value_json ?? null,
      now,
      now,
      input.actorUserId,
      input.actorUserId,
    ],
  );
};

export const updateAdjustmentApprovalLink = (env: Env, companyId: string, id: string, input: {
  approvalRequestId: string;
  approvalStatus?: string | null;
  currentStepId?: string | null;
  status: string;
  actorUserId: string;
}) =>
  run(
    env,
    `UPDATE payroll_adjustment_requests
        SET approval_request_id = ?, approval_status = ?, approval_current_step = ?, status = ?,
            approval_submitted_at = COALESCE(approval_submitted_at, ?), updated_by = ?, updated_at = ?
      WHERE company_id = ? AND id = ? AND approval_request_id IS NULL`,
    [input.approvalRequestId, input.approvalStatus ?? null, input.currentStepId ?? null, input.status, new Date().toISOString(), input.actorUserId, new Date().toISOString(), companyId, id],
  );

export const updateAdjustmentStatus = (env: Env, companyId: string, id: string, input: Record<string, unknown>) => {
  const allowed = [
    "status",
    "approval_status",
    "approval_current_step",
    "owner_reviewed_at",
    "owner_reviewed_by",
    "final_approved_at",
    "final_approved_by",
    "rejected_at",
    "rejected_by",
    "rejection_reason",
    "cancelled_at",
    "cancelled_by",
    "cancellation_reason",
    "approval_completed_at",
    "applied_at",
    "applied_by",
    "apply_error_code",
    "apply_error_message",
    "updated_by",
  ] as const;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(input[key] ?? null);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE payroll_adjustment_requests SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const createAppliedLedger = (env: Env, input: {
  id: string;
  companyId: string;
  adjustment: PayrollAdjustmentRequestRecord;
  actorUserId: string;
  metadata?: Record<string, unknown>;
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO payroll_adjustment_applied_ledger (
      id, company_id, payroll_adjustment_request_id, employee_id, payroll_run_id, payroll_item_id, payslip_id,
      adjustment_type, adjustment_direction, amount, currency, effective_payroll_month, ledger_status,
      metadata_json, applied_at, applied_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.adjustment.id,
      input.adjustment.employee_id,
      input.adjustment.payroll_run_id,
      input.adjustment.payroll_item_id,
      input.adjustment.payslip_id,
      input.adjustment.adjustment_type,
      input.adjustment.adjustment_direction,
      input.adjustment.amount,
      input.adjustment.currency,
      input.adjustment.effective_payroll_month,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      input.actorUserId,
      now,
    ],
  );
};

export const findAppliedLedger = (env: Env, companyId: string, adjustmentId: string) =>
  one<{ id: string }>(
    env,
    "SELECT id FROM payroll_adjustment_applied_ledger WHERE company_id = ? AND payroll_adjustment_request_id = ? LIMIT 1",
    [companyId, adjustmentId],
  );
