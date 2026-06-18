import type { AuthActor } from "../../types/api.types";
import { chunkArray } from "../../utils/d1";

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

export const listEnabledFeatureKeys = (env: Env, companyId: string): Promise<string[]> =>
  many<{ feature_key: string }>(
    env,
    `SELECT feature_key
     FROM feature_settings
     WHERE company_id = ?
       AND is_enabled = 1
       AND status IN ('active', 'enabled')`,
    [companyId],
  ).then((rows) => rows.map((row) => row.feature_key));

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

export const employeeSetupHealth = async (env: Env, context: AuthActor, monthStart: string) => {
  const outlet = employeeOutletClause(context);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN date(e.joined_at) >= ? THEN 1 ELSE 0 END) AS new_hires_this_month,
      SUM(CASE WHEN u.id IS NULL THEN 1 ELSE 0 END) AS employees_without_login,
      SUM(CASE WHEN e.department_id IS NULL OR e.position_id IS NULL THEN 1 ELSE 0 END) AS employees_without_structure,
      SUM(CASE WHEN e.level IS NULL THEN 1 ELSE 0 END) AS employees_missing_level
     FROM employees e
     LEFT JOIN users u ON u.company_id = e.company_id
      AND u.employee_id = e.id
      AND u.deleted_at IS NULL
      AND COALESCE(u.status, 'active') NOT IN ('deleted', 'archived', 'disabled')
     WHERE e.company_id = ?
       AND e.deleted_at IS NULL
       AND e.employment_status NOT IN ('terminated', 'resigned', 'archived')${outlet.sql}`,
    [monthStart, context.companyId, ...outlet.values],
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

export const leaveTodayCounts = async (env: Env, context: AuthActor, today: string) => {
  const outlet = employeeOutletClause(context);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      COUNT(DISTINCT l.employee_id) AS on_leave,
      COUNT(DISTINCT CASE
        WHEN lower(COALESCE(lt.leave_key, lt.leave_name, '')) LIKE '%sick%'
        THEN l.employee_id END) AS sick
     FROM leave_requests l
     LEFT JOIN leave_types lt ON lt.company_id = l.company_id AND lt.id = l.leave_type_id
     JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
     WHERE l.company_id = ?
       AND l.start_date <= ?
       AND l.end_date >= ?
       AND l.status IN ('approved', 'APPLIED', 'APPROVED')${outlet.sql}`,
    [context.companyId, today, today, ...outlet.values],
  );
};

