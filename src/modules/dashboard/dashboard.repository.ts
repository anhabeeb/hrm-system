import type { AuthActor } from "../../types/api.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

export const one = <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T | null> => bind(env.DB.prepare(sql), values).first<T>();

export const many = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

export const employeeOutletClause = (
  context: AuthActor,
  employeeAlias = "e",
  requestedOutletId?: string | null,
) => {
  const column = `${employeeAlias}.primary_outlet_id`;

  if (context.isSuperAdmin || context.isAdmin) {
    return requestedOutletId
      ? { sql: ` AND ${column} = ?`, values: [requestedOutletId] }
      : { sql: "", values: [] };
  }

  if (requestedOutletId && !context.outletIds.includes(requestedOutletId)) {
    return { sql: " AND 1 = 0", values: [] };
  }

  const outletIds = requestedOutletId ? [requestedOutletId] : context.outletIds;
  if (outletIds.length === 0) return { sql: " AND 1 = 0", values: [] };

  return {
    sql: ` AND ${column} IN (${outletIds.map(() => "?").join(", ")})`,
    values: outletIds,
  };
};

export const directOutletClause = (
  context: AuthActor,
  column: string,
  requestedOutletId?: string | null,
  includeNull = true,
) => {
  if (context.isSuperAdmin || context.isAdmin) {
    return requestedOutletId
      ? { sql: ` AND ${column} = ?`, values: [requestedOutletId] }
      : { sql: "", values: [] };
  }

  if (requestedOutletId && !context.outletIds.includes(requestedOutletId)) {
    return { sql: " AND 1 = 0", values: [] };
  }

  const outletIds = requestedOutletId ? [requestedOutletId] : context.outletIds;
  if (outletIds.length === 0) return includeNull ? { sql: ` AND ${column} IS NULL`, values: [] } : { sql: " AND 1 = 0", values: [] };

  const placeholders = outletIds.map(() => "?").join(", ");
  return {
    sql: includeNull
      ? ` AND (${column} IN (${placeholders}) OR ${column} IS NULL)`
      : ` AND ${column} IN (${placeholders})`,
    values: outletIds,
  };
};

export const countEmployees = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      COUNT(*) AS total_active,
      SUM(CASE WHEN e.employee_type = 'local' THEN 1 ELSE 0 END) AS local_employees,
      SUM(CASE WHEN e.employee_type = 'foreign' THEN 1 ELSE 0 END) AS foreign_employees,
      SUM(CASE WHEN e.employment_status = 'probation' THEN 1 ELSE 0 END) AS probation,
      SUM(CASE WHEN e.employment_status IN ('on_leave') THEN 1 ELSE 0 END) AS on_leave,
      SUM(CASE WHEN e.employment_status IN ('long_leave', 'on_long_leave') THEN 1 ELSE 0 END) AS on_long_leave
     FROM employees e
     WHERE e.company_id = ? AND e.deleted_at IS NULL AND e.employment_status NOT IN ('terminated', 'resigned', 'archived')${outlet.sql}`,
    [context.companyId, ...outlet.values],
  );
};

export const employeesByOutlet = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  return many<Record<string, string | number | null>>(
    env,
    `SELECT e.primary_outlet_id AS outlet_id, COALESCE(o.name, 'Unassigned') AS outlet_name, COUNT(*) AS total
     FROM employees e
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     WHERE e.company_id = ? AND e.deleted_at IS NULL${outlet.sql}
     GROUP BY e.primary_outlet_id, o.name
     ORDER BY total DESC, outlet_name
     LIMIT 10`,
    [context.companyId, ...outlet.values],
  );
};

export const employeesByDepartment = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  return many<Record<string, string | number | null>>(
    env,
    `SELECT e.department_id, COALESCE(d.name, 'Unassigned') AS department_name, COUNT(*) AS total
     FROM employees e
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     WHERE e.company_id = ? AND e.deleted_at IS NULL${outlet.sql}
     GROUP BY e.department_id, d.name
     ORDER BY total DESC, department_name
     LIMIT 10`,
    [context.companyId, ...outlet.values],
  );
};

export const attendanceToday = async (env: Env, context: AuthActor, today: string) => {
  const outlet = directOutletClause(context, "s.outlet_id", null, false);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN s.status IN ('present', 'checked_in', 'holiday_work') THEN 1 ELSE 0 END) AS present_today,
      SUM(CASE WHEN s.status = 'absent' THEN 1 ELSE 0 END) AS absent_today,
      SUM(CASE WHEN COALESCE(s.late_minutes, 0) > 0 THEN 1 ELSE 0 END) AS late_checkins,
      SUM(CASE WHEN s.status IN ('missing_clock_in', 'missing_check_in') THEN 1 ELSE 0 END) AS missing_checkin,
      SUM(CASE WHEN s.status IN ('missing_clock_out', 'missing_checkout') THEN 1 ELSE 0 END) AS missing_checkout,
      SUM(CASE WHEN COALESCE(s.overtime_minutes, 0) > 0 THEN 1 ELSE 0 END) AS overtime_today,
      SUM(CASE WHEN s.status = 'holiday_work' THEN 1 ELSE 0 END) AS holiday_work_today
     FROM attendance_daily_summary s
     WHERE s.company_id = ? AND s.attendance_date = ?${outlet.sql}`,
    [context.companyId, today, ...outlet.values],
  );
};

