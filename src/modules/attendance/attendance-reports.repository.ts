import type { AttendanceOutletScope } from "./attendance.types";
import type { AttendanceReportFilters } from "./attendance-reports.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const applyOutletScope = (
  clauses: string[],
  values: unknown[],
  alias: string,
  filters: { outlet_id?: string },
  scope: AttendanceOutletScope,
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
  clauses.push(`${alias}.outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
  values.push(...scope.outletIds);
};

const scopedSubqueryWhere = (
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
  alias: string,
  dateExpression?: string,
) => {
  const clauses = [`${alias}.company_id = ?`];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, alias, filters, scope);
  if (filters.outlet_id) {
    clauses.push(`${alias}.outlet_id = ?`);
    values.push(filters.outlet_id);
  }
  if (dateExpression && filters.from_date) {
    clauses.push(`${dateExpression} >= ?`);
    values.push(filters.from_date);
  }
  if (dateExpression && filters.to_date) {
    clauses.push(`${dateExpression} <= ?`);
    values.push(filters.to_date);
  }
  return { sql: clauses.join(" AND "), values };
};

const timePartExpression = (expression: string) => `
  CASE
    WHEN ${expression} IS NULL THEN NULL
    WHEN instr(${expression}, 'T') > 0 THEN substr(${expression}, 12, 5)
    WHEN length(${expression}) >= 16 AND substr(${expression}, 5, 1) = '-' THEN substr(${expression}, 12, 5)
    ELSE substr(${expression}, 1, 5)
  END
`;

const timeMinutesExpression = (expression: string) => `
  (CAST(substr(${timePartExpression(expression)}, 1, 2) AS INTEGER) * 60 +
   CAST(substr(${timePartExpression(expression)}, 4, 2) AS INTEGER))
`;

const shiftMinutesExpression = (startExpression: string, endExpression: string) => `
  CASE
    WHEN ${startExpression} IS NULL OR ${endExpression} IS NULL THEN 0
    ELSE (
      ${timeMinutesExpression(endExpression)} -
      ${timeMinutesExpression(startExpression)} +
      CASE WHEN ${timePartExpression(endExpression)} <= ${timePartExpression(startExpression)} THEN 1440 ELSE 0 END
    )
  END
`;

const summaryWhere = (
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const clauses = ["s.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "s", filters, scope);
  if (filters.from_date) { clauses.push("s.attendance_date >= ?"); values.push(filters.from_date); }
  if (filters.to_date) { clauses.push("s.attendance_date <= ?"); values.push(filters.to_date); }
  if (filters.employee_id) { clauses.push("s.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("s.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.department_id) { clauses.push("e.department_id = ?"); values.push(filters.department_id); }
  if (filters.position_id) { clauses.push("e.position_id = ?"); values.push(filters.position_id); }
  if (filters.attendance_status) { clauses.push("(s.status = ? OR s.classification = ?)"); values.push(filters.attendance_status, filters.attendance_status); }
  if (filters.late_only) clauses.push("COALESCE(s.late_minutes, 0) > 0");
  if (filters.early_checkout_only) clauses.push("COALESCE(s.early_out_minutes, 0) > 0");
  if (filters.missing_checkin_only) clauses.push("(s.status = 'missing_clock_in' OR s.classification = 'missing_clock_in' OR COALESCE(s.warnings_json, '') LIKE '%missing_clock_in%')");
  if (filters.missing_checkout_only) clauses.push("(s.status = 'missing_clock_out' OR s.classification = 'missing_clock_out' OR COALESCE(s.warnings_json, '') LIKE '%missing_clock_out%')");
  if (filters.absent_only) clauses.push("(s.status = 'absent' OR s.classification = 'absent')");
  if (filters.overtime_only) clauses.push("COALESCE(s.overtime_minutes, 0) > 0");
  if (filters.leave_related_only) clauses.push("(COALESCE(s.is_paid_leave, 0) = 1 OR COALESCE(s.is_unpaid_leave, 0) = 1)");
  if (filters.holiday_related_only) clauses.push("COALESCE(s.is_holiday, 0) = 1");
  if (filters.source) {
    clauses.push(`EXISTS (
      SELECT 1 FROM attendance_events ev
      WHERE ev.company_id = s.company_id AND ev.employee_id = s.employee_id
        AND substr(ev.event_time, 1, 10) = s.attendance_date
        AND ev.source = ?
    )`);
    values.push(filters.source);
  }
  if (filters.device_id) {
    clauses.push(`EXISTS (
      SELECT 1 FROM attendance_events ev
      WHERE ev.company_id = s.company_id AND ev.employee_id = s.employee_id
        AND substr(ev.event_time, 1, 10) = s.attendance_date
        AND (ev.device_id = ? OR ev.source_device_id = ?)
    )`);
    values.push(filters.device_id, filters.device_id);
  }
  return { sql: clauses.join(" AND "), values };
};

const employeeJoins = `
  JOIN employees e ON e.company_id = s.company_id AND e.id = s.employee_id
  LEFT JOIN outlets o ON o.company_id = s.company_id AND o.id = s.outlet_id
  LEFT JOIN departments dep ON dep.company_id = s.company_id AND dep.id = e.department_id
  LEFT JOIN positions pos ON pos.company_id = s.company_id AND pos.id = e.position_id
`;

const dailySelect = `
  SELECT s.id, s.employee_id, e.employee_code, e.full_name AS employee_name,
    s.outlet_id, o.name AS outlet_name, e.department_id, dep.name AS department_name,
    e.position_id, pos.title AS position_name, s.attendance_date,
    rs.id AS roster_shift_id, st.name AS roster_shift_name, st.code AS roster_shift_code,
    COALESCE(rs.start_time, s.expected_start) AS scheduled_start,
    COALESCE(rs.end_time, s.expected_end) AS scheduled_end,
    CASE WHEN COALESCE(rs.end_time, s.expected_end) <= COALESCE(rs.start_time, s.expected_start) THEN 1 ELSE 0 END AS crosses_midnight,
    s.first_clock_in, s.last_clock_out, s.worked_minutes, s.break_minutes,
    s.late_minutes, s.early_out_minutes, s.overtime_minutes,
    CASE WHEN s.status = 'missing_clock_in' OR s.classification = 'missing_clock_in' OR COALESCE(s.warnings_json, '') LIKE '%missing_clock_in%' THEN 1 ELSE 0 END AS missing_check_in,
    CASE WHEN s.status = 'missing_clock_out' OR s.classification = 'missing_clock_out' OR COALESCE(s.warnings_json, '') LIKE '%missing_clock_out%' THEN 1 ELSE 0 END AS missing_check_out,
    CASE WHEN s.status = 'absent' OR s.classification = 'absent' THEN 1 ELSE 0 END AS absent,
    CASE WHEN COALESCE(s.is_paid_leave, 0) = 1 OR COALESCE(s.is_unpaid_leave, 0) = 1 THEN 1 ELSE 0 END AS leave_flag,
    COALESCE(s.is_holiday, 0) AS holiday_flag,
    COALESCE(s.classification, s.status) AS attendance_status,
    (SELECT COUNT(*) FROM attendance_conflicts ac
      WHERE ac.company_id = s.company_id AND ac.employee_id = s.employee_id
        AND ac.attendance_date = s.attendance_date AND ac.status IN ('pending', 'open')) AS open_exception_count,
    CASE WHEN EXISTS (
      SELECT 1 FROM attendance_corrections cr
      WHERE cr.company_id = s.company_id AND cr.employee_id = s.employee_id
        AND cr.status = 'approved'
        AND (cr.attendance_event_id IN (
          SELECT ev.id FROM attendance_events ev
          WHERE ev.company_id = s.company_id AND ev.employee_id = s.employee_id
            AND substr(ev.event_time, 1, 10) = s.attendance_date
        ) OR COALESCE(cr.new_value_json, '') LIKE '%' || s.attendance_date || '%')
    ) THEN 1 ELSE 0 END AS manual_correction,
    (SELECT CASE WHEN COUNT(DISTINCT ev.source) > 1 THEN 'mixed' ELSE MIN(ev.source) END
      FROM attendance_events ev
      WHERE ev.company_id = s.company_id AND ev.employee_id = s.employee_id
        AND substr(ev.event_time, 1, 10) = s.attendance_date) AS source_summary,
    (SELECT GROUP_CONCAT(DISTINCT bd.device_name)
      FROM attendance_events ev
      LEFT JOIN biometric_devices bd ON bd.company_id = ev.company_id AND bd.id = COALESCE(ev.source_device_id, ev.device_id)
      WHERE ev.company_id = s.company_id AND ev.employee_id = s.employee_id
        AND substr(ev.event_time, 1, 10) = s.attendance_date) AS device_name,
    (SELECT COUNT(ev.metadata_json)
      FROM attendance_events ev
      WHERE ev.company_id = s.company_id AND ev.employee_id = s.employee_id
        AND substr(ev.event_time, 1, 10) = s.attendance_date
        AND ev.metadata_json IS NOT NULL) AS source_metadata_count,
    s.warnings_json, s.source_references_json
`;

export const countDailyReportRows = async (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const built = summaryWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_daily_summary s ${employeeJoins} WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listDailyReportRows = (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const built = summaryWhere(companyId, filters, scope);
  return many<any>(
    env,
    `${dailySelect}
     FROM attendance_daily_summary s
     ${employeeJoins}
     LEFT JOIN roster_shifts rs ON rs.company_id = s.company_id AND rs.employee_id = s.employee_id
       AND COALESCE(rs.roster_date, rs.shift_date) = s.attendance_date
       AND rs.status IN ('published', 'completed')
     LEFT JOIN shift_templates st ON st.company_id = s.company_id AND st.id = rs.shift_template_id
     WHERE ${built.sql}
     ORDER BY s.attendance_date DESC, e.employee_code ASC
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const listEmployeeEvents = (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const clauses = ["ev.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "ev", filters, scope);
  if (filters.employee_id) { clauses.push("ev.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.from_date) { clauses.push("substr(ev.event_time, 1, 10) >= ?"); values.push(filters.from_date); }
  if (filters.to_date) { clauses.push("substr(ev.event_time, 1, 10) <= ?"); values.push(filters.to_date); }
  return many<any>(
    env,
    `SELECT ev.id, ev.employee_id, substr(ev.event_time, 1, 10) AS event_date,
       ev.event_type, ev.event_time, ev.source,
       ev.attendance_method, ev.device_id, ev.source_device_id, ev.source_event_id,
       d.device_name, ev.approval_status, ev.sync_status
     FROM attendance_events ev
     LEFT JOIN biometric_devices d ON d.company_id = ev.company_id AND d.id = COALESCE(ev.source_device_id, ev.device_id)
     WHERE ${clauses.join(" AND ")}
     ORDER BY ev.event_time ASC
     LIMIT 500`,
    values,
  );
};

export const listMonthlyReportRows = (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const built = summaryWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT e.id AS employee_id, e.employee_code, e.full_name AS employee_name,
      e.primary_outlet_id AS outlet_id, o.name AS outlet_name,
      e.department_id, dep.name AS department_name, e.position_id, pos.title AS position_name,
      COUNT(*) AS days_scheduled,
      SUM(CASE WHEN s.status = 'present' OR s.classification = 'present' THEN 1 ELSE 0 END) AS days_present,
      SUM(CASE WHEN s.status = 'absent' OR s.classification = 'absent' THEN 1 ELSE 0 END) AS days_absent,
      SUM(CASE WHEN COALESCE(s.is_paid_leave, 0) = 1 OR COALESCE(s.is_unpaid_leave, 0) = 1 THEN 1 ELSE 0 END) AS leave_days,
      SUM(COALESCE(s.is_holiday, 0)) AS holiday_days,
      SUM(CASE WHEN COALESCE(s.late_minutes, 0) > 0 THEN 1 ELSE 0 END) AS late_days,
      SUM(CASE WHEN COALESCE(s.early_out_minutes, 0) > 0 THEN 1 ELSE 0 END) AS early_checkout_days,
      SUM(CASE WHEN s.status IN ('missing_clock_in', 'missing_clock_out', 'incomplete') OR s.classification IN ('missing_clock_in', 'missing_clock_out', 'incomplete') THEN 1 ELSE 0 END) AS missing_punch_days,
      SUM(CASE WHEN COALESCE(s.overtime_minutes, 0) > 0 THEN 1 ELSE 0 END) AS overtime_days,
      SUM(COALESCE(
        (SELECT SUM(${shiftMinutesExpression("rs.start_time", "rs.end_time")})
         FROM roster_shifts rs
         WHERE rs.company_id = s.company_id AND rs.employee_id = s.employee_id
           AND COALESCE(rs.roster_date, rs.shift_date) = s.attendance_date
           AND rs.status IN ('published', 'completed')),
        ${shiftMinutesExpression("s.expected_start", "s.expected_end")},
        0
      )) AS total_scheduled_minutes,
      SUM(COALESCE(s.worked_minutes, 0)) AS total_worked_minutes,
      SUM(COALESCE(s.late_minutes, 0)) AS total_late_minutes,
      SUM(COALESCE(s.early_out_minutes, 0)) AS total_early_checkout_minutes,
      SUM(COALESCE(s.overtime_minutes, 0)) AS total_overtime_minutes,
      ROUND(100.0 * SUM(CASE WHEN s.status = 'present' OR s.classification = 'present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS attendance_percentage,
      (SELECT COUNT(*) FROM attendance_conflicts ac
        WHERE ac.company_id = e.company_id AND ac.employee_id = e.id
          AND ac.attendance_date BETWEEN ? AND ?
          AND ac.status IN ('pending', 'open')) AS exception_count,
      CASE WHEN SUM(CASE WHEN s.status IN ('absent', 'missing_clock_in', 'missing_clock_out', 'incomplete') OR s.classification IN ('absent', 'missing_clock_in', 'missing_clock_out', 'incomplete') THEN 1 ELSE 0 END) > 0
        THEN 'Attendance exceptions may affect payroll.' ELSE NULL END AS payroll_impact_warning
     FROM attendance_daily_summary s
     ${employeeJoins}
     WHERE ${built.sql}
     GROUP BY e.id
     ORDER BY e.employee_code ASC
     LIMIT ? OFFSET ?`,
    [filters.from_date, filters.to_date, ...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countMonthlyReportRows = async (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const built = summaryWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT e.id) AS total FROM attendance_daily_summary s ${employeeJoins} WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

const conflictWhere = (
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const clauses = ["ac.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "ac", filters, scope);
  if (filters.from_date) { clauses.push("COALESCE(ac.attendance_date, substr(ac.created_at, 1, 10)) >= ?"); values.push(filters.from_date); }
  if (filters.to_date) { clauses.push("COALESCE(ac.attendance_date, substr(ac.created_at, 1, 10)) <= ?"); values.push(filters.to_date); }
  if (filters.employee_id) { clauses.push("ac.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("ac.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.exception_type) { clauses.push("ac.conflict_type = ?"); values.push(filters.exception_type); }
  if (filters.status) { clauses.push("ac.status = ?"); values.push(filters.status); }
  return { sql: clauses.join(" AND "), values };
};

export const countExceptionRows = async (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const conflicts = conflictWhere(companyId, filters, scope);
  const biometric = biometricWhere(companyId, filters, scope, true);
  const row = await one<{ total: number }>(
    env,
    `SELECT (
      (SELECT COUNT(*) FROM attendance_conflicts ac WHERE ${conflicts.sql}) +
      (SELECT COUNT(*) FROM biometric_attendance_logs bl WHERE ${biometric.sql})
    ) AS total`,
    [...conflicts.values, ...biometric.values],
  );
  return row?.total ?? 0;
};

export const listExceptionRows = (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const conflicts = conflictWhere(companyId, filters, scope);
  const biometric = biometricWhere(companyId, filters, scope, true);
  return many<any>(
    env,
    `SELECT * FROM (
      SELECT ac.id, ac.employee_id, e.employee_code, e.full_name AS employee_name,
        NULL AS biometric_user_id, ac.outlet_id, o.name AS outlet_name,
        ac.device_id, bd.device_name, COALESCE(ac.attendance_date, substr(ac.created_at, 1, 10)) AS report_date,
        ac.created_at AS event_time, ac.conflict_type AS exception_type,
        COALESCE(ac.severity, 'warning') AS severity, ac.status,
        COALESCE(ac.message, 'Attendance exception needs review.') AS message,
        CASE ac.conflict_type
          WHEN 'missing_clock_in' THEN 'Review or request a clock-in correction.'
          WHEN 'missing_clock_out' THEN 'Review or request a clock-out correction.'
          ELSE 'Review and resolve this attendance exception.'
        END AS recommended_action,
        'attendance_conflict' AS source_type, ac.id AS source_id
      FROM attendance_conflicts ac
      LEFT JOIN employees e ON e.company_id = ac.company_id AND e.id = ac.employee_id
      LEFT JOIN outlets o ON o.company_id = ac.company_id AND o.id = ac.outlet_id
      LEFT JOIN biometric_devices bd ON bd.company_id = ac.company_id AND bd.id = ac.device_id
      WHERE ${conflicts.sql}
      UNION ALL
      SELECT bl.id, bl.employee_id, e.employee_code, e.full_name AS employee_name,
        bl.biometric_user_id, bl.outlet_id, o.name AS outlet_name,
        bl.device_id, bd.device_name, substr(bl.event_time, 1, 10) AS report_date,
        bl.event_time, bl.sync_status AS exception_type,
        CASE WHEN bl.sync_status IN ('invalid_timestamp', 'ambiguous_employee') THEN 'error' ELSE 'warning' END AS severity,
        bl.sync_status AS status,
        CASE bl.sync_status
          WHEN 'unmatched_employee' THEN 'Biometric punch could not be matched to an employee.'
          WHEN 'ambiguous_employee' THEN 'Biometric punch matches more than one employee.'
          WHEN 'invalid_timestamp' THEN 'Biometric punch timestamp is outside the allowed range.'
          WHEN 'duplicate' THEN 'Duplicate biometric punch was received.'
          ELSE 'Biometric punch needs review.'
        END AS message,
        'Open the biometric punch review screen.' AS recommended_action,
        'biometric_attendance_log' AS source_type, bl.id AS source_id
      FROM biometric_attendance_logs bl
      LEFT JOIN employees e ON e.company_id = bl.company_id AND e.id = bl.employee_id
      LEFT JOIN outlets o ON o.company_id = bl.company_id AND o.id = bl.outlet_id
      LEFT JOIN biometric_devices bd ON bd.company_id = bl.company_id AND bd.id = bl.device_id
      WHERE ${biometric.sql}
    )
    ORDER BY event_time DESC
    LIMIT ? OFFSET ?`,
    [...conflicts.values, ...biometric.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

const biometricWhere = (
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
  exceptionOnly = false,
) => {
  const clauses = ["bl.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "bl", filters, scope);
  if (exceptionOnly) {
    clauses.push("bl.sync_status IN ('duplicate', 'unmatched_employee', 'ambiguous_employee', 'invalid_timestamp', 'rejected')");
  }
  if (filters.from_date) { clauses.push("substr(bl.event_time, 1, 10) >= ?"); values.push(filters.from_date); }
  if (filters.to_date) { clauses.push("substr(bl.event_time, 1, 10) <= ?"); values.push(filters.to_date); }
  if (filters.employee_id) { clauses.push("bl.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("bl.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.device_id) { clauses.push("bl.device_id = ?"); values.push(filters.device_id); }
  if (filters.status) { clauses.push("bl.sync_status = ?"); values.push(filters.status); }
  if (filters.source) { clauses.push("COALESCE(bl.raw_payload_json, '') LIKE ?"); values.push(`%"source":"${filters.source}"%`); }
  return { sql: clauses.join(" AND "), values };
};

export const countDevicePunchRows = async (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const built = biometricWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM biometric_attendance_logs bl WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listDevicePunchRows = (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const built = biometricWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT bl.id, bl.device_id, bd.device_name, bd.device_code, bd.device_type,
       bl.biometric_user_id, bl.employee_id, e.employee_code, e.full_name AS employee_name,
       bl.event_time AS device_timestamp, bl.server_received_at, bl.event_type AS punch_type,
       CASE WHEN COALESCE(bl.raw_payload_json, '') LIKE '%local_bridge%' THEN 'bridge'
            WHEN COALESCE(bl.raw_payload_json, '') LIKE '%push_api%' THEN 'push_api'
            ELSE 'biometric' END AS source_endpoint,
       bl.sync_status AS status, bl.attendance_event_id,
       CASE WHEN bl.sync_status = 'duplicate' THEN 1 ELSE 0 END AS duplicate,
       bl.resolution_reason, bl.resolved_by, bl.resolved_at,
       bl.outlet_id, o.name AS outlet_name
     FROM biometric_attendance_logs bl
     LEFT JOIN biometric_devices bd ON bd.company_id = bl.company_id AND bd.id = bl.device_id
     LEFT JOIN employees e ON e.company_id = bl.company_id AND e.id = bl.employee_id
     LEFT JOIN outlets o ON o.company_id = bl.company_id AND o.id = bl.outlet_id
     WHERE ${built.sql}
     ORDER BY bl.event_time DESC
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const reportSummary = async (
  env: Env,
  companyId: string,
  filters: AttendanceReportFilters,
  scope: AttendanceOutletScope,
) => {
  const built = summaryWhere(companyId, filters, scope);
  const conflictScope = scopedSubqueryWhere(
    companyId,
    filters,
    scope,
    "ac",
    "COALESCE(ac.attendance_date, substr(ac.created_at, 1, 10))",
  );
  const biometricScope = scopedSubqueryWhere(
    companyId,
    filters,
    scope,
    "bl",
    "substr(COALESCE(bl.device_timestamp, bl.event_time), 1, 10)",
  );
  const deviceScope = scopedSubqueryWhere(companyId, filters, scope, "bd");
  const summary = await one<any>(
    env,
    `SELECT COUNT(DISTINCT e.id) AS total_employees_in_scope,
       SUM(CASE WHEN s.status = 'present' OR s.classification = 'present' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN s.status = 'absent' OR s.classification = 'absent' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN COALESCE(s.late_minutes, 0) > 0 THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN s.status IN ('missing_clock_in', 'missing_clock_out', 'incomplete') OR s.classification IN ('missing_clock_in', 'missing_clock_out', 'incomplete') THEN 1 ELSE 0 END) AS missing_punches,
       SUM(CASE WHEN COALESCE(s.overtime_minutes, 0) > 0 THEN 1 ELSE 0 END) AS overtime,
       (SELECT COUNT(*) FROM attendance_conflicts ac WHERE ${conflictScope.sql} AND ac.status IN ('pending', 'open')) AS exceptions_open,
       (SELECT COUNT(*) FROM biometric_attendance_logs bl WHERE ${biometricScope.sql} AND bl.sync_status IN ('unmatched_employee', 'ambiguous_employee', 'invalid_timestamp')) AS unmatched_device_punches,
       (SELECT COUNT(*) FROM biometric_devices bd WHERE ${deviceScope.sql} AND bd.status = 'active' AND (bd.last_seen_at IS NULL OR bd.last_seen_at < datetime('now', '-1 day'))) AS devices_offline_count
     FROM attendance_daily_summary s
     ${employeeJoins}
     WHERE ${built.sql}`,
    [...conflictScope.values, ...biometricScope.values, ...deviceScope.values, ...built.values],
  );
  return summary ?? {};
};