export const pendingAttendanceCorrectionCount = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  return one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM attendance_corrections c
     JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
     WHERE c.company_id = ?
       AND c.status IN ('pending', 'submitted', 'pending_approval', 'PENDING', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL', 'PENDING_MANUAL_REVIEW')${outlet.sql}`,
    [context.companyId, ...outlet.values],
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

export const approvalQueueCounts = async (env: Env, context: AuthActor, operationTypes: string[]) => {
  if (operationTypes.length === 0) return [];
  const permissionSet = new Set(context.permissions);
  const outlet =
    context.isSuperAdmin || context.isAdmin
      ? { sql: "", values: [] as string[] }
      : context.outletIds.length > 0
        ? {
            sql: ` AND (e.primary_outlet_id IN (${context.outletIds.map(() => "?").join(", ")}) OR r.subject_employee_id IS NULL)`,
            values: context.outletIds,
          }
        : { sql: " AND r.subject_employee_id IS NULL", values: [] as string[] };

  const counts = new Map<string, { operation_type: string; total: number; oldest_submitted_at: string | null }>();
  const seenRequestIds = new Set<string>();
  const isPrivilegedActor = context.isSuperAdmin || context.isAdmin;

  for (const operationChunk of chunkArray(operationTypes)) {
    const operationPlaceholders = operationChunk.map(() => "?").join(", ");
    const rows = await many<{
      id: string;
      operation_type: string;
      oldest_submitted_at: string | null;
      assigned_approver_user_id: string | null;
      required_permission: string | null;
    }>(
      env,
      `SELECT
        r.id,
        r.operation_type,
        COALESCE(r.submitted_at, r.created_at) AS oldest_submitted_at,
        s.assigned_approver_user_id,
        s.required_permission
       FROM approval_requests r
       LEFT JOIN approval_request_steps s ON s.company_id = r.company_id
        AND s.approval_request_id = r.id
        AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER', 'pending')
       LEFT JOIN employees e ON e.company_id = r.company_id
        AND e.id = COALESCE(r.subject_employee_id, r.employee_id)
       WHERE r.company_id = ?
         AND r.operation_type IN (${operationPlaceholders})
         AND r.status IN ('PENDING', 'IN_PROGRESS', 'pending', 'in_progress', 'submitted')${outlet.sql}`,
      [context.companyId, ...operationChunk, ...outlet.values],
    );

    for (const row of rows) {
      const canSeeRequest =
        isPrivilegedActor ||
        row.assigned_approver_user_id === context.actorUserId ||
        row.required_permission === null ||
        permissionSet.has(row.required_permission);
      if (!canSeeRequest || seenRequestIds.has(row.id)) continue;

      seenRequestIds.add(row.id);
      const current = counts.get(row.operation_type) ?? {
        operation_type: row.operation_type,
        total: 0,
        oldest_submitted_at: null,
      };
      current.total += 1;
      if (
        row.oldest_submitted_at &&
        (!current.oldest_submitted_at || row.oldest_submitted_at < current.oldest_submitted_at)
      ) {
        current.oldest_submitted_at = row.oldest_submitted_at;
      }
      counts.set(row.operation_type, current);
    }
  }

  return Array.from(counts.values());
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
  options: { employeeId?: string | null; sourceTypes?: string[] } = {},
) => {
  const scope = options.employeeId
    ? { sql: " AND a.employee_id = ?", values: [options.employeeId] }
    : directOutletClause(context, "a.outlet_id");
  const sourceClause = options.sourceTypes
    ? options.sourceTypes.length === 0
      ? " AND 1 = 0"
      : ` AND a.source_type IN (${options.sourceTypes.map(() => "?").join(", ")})`
    : "";
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
     WHERE a.company_id = ?${sourceClause}${scope.sql}`,
    [today, today, today, today, today, today, context.companyId, ...(options.sourceTypes ?? []), ...scope.values],
  );
};

export const expiryCountsWithinDays = async (
  env: Env,
  context: AuthActor,
  today: string,
  days: number,
  options: { includeContracts?: boolean; sourceTypes?: string[] } = {},
) => {
  const scope = directOutletClause(context, "a.outlet_id");
  const contractClause = options.includeContracts === false
    ? " AND a.source_type NOT IN ('contract', 'probation')"
    : "";
  const sourceClause = options.sourceTypes
    ? options.sourceTypes.length === 0
      ? " AND 1 = 0"
      : ` AND a.source_type IN (${options.sourceTypes.map(() => "?").join(", ")})`
    : "";
  return one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM expiry_alerts a
     WHERE a.company_id = ?
       AND a.expiry_date BETWEEN ? AND date(?, ?)
       AND a.status IN ('open', 'acknowledged', 'snoozed')${contractClause}${sourceClause}${scope.sql}`,
    [context.companyId, today, today, `+${days} day`, ...(options.sourceTypes ?? []), ...scope.values],
  );
};

export const documentKycCounts = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN r.status IN ('PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_APPLICATION','PENDING_MANUAL_REVIEW','APPROVED','pending') THEN 1 ELSE 0 END) AS pending_kyc_updates,
      SUM(CASE WHEN r.approval_status IN ('PENDING','pending','IN_PROGRESS','in_progress') OR r.status IN ('PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','pending') THEN 1 ELSE 0 END) AS pending_document_approvals
     FROM employee_kyc_update_requests r
     JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
     WHERE r.company_id = ?${outlet.sql}`,
    [context.companyId, ...outlet.values],
  );
};

export const notificationCounts = async (env: Env, context: AuthActor, categories?: string[]) => {
  const categoryClause = categories
    ? categories.length === 0
      ? " AND 1 = 0"
      : ` AND category IN (${categories.map(() => "?").join(", ")})`
    : "";
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread,
      SUM(CASE WHEN status = 'unread' AND priority IN ('urgent', 'high') THEN 1 ELSE 0 END) AS urgent
     FROM notifications
     WHERE company_id = ? AND recipient_user_id = ? AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)${categoryClause}`,
    [context.companyId, context.actorUserId, ...(categories ?? [])],
  );
};

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