export const attendanceExceptionCount = async (env: Env, context: AuthActor) => {
  const outlet = directOutletClause(context, "c.outlet_id");
  return one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM attendance_conflicts c
     WHERE c.company_id = ? AND c.status IN ('pending', 'open', 'needs_review')${outlet.sql}`,
    [context.companyId, ...outlet.values],
  );
};

export const leaveApprovalCounts = async (
  env: Env,
  context: AuthActor,
  today: string,
  weekStart: string,
) => {
  const outlet = employeeOutletClause(context);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN l.status IN ('submitted', 'pending', 'pending_approval', 'partially_approved') OR l.approval_status IN ('pending', 'pending_approval') THEN 1 ELSE 0 END) AS pending_leave_approvals,
      SUM(CASE WHEN date(l.created_at) = ? THEN 1 ELSE 0 END) AS submitted_today,
      SUM(CASE WHEN date(l.created_at) >= ? THEN 1 ELSE 0 END) AS submitted_this_week,
      SUM(CASE WHEN l.status IN ('rejected', 'cancelled', 'withdrawn') THEN 1 ELSE 0 END) AS rejected_cancelled
     FROM leave_requests l
     JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
     WHERE l.company_id = ?${outlet.sql}`,
    [today, weekStart, context.companyId, ...outlet.values],
  );
};

export const findActorLinkedEmployeeId = async (
  env: Env,
  companyId: string,
  userId: string,
) => {
  const row = await one<{ employee_id: string | null }>(
    env,
    `SELECT employee_id
     FROM users
     WHERE company_id = ? AND id = ? AND status = 'active' AND deleted_at IS NULL
     LIMIT 1`,
    [companyId, userId],
  );

  return row?.employee_id ?? null;
};

export const approvalInboxCount = async (env: Env, context: AuthActor) => {
  const rolePlaceholders = context.roleKeys.length
    ? context.roleKeys.map(() => "?").join(", ")
    : "NULL";
  const roleScope =
    context.isSuperAdmin || context.isAdmin
      ? { sql: "", values: [] as string[] }
      : context.outletIds.length > 0
        ? {
            sql: ` AND e.primary_outlet_id IN (${context.outletIds.map(() => "?").join(", ")})`,
            values: context.outletIds,
          }
        : { sql: " AND 1 = 0", values: [] as string[] };

  return one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM leave_approval_steps s
     LEFT JOIN leave_requests l ON l.company_id = s.company_id AND l.id = s.leave_request_id
     LEFT JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
     WHERE s.company_id = ?
       AND s.status = 'pending'
       AND (
        s.approver_user_id = ?
        OR s.delegated_to = ?
        OR (
          s.approver_role_key IS NOT NULL
          AND s.approver_role_key IN (${rolePlaceholders})
          ${roleScope.sql}
        )
       )`,
    [
      context.companyId,
      context.actorUserId,
      context.actorUserId,
      ...context.roleKeys,
      ...roleScope.values,
    ],
  );
};

export const leaveBalanceWarnings = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN COALESCE(lb.available_days, lb.remaining_days, 0) BETWEEN 0 AND 2 THEN 1 ELSE 0 END) AS low_leave_balance_warnings,
      SUM(CASE WHEN COALESCE(lb.available_days, lb.remaining_days, 0) < 0 THEN 1 ELSE 0 END) AS negative_balance_warnings
     FROM leave_balances lb
     JOIN employees e ON e.company_id = lb.company_id AND e.id = lb.employee_id
     WHERE lb.company_id = ?${outlet.sql}`,
    [context.companyId, ...outlet.values],
  );
};

