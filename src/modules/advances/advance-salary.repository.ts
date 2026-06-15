import type {
  AdvanceSalaryEmployeeRecord,
  AdvanceSalaryFilters,
  AdvanceSalaryRequestRecord,
} from "./advance-salary.types";

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
  one<AdvanceSalaryEmployeeRecord>(
    env,
    `SELECT id, company_id, employee_code, full_name, employment_status, primary_outlet_id,
            department_id, position_id, level, archived_at, deleted_at
       FROM employees
      WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const findEmployeeByUserId = (env: Env, companyId: string, userId: string) =>
  one<AdvanceSalaryEmployeeRecord>(
    env,
    `SELECT e.id, e.company_id, e.employee_code, e.full_name, e.employment_status, e.primary_outlet_id,
            e.department_id, e.position_id, e.level, e.archived_at, e.deleted_at
       FROM users u
       JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.id = ? LIMIT 1`,
    [companyId, userId],
  );

const selectRequest = `
  SELECT asr.*,
         e.full_name AS employee_name,
         e.employee_code,
         o.name AS outlet_name,
         d.name AS department_name,
         p.title AS position_title,
         ars.step_name AS current_step_name
    FROM advance_salary_requests asr
    LEFT JOIN employees e ON e.company_id = asr.company_id AND e.id = asr.employee_id
    LEFT JOIN outlets o ON o.company_id = asr.company_id AND o.id = asr.outlet_id
    LEFT JOIN departments d ON d.company_id = asr.company_id AND d.id = asr.department_id
    LEFT JOIN positions p ON p.company_id = asr.company_id AND p.id = asr.position_id
    LEFT JOIN approval_request_steps ars ON ars.company_id = asr.company_id AND ars.id = asr.approval_current_step
`;

const applyFilters = (clauses: string[], values: unknown[], filters: Partial<AdvanceSalaryFilters>) => {
  if (filters.employee_id) { clauses.push("asr.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.department_id) { clauses.push("asr.department_id = ?"); values.push(filters.department_id); }
  if (filters.outlet_id) { clauses.push("asr.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.request_type) { clauses.push("asr.request_type = ?"); values.push(filters.request_type); }
  if (filters.status) { clauses.push("asr.status = ?"); values.push(filters.status); }
  if (filters.payment_status) { clauses.push("asr.payment_status = ?"); values.push(filters.payment_status); }
  if (filters.deduction_status) { clauses.push("asr.deduction_status = ?"); values.push(filters.deduction_status); }
  if (filters.approval_status) { clauses.push("asr.approval_status = ?"); values.push(filters.approval_status); }
  if (filters.payroll_month) { clauses.push("asr.payroll_month = ?"); values.push(filters.payroll_month); }
};

export const listRequests = async (
  env: Env,
  companyId: string,
  filters: AdvanceSalaryFilters,
  visibilitySql?: string,
  visibilityValues: unknown[] = [],
) => {
  const clauses = ["asr.company_id = ?", "asr.archived_at IS NULL"];
  const values: unknown[] = [companyId];
  applyFilters(clauses, values, filters);
  if (visibilitySql) {
    clauses.push(`(${visibilitySql})`);
    values.push(...visibilityValues);
  }
  const where = clauses.join(" AND ");
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM advance_salary_requests asr WHERE ${where}`, values);
  const rows = await many<AdvanceSalaryRequestRecord>(
    env,
    `${selectRequest}
     WHERE ${where}
     ORDER BY COALESCE(asr.approval_submitted_at, asr.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: total?.total ?? 0 };
};

export const findRequestById = (env: Env, companyId: string, id: string) =>
  one<AdvanceSalaryRequestRecord>(
    env,
    `${selectRequest}
     WHERE asr.company_id = ? AND asr.id = ? AND asr.archived_at IS NULL
     LIMIT 1`,
    [companyId, id],
  );

export const findDuplicatePendingRequest = (env: Env, input: {
  companyId: string;
  employeeId: string;
  requestType: string;
  payrollMonth?: string | null;
  requestedPaymentDate?: string | null;
}) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM advance_salary_requests
      WHERE company_id = ? AND employee_id = ? AND request_type = ?
        AND COALESCE(payroll_month, '') = COALESCE(?, '')
        AND COALESCE(requested_payment_date, '') = COALESCE(?, '')
        AND status IN ('DRAFT','PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_PAYMENT','PENDING_MANUAL_REVIEW','APPROVED')
      LIMIT 1`,
    [input.companyId, input.employeeId, input.requestType, input.payrollMonth ?? null, input.requestedPaymentDate ?? null],
  );