export const rosterCoverage = async (env: Env, context: AuthActor, today: string) => {
  const shiftOutlet = directOutletClause(context, "rs.outlet_id", null, false);
  const employeeOutlet = employeeOutletClause(context);
  const [shifts, conflicts, changes, unassigned, leave] = await Promise.all([
    one<Record<string, number | null>>(
      env,
      `SELECT
        COUNT(*) AS scheduled_today,
        SUM(CASE WHEN rs.employee_id IS NULL OR rs.status IN ('open', 'unassigned') THEN 1 ELSE 0 END) AS open_shifts
       FROM roster_shifts rs
       WHERE rs.company_id = ? AND rs.shift_date = ?${shiftOutlet.sql}`,
      [context.companyId, today, ...shiftOutlet.values],
    ),
    one<{ total: number }>(
      env,
      `SELECT COUNT(*) AS total
       FROM roster_conflicts rc
       WHERE rc.company_id = ? AND rc.status IN ('open', 'pending')${directOutletClause(context, "rc.outlet_id").sql}`,
      [context.companyId, ...directOutletClause(context, "rc.outlet_id").values],
    ),
    one<{ total: number }>(
      env,
      `SELECT COUNT(*) AS total
       FROM roster_change_requests r
       JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
       WHERE r.company_id = ?
         AND r.status IN ('PENDING','PENDING_DEPARTMENT_APPROVAL','PENDING_HR_APPROVAL','PENDING_MANUAL_REVIEW','pending')${employeeOutlet.sql}`,
      [context.companyId, ...employeeOutlet.values],
    ),
    one<{ total: number }>(
      env,
      `SELECT COUNT(*) AS total
       FROM employees e
       LEFT JOIN roster_shifts rs ON rs.company_id = e.company_id AND rs.employee_id = e.id AND rs.shift_date = ?
       WHERE e.company_id = ?
         AND e.deleted_at IS NULL
         AND e.employment_status NOT IN ('terminated', 'resigned', 'archived')
         AND rs.id IS NULL${employeeOutlet.sql}`,
      [today, context.companyId, ...employeeOutlet.values],
    ),
    leaveTodayCounts(env, context, today),
  ]);

  return {
    scheduled_today: shifts?.scheduled_today ?? 0,
    open_shifts: shifts?.open_shifts ?? 0,
    employees_on_leave_today: leave?.on_leave ?? 0,
    roster_conflicts: conflicts?.total ?? 0,
    unassigned_employees: unassigned?.total ?? 0,
    pending_roster_changes: changes?.total ?? 0,
  };
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
  const payroll = await one<{ unfinalized: number; current_payroll_period: string | null; pay_date: string | null; locked_or_finalized: number; latest_status: string | null }>(
    env,
    `SELECT
       COUNT(*) AS unfinalized,
       MAX(payroll_month) AS current_payroll_period,
       NULL AS pay_date,
       SUM(CASE WHEN status IN ('finalized', 'locked') THEN 1 ELSE 0 END) AS locked_or_finalized,
       (SELECT pr2.status FROM payroll_runs pr2 WHERE pr2.company_id = ? ORDER BY pr2.payroll_month DESC LIMIT 1) AS latest_status
     FROM payroll_runs
     WHERE company_id = ? AND status NOT IN ('finalized', 'locked') AND payroll_month >= strftime('%Y-%m', date('now', '-2 month'))`,
    [context.companyId, context.companyId],
  );
  const adjustments = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM payroll_adjustment_requests par
     JOIN employees e ON e.company_id = par.company_id AND e.id = par.employee_id
     WHERE par.company_id = ?
       AND par.status IN ('PENDING','PENDING_OWNER_REVIEW','PENDING_FINAL_APPROVAL','PENDING_EXECUTION','PENDING_MANUAL_REVIEW','APPROVED','pending')${employeeOutlet.sql}`,
    [context.companyId, ...employeeOutlet.values],
  );
  const advances = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM advance_salary_requests asr
     JOIN employees e ON e.company_id = asr.company_id AND e.id = asr.employee_id
     WHERE asr.company_id = ?
       AND asr.status IN ('APPROVED','PENDING_PAYMENT','PAID','PARTIALLY_DEDUCTED')
       AND asr.deduction_status IN ('SCHEDULED','PARTIALLY_DEDUCTED','NOT_SCHEDULED')${employeeOutlet.sql}`,
    [context.companyId, ...employeeOutlet.values],
  );
  const payslips = await one<Record<string, number | null>>(
    env,
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN p.status IN ('generated','published','PUBLISHED') THEN 1 ELSE 0 END) AS generated
     FROM payslips p
     JOIN employees e ON e.company_id = p.company_id AND e.id = p.employee_id
     WHERE p.company_id = ?${employeeOutlet.sql}`,
    [context.companyId, ...employeeOutlet.values],
  );
  return {
    current_payroll_period: payroll?.current_payroll_period ?? null,
    pay_date: payroll?.pay_date ?? null,
    attendance_exceptions: attendance?.attendance_exceptions ?? 0,
    missing_punches: attendance?.missing_punches ?? 0,
    long_leave_payroll_review: longLeave?.total ?? 0,
    pending_salary_changes: adjustments?.total ?? 0,
    pending_leave_adjustments: 0,
    approved_advances_deductions: advances?.total ?? 0,
    approved_leave_not_finalized: leave?.approved_leave_not_finalized ?? 0,
    payslip_generation_status: payslips?.total ? `${payslips.generated ?? 0}/${payslips.total} generated` : null,
    payroll_locked_or_finalized: (payroll?.locked_or_finalized ?? 0) > 0,
    unfinalized_payroll_warning: (payroll?.unfinalized ?? 0) > 0,
  };
};

export const lifecycleCounts = async (env: Env, context: AuthActor, today: string) => {
  const outlet = employeeOutletClause(context);
  const [requests, tasks] = await Promise.all([
    one<Record<string, number | null>>(
      env,
      `SELECT
        SUM(CASE WHEN r.status IN ('NOTICE_PERIOD','APPROVED_PENDING_LAST_WORKING_DATE','OFFBOARDING_IN_PROGRESS','APPROVED') AND COALESCE(r.approved_last_working_date, r.requested_last_working_date) >= ? THEN 1 ELSE 0 END) AS employees_in_notice_period,
        SUM(CASE WHEN r.final_settlement_required = 1 AND COALESCE(r.final_settlement_status, 'PENDING') NOT IN ('COMPLETED','WAIVED','completed','waived') THEN 1 ELSE 0 END) AS final_settlement_review_pending,
        SUM(CASE WHEN r.access_disable_required = 1 AND COALESCE(r.access_disable_status, 'PENDING') NOT IN ('COMPLETED','WAIVED','completed','waived') THEN 1 ELSE 0 END) AS access_disable_review_pending,
        SUM(CASE WHEN r.exit_interview_required = 1 AND r.exit_interview_completed = 0 THEN 1 ELSE 0 END) AS exit_interviews_pending
       FROM employee_exit_requests r
       JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
       WHERE r.company_id = ?
         AND r.status NOT IN ('REJECTED','CANCELLED','WITHDRAWN','COMPLETED')${outlet.sql}`,
      [today, context.companyId, ...outlet.values],
    ),
    one<{ total: number }>(
      env,
      `SELECT COUNT(*) AS total
       FROM employee_offboarding_tasks t
       JOIN employees e ON e.company_id = t.company_id AND e.id = t.employee_id
       WHERE t.company_id = ? AND t.status IN ('pending','PENDING','in_progress','IN_PROGRESS','BLOCKED')${outlet.sql}`,
      [context.companyId, ...outlet.values],
    ),
  ]);

  return {
    employees_in_notice_period: requests?.employees_in_notice_period ?? 0,
    offboarding_tasks_pending: tasks?.total ?? 0,
    final_settlement_review_pending: requests?.final_settlement_review_pending ?? 0,
    access_disable_review_pending: requests?.access_disable_review_pending ?? 0,
    exit_interviews_pending: requests?.exit_interviews_pending ?? 0,
  };
};

export const disciplinaryCounts = async (env: Env, context: AuthActor) => {
  const outlet = employeeOutletClause(context);
  const [requests, tasks] = await Promise.all([
    one<Record<string, number | null>>(
      env,
      `SELECT
        SUM(CASE WHEN r.status IN ('PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW','PENDING_INVESTIGATION','PENDING_FINAL_APPROVAL','PENDING_APPLICATION') THEN 1 ELSE 0 END) AS pending_reviews,
        SUM(CASE WHEN r.status = 'PENDING_ACKNOWLEDGEMENT' OR (r.acknowledgement_required = 1 AND r.acknowledged_at IS NULL AND r.status IN ('APPLIED','PENDING_FOLLOW_UP')) THEN 1 ELSE 0 END) AS pending_acknowledgements,
        SUM(CASE WHEN r.severity IN ('HIGH','CRITICAL','high','critical') AND r.status IN ('PENDING','PENDING_DEPARTMENT_REVIEW','PENDING_OWNER_REVIEW','PENDING_INVESTIGATION','PENDING_FINAL_APPROVAL') THEN 1 ELSE 0 END) AS high_severity_cases_pending
       FROM employee_disciplinary_action_requests r
       JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
       WHERE r.company_id = ?${outlet.sql}`,
      [context.companyId, ...outlet.values],
    ),
    one<{ total: number }>(
      env,
      `SELECT COUNT(*) AS total
       FROM employee_disciplinary_follow_up_tasks t
       JOIN employees e ON e.company_id = t.company_id AND e.id = t.employee_id
       WHERE t.company_id = ? AND t.status IN ('PENDING','IN_PROGRESS','BLOCKED')${outlet.sql}`,
      [context.companyId, ...outlet.values],
    ),
  ]);

  return {
    pending_reviews: requests?.pending_reviews ?? 0,
    pending_acknowledgements: requests?.pending_acknowledgements ?? 0,
    open_follow_up_tasks: tasks?.total ?? 0,
    high_severity_cases_pending: requests?.high_severity_cases_pending ?? 0,
  };
};

export const operationOwnershipHealth = async (env: Env, context: AuthActor) => {
  const companyId = context.companyId;
  return one<Record<string, number | null>>(
    env,
    `SELECT
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM operation_responsibility_matrix orm
        WHERE orm.company_id = ?
          AND orm.operation_code = oc.operation_code
          AND orm.responsibility_type = 'OWNER'
          AND orm.is_active = 1
          AND orm.archived_at IS NULL
      ) THEN 1 ELSE 0 END) AS operations_missing_owner,
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM operation_responsibility_matrix orm
        WHERE orm.company_id = ?
          AND orm.operation_code = oc.operation_code
          AND orm.responsibility_type = 'FINAL_APPROVAL'
          AND orm.is_active = 1
          AND orm.archived_at IS NULL
      ) THEN 1 ELSE 0 END) AS operations_missing_final_approver,
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM operation_responsibility_matrix orm
        WHERE orm.company_id = ?
          AND orm.operation_code = oc.operation_code
          AND orm.responsibility_type = 'EXECUTION'
          AND orm.is_active = 1
          AND orm.archived_at IS NULL
      ) THEN 1 ELSE 0 END) AS operations_missing_executor,
      COALESCE((SELECT COUNT(*) FROM operation_responsibility_matrix orm WHERE orm.company_id = ? AND orm.fallback_behavior IN ('USE_SUPER_ADMIN','FALLBACK_TO_SUPER_ADMIN') AND orm.is_active = 1 AND orm.archived_at IS NULL), 0) AS operations_using_super_admin_fallback,
      COALESCE((SELECT COUNT(*) FROM operation_responsibility_matrix orm WHERE orm.company_id = ? AND orm.fallback_behavior IN ('BLOCK_OPERATION','BLOCKED') AND orm.is_active = 1 AND orm.archived_at IS NULL), 0) AS operations_blocked_by_fallback,
      COALESCE((SELECT COUNT(*) FROM business_functions bf WHERE (bf.company_id IS NULL OR bf.company_id = ?) AND bf.is_active = 1 AND bf.archived_at IS NULL AND NOT EXISTS (
        SELECT 1 FROM business_function_department_assignments a
        WHERE a.company_id = ?
          AND a.business_function_id = bf.id
          AND a.is_active = 1
      )), 0) AS functions_without_assigned_users
     FROM operation_catalog oc
     WHERE (oc.company_id IS NULL OR oc.company_id = ?)
       AND oc.is_active = 1
       AND oc.archived_at IS NULL`,
    [companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId],
  );
};

export const recentAuditActivity = async (env: Env, context: AuthActor) => {
  const outlet = directOutletClause(context, "a.outlet_id");
  return many<Record<string, string | number | null>>(
    env,
    `SELECT a.id, a.module, a.action, a.severity, a.entity_type, a.entity_id, a.created_at
     FROM audit_logs a
     WHERE a.company_id = ?${outlet.sql}
     ORDER BY a.created_at DESC
     LIMIT 8`,
    [context.companyId, ...outlet.values],
  );
};