export const longLeaveCounts = async (
  env: Env,
  context: AuthActor,
  today: string,
  weekEnd: string,
  monthEnd: string,
) => {
  const outlet = employeeOutletClause(context);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN ll.status IN ('approved', 'active', 'extended') AND ll.start_date <= ? AND COALESCE(ll.actual_return_date, ll.expected_return_date) >= ? THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN ll.status IN ('submitted', 'pending_approval') OR ll.approval_status IN ('pending', 'pending_approval') THEN 1 ELSE 0 END) AS pending_approval,
      SUM(CASE WHEN COALESCE(ll.actual_return_date, ll.expected_return_date) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS returns_this_week,
      SUM(CASE WHEN COALESCE(ll.actual_return_date, ll.expected_return_date) BETWEEN ? AND ? THEN 1 ELSE 0 END) AS returns_this_month,
      SUM(CASE WHEN ll.actual_return_date IS NULL AND ll.expected_return_date < ? AND ll.status IN ('approved', 'active', 'extended') THEN 1 ELSE 0 END) AS overdue_returns,
      SUM(CASE WHEN ll.payroll_status IN ('pending_review', 'partially_adjusted') THEN 1 ELSE 0 END) AS payroll_review_required
     FROM long_leave_records ll
     JOIN employees e ON e.company_id = ll.company_id AND e.id = ll.employee_id
     WHERE ll.company_id = ?${outlet.sql}`,
    [today, today, today, weekEnd, today, monthEnd, today, context.companyId, ...outlet.values],
  );
};

export const longLeavePayrollImpactsPending = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  return one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM long_leave_payroll_impacts i
     JOIN employees e ON e.company_id = i.company_id AND e.id = i.employee_id
     WHERE i.company_id = ? AND i.status IN ('pending_review', 'blocked')${outlet.sql}`,
    [context.companyId, ...outlet.values],
  );
};

export const expiryCounts = async (
  env: Env,
  context: AuthActor,
  today: string,
  options: { employeeId?: string | null } = {},
) => {
  const scope = options.employeeId
    ? { sql: " AND a.employee_id = ?", values: [options.employeeId] }
    : directOutletClause(context, "a.outlet_id");
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN a.severity IN ('critical', 'urgent') AND a.status IN ('open', 'acknowledged', 'snoozed') THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN a.expiry_date = ? AND a.status IN ('open', 'acknowledged', 'snoozed') THEN 1 ELSE 0 END) AS due_today,
      SUM(CASE WHEN a.expiry_date BETWEEN ? AND date(?, '+7 day') AND a.status IN ('open', 'acknowledged', 'snoozed') THEN 1 ELSE 0 END) AS due_within_7_days,
      SUM(CASE WHEN a.expiry_date BETWEEN ? AND date(?, '+30 day') AND a.status IN ('open', 'acknowledged', 'snoozed') THEN 1 ELSE 0 END) AS due_within_30_days,
      SUM(CASE WHEN a.expiry_date < ? AND a.status IN ('open', 'acknowledged', 'snoozed') THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN a.source_type LIKE '%passport%' THEN 1 ELSE 0 END) AS passport,
      SUM(CASE WHEN a.source_type LIKE '%permit%' THEN 1 ELSE 0 END) AS work_permit,
      SUM(CASE WHEN a.source_type LIKE '%contract%' THEN 1 ELSE 0 END) AS contract,
      SUM(CASE WHEN a.source_type LIKE '%probation%' THEN 1 ELSE 0 END) AS probation,
      SUM(CASE WHEN a.source_type LIKE '%document%' THEN 1 ELSE 0 END) AS document
     FROM expiry_alerts a
     WHERE a.company_id = ?${scope.sql}`,
    [today, today, today, today, today, today, context.companyId, ...scope.values],
  );
};

export const notificationCounts = async (env: Env, context: AuthActor) =>
  one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread,
      SUM(CASE WHEN status = 'unread' AND priority IN ('urgent', 'high') THEN 1 ELSE 0 END) AS urgent
     FROM notifications
     WHERE company_id = ? AND recipient_user_id = ? AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)`,
    [context.companyId, context.actorUserId],
  );

export const emailHealth = async (env: Env, context: AuthActor) =>
  one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN status IN ('pending', 'queued') THEN 1 ELSE 0 END) AS pending_email_jobs,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_email_jobs
     FROM email_notifications
     WHERE company_id = ? AND created_at >= date('now', '-30 day')`,
    [context.companyId],
  );

export const deviceHealth = async (env: Env, context: AuthActor) => {
  const outlet = directOutletClause(context, "d.outlet_id", null, false);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN d.status = 'active' THEN 1 ELSE 0 END) AS active_devices,
      SUM(CASE WHEN d.status = 'offline' OR d.last_seen_at < datetime('now', '-1 day') THEN 1 ELSE 0 END) AS offline_devices,
      SUM(CASE WHEN d.status IN ('suspended', 'revoked', 'disabled') THEN 1 ELSE 0 END) AS suspended_revoked_devices
     FROM biometric_devices d
     WHERE d.company_id = ?${outlet.sql}`,
    [context.companyId, ...outlet.values],
  );
};