export const createRequest = (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  payload: Record<string, unknown>;
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO advance_salary_requests (
      id, company_id, employee_id, requester_employee_id, requester_user_id,
      department_id, position_id, level, outlet_id, payroll_month, payroll_year,
      request_type, requested_amount, approved_amount, paid_amount, outstanding_amount,
      currency, requested_payment_date, repayment_start_month, repayment_start_year,
      repayment_months, repayment_amount_per_month, repayment_policy_json, reason,
      employee_note, status, payment_status, deduction_status, created_at, updated_at, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'NOT_READY', 'NOT_SCHEDULED', ?, ?, ?, ?)`,
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
      input.payload.payroll_month ?? null,
      input.payload.payroll_year ?? null,
      input.payload.request_type,
      input.payload.requested_amount,
      input.payload.requested_amount,
      input.payload.currency ?? "MVR",
      input.payload.requested_payment_date ?? null,
      input.payload.repayment_start_month ?? null,
      input.payload.repayment_start_year ?? null,
      input.payload.repayment_months ?? null,
      input.payload.repayment_amount_per_month ?? null,
      input.payload.repayment_policy_json ?? null,
      input.payload.reason,
      input.payload.employee_note ?? null,
      now,
      now,
      input.actorUserId,
      input.actorUserId,
    ],
  );
};

export const updateApprovalLink = (env: Env, companyId: string, id: string, input: {
  approvalRequestId: string;
  approvalStatus?: string | null;
  currentStepId?: string | null;
  status: string;
  actorUserId: string;
}) =>
  run(
    env,
    `UPDATE advance_salary_requests
        SET approval_request_id = ?, approval_status = ?, approval_current_step = ?, status = ?,
            payment_status = CASE WHEN ? = 'PENDING_PAYMENT' THEN 'PENDING_PAYMENT' ELSE payment_status END,
            approval_submitted_at = COALESCE(approval_submitted_at, ?), updated_by = ?, updated_at = ?
      WHERE company_id = ? AND id = ? AND approval_request_id IS NULL`,
    [input.approvalRequestId, input.approvalStatus ?? null, input.currentStepId ?? null, input.status, input.status, new Date().toISOString(), input.actorUserId, new Date().toISOString(), companyId, id],
  );

export const updateRequestStatus = (env: Env, companyId: string, id: string, input: Record<string, unknown>) => {
  const allowed = [
    "status",
    "payment_status",
    "deduction_status",
    "approved_amount",
    "paid_amount",
    "outstanding_amount",
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
    "actual_payment_date",
    "payment_executed_at",
    "payment_executed_by",
    "payment_error_code",
    "payment_error_message",
    "payment_note",
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
  return run(env, `UPDATE advance_salary_requests SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const findPaymentLedger = (env: Env, companyId: string, requestId: string) =>
  one<{ id: string }>(
    env,
    "SELECT id FROM advance_salary_payment_ledger WHERE company_id = ? AND advance_salary_request_id = ? LIMIT 1",
    [companyId, requestId],
  );

export const countDeductionSchedule = (env: Env, companyId: string, requestId: string) =>
  one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM advance_salary_deduction_schedule WHERE company_id = ? AND advance_salary_request_id = ?",
    [companyId, requestId],
  );

export const createPaymentLedger = (env: Env, input: {
  id: string;
  companyId: string;
  request: AdvanceSalaryRequestRecord;
  actorUserId: string;
  paymentDate: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  bankName?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO advance_salary_payment_ledger (
      id, company_id, advance_salary_request_id, employee_id, amount, currency, payment_date,
      payment_method, payment_reference, bank_name, paid_by, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.request.id,
      input.request.employee_id,
      input.request.approved_amount ?? input.request.requested_amount,
      input.request.currency,
      input.paymentDate,
      input.paymentMethod ?? null,
      input.paymentReference ?? null,
      input.bankName ?? null,
      input.actorUserId,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now,
    ],
  );
};

