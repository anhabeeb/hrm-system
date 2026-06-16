const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

export const findSelfProfile = (env: Env, companyId: string, userId: string) =>
  one<any>(
    env,
    `SELECT
      u.id AS user_id,
      u.username,
      u.email AS user_email,
      u.full_name AS user_full_name,
      u.status AS user_status,
      u.last_login_at,
      e.id AS employee_id,
      e.employee_code,
      e.full_name AS employee_name,
      e.profile_photo_key,
      e.profile_photo_updated_at,
      e.department_id,
      d.name AS department_name,
      e.position_id,
      p.title AS position_title,
      e.level,
      e.primary_outlet_id AS outlet_id,
      o.name AS outlet_name,
      e.employment_status,
      COALESCE(e.employment_type, e.employee_type) AS employment_type,
      e.employee_type,
      e.nationality,
      e.email AS employee_email,
      e.phone AS employee_phone,
      e.archived_at,
      e.deleted_at
     FROM users u
     LEFT JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     WHERE u.company_id = ? AND u.id = ? AND u.deleted_at IS NULL
     LIMIT 1`,
    [companyId, userId],
  );

export const listSelfRoleNames = (env: Env, companyId: string, userId: string) =>
  many<{ role_name: string }>(
    env,
    `SELECT r.role_name
       FROM user_roles ur
       JOIN roles r ON r.company_id = ur.company_id AND r.id = ur.role_id
      WHERE ur.company_id = ? AND ur.user_id = ? AND r.is_active = 1
      ORDER BY r.role_name`,
    [companyId, userId],
  );

export const listEnabledFeatureKeys = (env: Env, companyId: string) =>
  many<{ feature_key: string }>(
    env,
    `SELECT feature_key
       FROM feature_settings
      WHERE company_id = ? AND is_enabled = 1 AND status IN ('active', 'enabled')`,
    [companyId],
  ).then((rows) => rows.map((row) => row.feature_key));

export const getTodayAttendance = (env: Env, companyId: string, employeeId: string, date: string) =>
  one<any>(
    env,
    `SELECT attendance_date, status, first_clock_in, last_clock_out, late_minutes, worked_minutes
       FROM attendance_daily_summary
      WHERE company_id = ? AND employee_id = ? AND attendance_date = ?
      LIMIT 1`,
    [companyId, employeeId, date],
  );

export const getNextRosterShift = (env: Env, companyId: string, employeeId: string, date: string) =>
  one<any>(
    env,
    `SELECT shift_date, start_time, end_time, status
       FROM roster_shifts
      WHERE company_id = ? AND employee_id = ? AND shift_date >= ? AND status NOT IN ('cancelled', 'archived')
      ORDER BY shift_date ASC, start_time ASC
      LIMIT 1`,
    [companyId, employeeId, date],
  );

export const listUpcomingRosterShifts = (env: Env, companyId: string, employeeId: string, date: string, limit = 7) =>
  many<any>(
    env,
    `SELECT shift_date, start_time, end_time, status
       FROM roster_shifts
      WHERE company_id = ? AND employee_id = ? AND shift_date >= ? AND status NOT IN ('cancelled', 'archived')
      ORDER BY shift_date ASC, start_time ASC
      LIMIT ?`,
    [companyId, employeeId, date, limit],
  );

export const getLeaveBalanceSummary = (env: Env, companyId: string, employeeId: string) =>
  one<{ available_days: number | null; leave_types: number | null }>(
    env,
    `SELECT SUM(COALESCE(available_days, remaining_days, 0)) AS available_days, COUNT(*) AS leave_types
       FROM leave_balances
      WHERE company_id = ? AND employee_id = ?`,
    [companyId, employeeId],
  );