export const biometricIssueCounts = async (env: Env, context: AuthActor) => {
  const outlet = directOutletClause(context, "l.outlet_id");
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN l.employee_id IS NULL OR l.sync_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched_punches,
      SUM(CASE WHEN l.sync_status = 'ambiguous' THEN 1 ELSE 0 END) AS ambiguous_punches,
      SUM(CASE WHEN l.sync_status = 'invalid_timestamp' THEN 1 ELSE 0 END) AS invalid_timestamp_punches
     FROM biometric_attendance_logs l
     WHERE l.company_id = ? AND l.created_at >= date('now', '-7 day')${outlet.sql}`,
    [context.companyId, ...outlet.values],
  );
};

export const holidayRosterContext = async (env: Env, context: AuthActor, today: string, weekEnd: string) => {
  const outlet = directOutletClause(context, "h.outlet_id");
  const holidays = await many<Record<string, string | number | null>>(
    env,
    `SELECT h.id, COALESCE(h.name, h.holiday_name) AS name, COALESCE(h.date, h.start_date) AS date, h.holiday_type, h.outlet_id
     FROM holidays h
     WHERE h.company_id = ?
       AND COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND (
        COALESCE(h.date, h.start_date) BETWEEN ? AND ?
        OR (h.is_recurring = 1 AND h.recurrence_month = CAST(strftime('%m', ?) AS INTEGER))
       )${outlet.sql}
     ORDER BY COALESCE(h.date, h.start_date)
     LIMIT 10`,
    [context.companyId, today, weekEnd, today, ...outlet.values],
  );
  const conflictOutlet = directOutletClause(context, "rc.outlet_id");
  const conflicts = await one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN rc.conflict_type IN ('holiday_roster_warning', 'holiday_conflict') AND rc.status IN ('open', 'pending') THEN 1 ELSE 0 END) AS holiday_roster_warnings,
      SUM(CASE WHEN rc.status IN ('open', 'pending') THEN 1 ELSE 0 END) AS open_roster_conflicts
     FROM roster_conflicts rc
     WHERE rc.company_id = ?${conflictOutlet.sql}`,
    [context.companyId, ...conflictOutlet.values],
  );
  return { holidays, conflicts: conflicts ?? {} };
};

export const payrollReadiness = async (env: Env, context: AuthActor) => {
  const employeeOutlet = employeeOutletClause(context);
  const attendance = await one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN s.status IN ('missing_clock_in', 'missing_clock_out', 'missing_check_in', 'missing_checkout', 'conflict') THEN 1 ELSE 0 END) AS missing_punches,
      SUM(CASE WHEN s.status IN ('conflict') OR s.payroll_status IN ('exception', 'pending_review') THEN 1 ELSE 0 END) AS attendance_exceptions
     FROM attendance_daily_summary s
     JOIN employees e ON e.company_id = s.company_id AND e.id = s.employee_id
     WHERE s.company_id = ? AND s.attendance_date >= date('now', '-31 day')${employeeOutlet.sql}`,
    [context.companyId, ...employeeOutlet.values],
  );
  const longLeave = await longLeavePayrollImpactsPending(env, context);
  const leave = await one<Record<string, number | null>>(
    env,
    `SELECT SUM(CASE WHEN l.status = 'approved' AND COALESCE(l.approval_status, 'approved') = 'approved' THEN 1 ELSE 0 END) AS approved_leave_not_finalized
     FROM leave_requests l
     JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
     WHERE l.company_id = ?${employeeOutlet.sql}`,
    [context.companyId, ...employeeOutlet.values],
  );
  const payroll = await one<{ unfinalized: number }>(
    env,
    `SELECT COUNT(*) AS unfinalized
     FROM payroll_runs
     WHERE company_id = ? AND status NOT IN ('finalized', 'locked') AND payroll_month >= strftime('%Y-%m', date('now', '-2 month'))`,
    [context.companyId],
  );
  return {
    attendance_exceptions: attendance?.attendance_exceptions ?? 0,
    missing_punches: attendance?.missing_punches ?? 0,
    long_leave_payroll_review: longLeave?.total ?? 0,
    pending_salary_changes: 0,
    pending_leave_adjustments: 0,
    approved_leave_not_finalized: leave?.approved_leave_not_finalized ?? 0,
    unfinalized_payroll_warning: (payroll?.unfinalized ?? 0) > 0,
  };
};