export const createDeductionSchedule = (env: Env, input: {
  id: string;
  companyId: string;
  request: AdvanceSalaryRequestRecord;
  payrollMonth: string;
  payrollYear: number | null;
  amount: number;
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO advance_salary_deduction_schedule (
      id, company_id, advance_salary_request_id, employee_id, payroll_month, payroll_year,
      scheduled_amount, deducted_amount, currency, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'SCHEDULED', ?, ?)`,
    [input.id, input.companyId, input.request.id, input.request.employee_id, input.payrollMonth, input.payrollYear, input.amount, input.request.currency, now, now],
  );
};

export interface AdvanceSalaryDeductionScheduleInput {
  id: string;
  payrollMonth: string;
  payrollYear: number | null;
  amount: number;
}

export const createPaymentBundle = (env: Env, input: {
  paymentLedgerId: string;
  legacyAdvanceId: string;
  companyId: string;
  request: AdvanceSalaryRequestRecord;
  actorUserId: string;
  paymentDate: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  bankName?: string | null;
  metadata?: Record<string, unknown>;
  deductions: AdvanceSalaryDeductionScheduleInput[];
  deductionMonth: string;
  reason: string;
}) => {
  const now = new Date().toISOString();
  const paidAmount = input.request.approved_amount ?? input.request.requested_amount;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO advance_salary_payment_ledger (
        id, company_id, advance_salary_request_id, employee_id, amount, currency, payment_date,
        payment_method, payment_reference, bank_name, paid_by, status, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, ?)`,
    ).bind(
      input.paymentLedgerId,
      input.companyId,
      input.request.id,
      input.request.employee_id,
      paidAmount,
      input.request.currency,
      input.paymentDate,
      input.paymentMethod ?? null,
      input.paymentReference ?? null,
      input.bankName ?? null,
      input.actorUserId,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now,
    ),
    ...input.deductions.map((deduction) => env.DB.prepare(
      `INSERT INTO advance_salary_deduction_schedule (
        id, company_id, advance_salary_request_id, employee_id, payroll_month, payroll_year,
        scheduled_amount, deducted_amount, currency, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'SCHEDULED', ?, ?)`,
    ).bind(
      deduction.id,
      input.companyId,
      input.request.id,
      input.request.employee_id,
      deduction.payrollMonth,
      deduction.payrollYear,
      deduction.amount,
      input.request.currency,
      now,
      now,
    )),
    env.DB.prepare(
      `INSERT INTO advance_payments (
        id, company_id, employee_id, amount, paid_date, deduction_month, status,
        approval_request_id, reason, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
    ).bind(
      input.legacyAdvanceId,
      input.companyId,
      input.request.employee_id,
      paidAmount,
      input.paymentDate,
      input.deductionMonth,
      input.request.approval_request_id,
      input.reason,
      input.actorUserId,
      now,
      now,
    ),
    env.DB.prepare(
      `UPDATE advance_salary_requests
          SET status = 'PAID',
              payment_status = 'PAID',
              deduction_status = 'SCHEDULED',
              paid_amount = ?,
              outstanding_amount = ?,
              actual_payment_date = ?,
              payment_executed_at = ?,
              payment_executed_by = ?,
              payment_note = ?,
              updated_by = ?,
              updated_at = ?
        WHERE company_id = ? AND id = ? AND status IN ('APPROVED', 'PENDING_PAYMENT')`,
    ).bind(
      paidAmount,
      paidAmount,
      input.paymentDate,
      now,
      input.actorUserId,
      input.reason,
      input.actorUserId,
      now,
      input.companyId,
      input.request.id,
    ),
  ];
  return env.DB.batch(statements);
};

export const listDeductionSchedule = (env: Env, companyId: string, requestId: string) =>
  many<any>(
    env,
    "SELECT * FROM advance_salary_deduction_schedule WHERE company_id = ? AND advance_salary_request_id = ? ORDER BY payroll_month ASC",
    [companyId, requestId],
  );

export const createLegacyApprovedAdvance = (env: Env, input: {
  id: string;
  companyId: string;
  request: AdvanceSalaryRequestRecord;
  actorUserId: string;
  paidDate: string;
  deductionMonth: string;
  reason: string;
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO advance_payments (
      id, company_id, employee_id, amount, paid_date, deduction_month, status,
      approval_request_id, reason, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.request.employee_id,
      input.request.approved_amount ?? input.request.requested_amount,
      input.paidDate,
      input.deductionMonth,
      input.request.approval_request_id,
      input.reason,
      input.actorUserId,
      now,
      now,
    ],
  );
};