export const listLeaveBalanceRows = (env: Env, companyId: string, employeeId: string) =>
  many<any>(
    env,
    `SELECT lb.leave_type_id, lt.name AS leave_type_name, lt.code AS leave_type_code,
            COALESCE(lb.available_days, lb.remaining_days, 0) AS available_days,
            COALESCE(lb.used_days, 0) AS used_days
       FROM leave_balances lb
       LEFT JOIN leave_types lt ON lt.company_id = lb.company_id AND lt.id = lb.leave_type_id
      WHERE lb.company_id = ? AND lb.employee_id = ?
      ORDER BY COALESCE(lt.display_order, 999), lt.name`,
    [companyId, employeeId],
  );

export const getNextApprovedLeave = (env: Env, companyId: string, employeeId: string, today: string) =>
  one<any>(
    env,
    `SELECT id, leave_type, start_date, end_date, status
       FROM leave_requests
      WHERE company_id = ? AND employee_id = ?
        AND (status IN ('approved', 'APPROVED') OR approval_status = 'APPROVED')
        AND end_date >= ?
      ORDER BY start_date ASC
      LIMIT 1`,
    [companyId, employeeId, today],
  );

export const getLeaveRequestCounts = (env: Env, companyId: string, employeeId: string) =>
  one<{ pending: number; approved: number; rejected: number }>(
    env,
    `SELECT
      SUM(CASE WHEN status IN ('submitted', 'pending', 'pending_approval', 'partially_approved', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL') OR approval_status IN ('IN_REVIEW', 'SUBMITTED') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status IN ('approved', 'APPROVED') OR approval_status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status IN ('rejected', 'cancelled', 'REJECTED', 'CANCELLED') OR approval_status IN ('REJECTED', 'CANCELLED') THEN 1 ELSE 0 END) AS rejected
       FROM leave_requests
      WHERE company_id = ? AND employee_id = ?`,
    [companyId, employeeId],
  );

export const getAttendanceCorrectionCounts = (env: Env, companyId: string, employeeId: string, userId: string) =>
  one<{ pending: number; failed: number }>(
    env,
    `SELECT
      SUM(CASE WHEN status IN ('pending', 'PENDING', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL', 'PENDING_MANUAL_REVIEW') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'FAILED_TO_APPLY' THEN 1 ELSE 0 END) AS failed
       FROM attendance_corrections
      WHERE company_id = ? AND (employee_id = ? OR requested_by = ?)`,
    [companyId, employeeId, userId],
  );

export const listSelfRequests = (env: Env, companyId: string, userId: string, employeeId: string, limit = 25) =>
  many<any>(
    env,
    `SELECT r.id, r.operation_type, r.subject_type, r.subject_id, r.title, r.summary, r.status,
            r.current_step_id, s.step_name AS current_step_name, r.submitted_at, r.updated_at, r.created_at
       FROM approval_requests r
       LEFT JOIN approval_request_steps s ON s.company_id = r.company_id AND s.id = r.current_step_id
      WHERE r.company_id = ?
        AND (r.requester_user_id = ? OR r.requester_employee_id = ? OR r.subject_employee_id = ? OR r.employee_id = ?)
      ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
      LIMIT ?`,
    [companyId, userId, employeeId, employeeId, employeeId, limit],
  );

export const listSelfPendingApprovals = (env: Env, companyId: string, userId: string, employee: { id: string; department_id: string | null; level: number | null } | null, permissions: string[], limit = 25) => {
  const clauses = ["s.assigned_approver_user_id = ?"];
  const values: unknown[] = [companyId, userId];
  if (permissions.some((permission) => ["approvals.hrFinal.approve", "approvals.hrFinal.reject"].includes(permission))) {
    clauses.push("s.approver_resolver_type = 'HR_FINAL_APPROVER'");
  }
  if (permissions.some((permission) => ["approvals.financeFinal.approve", "approvals.financeFinal.reject"].includes(permission))) {
    clauses.push("s.approver_resolver_type = 'FINANCE_FINAL_APPROVER'");
  }
  if (employee?.department_id && permissions.some((permission) => ["approvals.department.approve", "approvals.department.reject"].includes(permission))) {
    clauses.push(`(s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE')
      AND r.department_id = ? AND (s.assigned_approver_user_id IS NULL OR s.assigned_approver_user_id = ?)
      AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
      AND (s.required_max_level IS NULL OR ? <= s.required_max_level))`);
    values.push(employee.department_id, userId, employee.level ?? 0, employee.level ?? 99);
  }

  return many<any>(
    env,
    `SELECT r.id, r.operation_type, r.subject_type, r.subject_id, r.title, r.summary, r.status,
            r.department_id, d.name AS department_name, s.id AS step_id, s.step_name AS current_step_name,
            r.submitted_at, r.updated_at
       FROM approval_requests r
       JOIN approval_request_steps s ON s.company_id = r.company_id AND s.approval_request_id = r.id
       LEFT JOIN departments d ON d.company_id = r.company_id AND d.id = r.department_id
      WHERE r.company_id = ?
        AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
        AND (${clauses.join(" OR ")})
      ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
      LIMIT ?`,
    [...values, limit],
  );
};

export const getDocumentSummary = (env: Env, companyId: string, employeeId: string, today: string) =>
  one<{ uploaded: number; expiring_soon: number; expired: number }>(
    env,
    `SELECT
      COUNT(*) AS uploaded,
      SUM(CASE WHEN expiry_date BETWEEN ? AND date(?, '+30 day') THEN 1 ELSE 0 END) AS expiring_soon,
      SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date < ? THEN 1 ELSE 0 END) AS expired
       FROM employee_documents
      WHERE company_id = ? AND employee_id = ? AND deleted_at IS NULL AND status NOT IN ('deleted', 'archived')`,
    [today, today, today, companyId, employeeId],
  );

export const getKycRequestSummary = (env: Env, companyId: string, employeeId: string) =>
  one<{ pending: number; latest_status: string | null; latest_updated_at: string | null }>(
    env,
    `SELECT
      SUM(CASE WHEN status IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'PENDING_OWNER_REVIEW', 'PENDING_FINAL_APPROVAL', 'APPROVED_PENDING_APPLICATION', 'PENDING_MANUAL_REVIEW') THEN 1 ELSE 0 END) AS pending,
      (SELECT status FROM employee_kyc_update_requests latest
        WHERE latest.company_id = ? AND latest.employee_id = ?
        ORDER BY COALESCE(latest.updated_at, latest.created_at) DESC LIMIT 1) AS latest_status,
      (SELECT COALESCE(updated_at, created_at) FROM employee_kyc_update_requests latest
        WHERE latest.company_id = ? AND latest.employee_id = ?
        ORDER BY COALESCE(latest.updated_at, latest.created_at) DESC LIMIT 1) AS latest_updated_at
       FROM employee_kyc_update_requests
      WHERE company_id = ? AND employee_id = ?`,
    [companyId, employeeId, companyId, employeeId, companyId, employeeId],
  );

export const getUnreadNotificationCount = (env: Env, companyId: string, userId: string) =>
  one<{ unread: number }>(
    env,
    `SELECT COUNT(*) AS unread
       FROM notifications
      WHERE company_id = ? AND COALESCE(recipient_user_id, user_id) = ? AND COALESCE(is_read, 0) = 0 AND status NOT IN ('dismissed', 'archived')`,
    [companyId, userId],
  );

export const getLatestPayslip = (env: Env, companyId: string, employeeId: string) =>
  one<any>(
    env,
    `SELECT p.id, p.status, p.generated_at, p.created_at, r.payroll_month
       FROM payslips p
       LEFT JOIN payroll_runs r ON r.company_id = p.company_id AND r.id = p.payroll_run_id
      WHERE p.company_id = ? AND p.employee_id = ?
      ORDER BY COALESCE(r.payroll_month, p.created_at) DESC
      LIMIT 1`,
    [companyId, employeeId],
  );

export const getPayslipSummary = (env: Env, companyId: string, employeeId: string) =>
  one<{ available_count: number; latest_period: string | null; latest_status: string | null; latest_pay_date: string | null }>(
    env,
    `SELECT
      COUNT(*) AS available_count,
      (SELECT r.payroll_month
         FROM payslips latest
         LEFT JOIN payroll_runs r ON r.company_id = latest.company_id AND r.id = latest.payroll_run_id
        WHERE latest.company_id = ? AND latest.employee_id = ?
        ORDER BY COALESCE(r.payroll_month, latest.created_at) DESC LIMIT 1) AS latest_period,
      (SELECT latest.status
         FROM payslips latest
        WHERE latest.company_id = ? AND latest.employee_id = ?
        ORDER BY latest.created_at DESC LIMIT 1) AS latest_status,
      (SELECT r.pay_date
         FROM payslips latest
         LEFT JOIN payroll_runs r ON r.company_id = latest.company_id AND r.id = latest.payroll_run_id
        WHERE latest.company_id = ? AND latest.employee_id = ?
        ORDER BY COALESCE(r.payroll_month, latest.created_at) DESC LIMIT 1) AS latest_pay_date
       FROM payslips
      WHERE company_id = ? AND employee_id = ?`,
    [companyId, employeeId, companyId, employeeId, companyId, employeeId, companyId, employeeId],
  );

export const getOwnOffboardingStatus = (env: Env, companyId: string, employeeId: string) =>
  one<any>(
    env,
    `SELECT id, request_type, status, requested_last_working_date, approved_last_working_date,
            notice_period_status, updated_at, created_at
       FROM employee_exit_requests
      WHERE company_id = ? AND employee_id = ?
        AND status NOT IN ('CANCELLED', 'REJECTED', 'CLOSED')
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 1`,
    [companyId, employeeId],
  );

export const listOwnOffboardingTasks = (env: Env, companyId: string, employeeId: string, userId: string, limit = 5) =>
  many<any>(
    env,
    `SELECT t.id, t.task_type, t.title, t.status, t.due_date, t.assigned_user_id, t.updated_at
       FROM employee_offboarding_tasks t
       JOIN employee_exit_requests r ON r.company_id = t.company_id AND r.id = t.exit_request_id
      WHERE t.company_id = ? AND r.employee_id = ?
        AND (t.assigned_user_id IS NULL OR t.assigned_user_id = ?)
        AND t.status NOT IN ('COMPLETED', 'WAIVED', 'CANCELLED')
      ORDER BY COALESCE(t.due_date, t.created_at) ASC
      LIMIT ?`,
    [companyId, employeeId, userId, limit],
  );

export const listOwnDisciplinaryAcknowledgements = (env: Env, companyId: string, employeeId: string, limit = 5) =>
  many<any>(
    env,
    `SELECT r.id, r.action_type, r.outcome_type, r.status, r.acknowledgement_required,
            r.acknowledged_at, r.updated_at, rec.id AS record_id
       FROM employee_disciplinary_action_requests r
       LEFT JOIN employee_disciplinary_records rec ON rec.company_id = r.company_id AND rec.request_id = r.id
      WHERE r.company_id = ? AND r.employee_id = ?
        AND r.acknowledgement_required = 1
        AND r.acknowledged_at IS NULL
        AND r.status IN ('PENDING_ACKNOWLEDGEMENT', 'APPLIED', 'PENDING_FOLLOW_UP')
      ORDER BY COALESCE(r.updated_at, r.created_at) DESC
      LIMIT ?`,
    [companyId, employeeId, limit],
  );

export const listSelfRecentActivity = (env: Env, companyId: string, userId: string, employeeId: string, limit = 8) =>
  many<any>(
    env,
    `SELECT id, operation_type, title, summary, status, COALESCE(submitted_at, updated_at, created_at) AS happened_at
       FROM approval_requests
      WHERE company_id = ?
        AND (requester_user_id = ? OR requester_employee_id = ? OR subject_employee_id = ? OR employee_id = ?)
      ORDER BY COALESCE(submitted_at, updated_at, created_at) DESC
      LIMIT ?`,
    [companyId, userId, employeeId, employeeId, employeeId, limit],
  );
