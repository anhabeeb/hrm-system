import type {
  AttendanceEventRecord,
  AttendanceEventListRow,
  AttendanceListFilters,
  AttendanceListRow,
  AttendanceOutletScope,
  AttendanceSummaryRecord,
} from "./attendance.types";

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

const listWhere = (
  companyId: string,
  filters: AttendanceListFilters,
  scope: AttendanceOutletScope,
) => {
  const clauses = ["s.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "s", filters, scope);
  const exact: Array<[keyof AttendanceListFilters, string]> = [
    ["attendance_date", "s.attendance_date = ?"],
    ["employee_id", "s.employee_id = ?"],
    ["outlet_id", "s.outlet_id = ?"],
    ["department_id", "e.department_id = ?"],
    ["position_id", "e.position_id = ?"],
    ["status", "s.status = ?"],
  ];
  for (const [key, clause] of exact) {
    const value = filters[key];
    if (value) {
      clauses.push(clause);
      values.push(value);
    }
  }
  if (filters.date_from) {
    clauses.push("s.attendance_date >= ?");
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("s.attendance_date <= ?");
    values.push(filters.date_to);
  }
  if (filters.event_type || filters.attendance_method || filters.source || filters.sync_status || filters.approval_status) {
    const eventClauses = ["ev.company_id = s.company_id", "ev.employee_id = s.employee_id", "substr(ev.event_time, 1, 10) = s.attendance_date"];
    if (filters.event_type) {
      eventClauses.push("ev.event_type = ?");
      values.push(filters.event_type);
    }
    if (filters.attendance_method) {
      eventClauses.push("ev.attendance_method = ?");
      values.push(filters.attendance_method);
    }
    if (filters.source) {
      eventClauses.push("ev.source = ?");
      values.push(filters.source);
    }
    if (filters.sync_status) {
      eventClauses.push("ev.sync_status = ?");
      values.push(filters.sync_status);
    }
    if (filters.approval_status) {
      eventClauses.push("ev.approval_status = ?");
      values.push(filters.approval_status);
    }
    clauses.push(`EXISTS (SELECT 1 FROM attendance_events ev WHERE ${eventClauses.join(" AND ")})`);
  }
  return { sql: clauses.join(" AND "), values };
};

export const countAttendance = async (
  env: Env,
  companyId: string,
  filters: AttendanceListFilters,
  scope: AttendanceOutletScope,
) => {
  const built = listWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM attendance_daily_summary s
     JOIN employees e ON e.id = s.employee_id
     WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listAttendance = (
  env: Env,
  companyId: string,
  filters: AttendanceListFilters,
  scope: AttendanceOutletScope,
) => {
  const built = listWhere(companyId, filters, scope);
  return many<AttendanceListRow>(
    env,
    `SELECT s.*, e.employee_code, e.full_name AS employee_name, o.name AS outlet_name,
      (SELECT ev.sync_status FROM attendance_events ev WHERE ev.company_id = s.company_id AND ev.employee_id = s.employee_id AND date(ev.event_time) = s.attendance_date ORDER BY ev.event_time DESC LIMIT 1) AS sync_status,
      'view,correct' AS actions_available
     FROM attendance_daily_summary s
     JOIN employees e ON e.id = s.employee_id
     LEFT JOIN outlets o ON o.id = s.outlet_id
     WHERE ${built.sql}
     ORDER BY ${filters.sort_by === "employee_name" ? "e.full_name" : filters.sort_by === "employee_code" ? "e.employee_code" : filters.sort_by === "outlet_name" ? "o.name" : `s.${filters.sort_by}`} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

const eventWhere = (
  companyId: string,
  filters: AttendanceListFilters,
  scope: AttendanceOutletScope,
) => {
  const clauses = ["ev.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "ev", filters, scope);

  if (filters.employee_id) {
    clauses.push("ev.employee_id = ?");
    values.push(filters.employee_id);
  }
  if (filters.outlet_id) {
    clauses.push("ev.outlet_id = ?");
    values.push(filters.outlet_id);
  }
  if (filters.device_id) {
    clauses.push("ev.device_id = ?");
    values.push(filters.device_id);
  }
  if (filters.event_type) {
    clauses.push("ev.event_type = ?");
    values.push(filters.event_type);
  }
  if (filters.attendance_method) {
    clauses.push("ev.attendance_method = ?");
    values.push(filters.attendance_method);
  }
  if (filters.source) {
    clauses.push("ev.source = ?");
    values.push(filters.source);
  }
  if (filters.sync_status) {
    clauses.push("ev.sync_status = ?");
    values.push(filters.sync_status);
  }
  if (filters.approval_status) {
    clauses.push("ev.approval_status = ?");
    values.push(filters.approval_status);
  }
  if (filters.date_from) {
    clauses.push("substr(ev.event_time, 1, 10) >= ?");
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("substr(ev.event_time, 1, 10) <= ?");
    values.push(filters.date_to);
  }

  return { sql: clauses.join(" AND "), values };
};

const eventOrderBy = (sortBy: AttendanceListFilters["sort_by"]) => {
  if (sortBy === "employee_name") return "e.full_name";
  if (sortBy === "employee_code") return "e.employee_code";
  if (sortBy === "outlet_name") return "o.name";
  if (sortBy === "created_at") return "ev.created_at";
  if (sortBy === "updated_at") return "ev.updated_at";
  if (sortBy === "status") return "ev.approval_status";
  return "ev.event_time";
};

export const countAttendanceEvents = async (
  env: Env,
  companyId: string,
  filters: AttendanceListFilters,
  scope: AttendanceOutletScope,
) => {
  const built = eventWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM attendance_events ev
     LEFT JOIN employees e ON e.id = ev.employee_id AND e.company_id = ev.company_id
     LEFT JOIN devices d ON d.id = ev.device_id AND d.company_id = ev.company_id
     WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listAttendanceEvents = (
  env: Env,
  companyId: string,
  filters: AttendanceListFilters,
  scope: AttendanceOutletScope,
) => {
  const built = eventWhere(companyId, filters, scope);
  return many<AttendanceEventListRow>(
    env,
    `SELECT
       ev.id,
       ev.employee_id,
       e.employee_code,
       e.full_name AS employee_name,
       ev.outlet_id,
       o.name AS outlet_name,
       ev.device_id,
       d.device_name,
       ev.event_type,
       ev.event_time,
       ev.event_time AS event_timestamp,
       ev.attendance_method,
       ev.source,
       ev.sync_status,
       ev.approval_status,
       ev.approval_status AS status,
       ev.created_at,
       ev.updated_at
     FROM attendance_events ev
     LEFT JOIN employees e ON e.id = ev.employee_id AND e.company_id = ev.company_id
     LEFT JOIN outlets o ON o.id = ev.outlet_id AND o.company_id = ev.company_id
     LEFT JOIN devices d ON d.id = ev.device_id AND d.company_id = ev.company_id
     WHERE ${built.sql}
     ORDER BY ${eventOrderBy(filters.sort_by)} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findEmployeeForAttendance = (
  env: Env,
  companyId: string,
  employeeId: string,
) =>
  one<{
    id: string;
    employee_code: string;
    full_name: string;
    primary_outlet_id: string | null;
    department_id: string | null;
    position_id: string | null;
    level: number | null;
    employment_status: string;
    archived_at: string | null;
    deleted_at: string | null;
  }>(
    env,
    "SELECT id, employee_code, full_name, primary_outlet_id, department_id, position_id, level, employment_status, archived_at, joined_at, resigned_at, terminated_at, deleted_at FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );

export const findEmployeeByUserId = (
  env: Env,
  companyId: string,
  userId: string,
) =>
  one<{
    id: string;
    employee_code: string | null;
    full_name: string | null;
    primary_outlet_id: string | null;
    department_id: string | null;
    position_id: string | null;
    level: number | null;
    employment_status: string;
    archived_at: string | null;
    deleted_at: string | null;
  }>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.primary_outlet_id, e.department_id,
            e.position_id, e.level, e.employment_status, e.archived_at, e.deleted_at
       FROM users u
       JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.id = ? AND u.deleted_at IS NULL
      LIMIT 1`,
    [companyId, userId],
  );

export const findEventById = (env: Env, companyId: string, id: string) =>
  one<AttendanceEventRecord>(
    env,
    "SELECT * FROM attendance_events WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findEventDetailById = (env: Env, companyId: string, id: string) =>
  one<
    AttendanceEventRecord & {
      employee_code: string;
      employee_name: string;
      outlet_name: string | null;
    }
  >(
    env,
    `SELECT ev.*, e.employee_code, e.full_name AS employee_name, o.name AS outlet_name
     FROM attendance_events ev
     JOIN employees e ON e.id = ev.employee_id
     LEFT JOIN outlets o ON o.id = ev.outlet_id
     WHERE ev.company_id = ? AND ev.id = ?
     LIMIT 1`,
    [companyId, id],
  );

export const findEventByLocalId = (
  env: Env,
  companyId: string,
  deviceId: string,
  localId: string,
) =>
  one<AttendanceEventRecord>(
    env,
    "SELECT * FROM attendance_events WHERE company_id = ? AND device_id = ? AND local_id = ? LIMIT 1",
    [companyId, deviceId, localId],
  );

export const listEventsForDate = (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
) =>
  many<AttendanceEventRecord>(
    env,
    "SELECT * FROM attendance_events WHERE company_id = ? AND employee_id = ? AND substr(event_time, 1, 10) = ? ORDER BY event_time ASC",
    [companyId, employeeId, attendanceDate],
  );

export const filterEventsForAttendanceWindow = (
  events: AttendanceEventRecord[],
  window?: { start: string; end: string } | null,
) => {
  if (!window) return events;
  const start = new Date(window.start).getTime();
  const end = new Date(window.end).getTime();
  return events.filter((event) => {
    const value = new Date(event.event_time).getTime();
    return Number.isFinite(value) && value >= start && value <= end;
  });
};

export const listEventsForAttendanceWindow = async (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
  window?: { start: string; end: string } | null,
) => {
  if (!window) {
    return listEventsForDate(env, companyId, employeeId, attendanceDate);
  }
  const rows = await many<AttendanceEventRecord>(
    env,
    `SELECT * FROM attendance_events
     WHERE company_id = ? AND employee_id = ?
       AND substr(event_time, 1, 10) BETWEEN ? AND date(?, '+1 day')
     ORDER BY event_time ASC`,
    [companyId, employeeId, attendanceDate, attendanceDate],
  );
  return filterEventsForAttendanceWindow(rows, window);
};

export const findRosterShiftForAttendanceDate = (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
  publishedOnly = false,
) =>
  one<{
    id: string;
    roster_date: string;
    start_time: string;
    end_time: string;
    break_minutes: number | null;
    status: string;
    source: string | null;
  }>(
    env,
    `SELECT id, COALESCE(roster_date, shift_date) AS roster_date, start_time, end_time,
       break_minutes, status, source
     FROM roster_shifts
     WHERE company_id = ? AND employee_id = ?
       AND COALESCE(roster_date, shift_date) = ?
       AND status IN (${publishedOnly ? "'published', 'completed'" : "'draft', 'published', 'completed'"})
     ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END, start_time ASC
     LIMIT 1`,
    [companyId, employeeId, attendanceDate],
  );

export const findApprovedLeaveForDate = (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
) =>
  one<{ id: string; is_paid: number; affects_payroll: number }>(
    env,
    `SELECT lr.id, lt.is_paid, lr.affects_payroll
     FROM leave_requests lr
     JOIN leave_types lt ON lt.company_id = lr.company_id AND lt.id = lr.leave_type_id
     WHERE lr.company_id = ? AND lr.employee_id = ?
       AND lr.status = 'approved'
       AND lr.start_date <= ? AND lr.end_date >= ?
     LIMIT 1`,
    [companyId, employeeId, attendanceDate, attendanceDate],
  );

export const findAttendanceHolidayForDate = (
  env: Env,
  companyId: string,
  outletId: string,
  attendanceDate: string,
) =>
  one<{ id: string; holiday_name: string | null; is_paid: number | null }>(
    env,
    `SELECT h.id, COALESCE(h.name, h.holiday_name) AS holiday_name, COALESCE(h.paid_holiday, h.is_paid, 1) AS is_paid
     FROM holidays h
     WHERE h.company_id = ? AND COALESCE(h.is_enabled, 1) = 1
       AND COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND COALESCE(h.affects_attendance_absence, h.affects_attendance, 1) = 1
       AND h.start_date <= ? AND COALESCE(h.end_date, h.start_date) >= ?
       AND (
         COALESCE(h.applies_to_all_outlets, 1) = 1
         OR h.outlet_id = ?
         OR NOT EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id)
         OR EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id AND ho.outlet_id = ?)
       )
     LIMIT 1`,
    [companyId, attendanceDate, attendanceDate, outletId, outletId],
  );

export const updateAttendanceEvent = (
  env: Env,
  companyId: string,
  employeeId: string,
  id: string,
  eventType: "clock_in" | "clock_out",
  eventTime: string,
) =>
  run(
    env,
    `UPDATE attendance_events
     SET event_type = ?, event_time = ?, attendance_method = 'manual',
       source = 'admin_dashboard', updated_at = ?
     WHERE company_id = ? AND employee_id = ? AND id = ?`,
    [eventType, eventTime, new Date().toISOString(), companyId, employeeId, id],
  );

export const createAttendanceEvent = (
  env: Env,
  input: Omit<AttendanceEventRecord, "created_at" | "updated_at">,
) =>
  run(
    env,
    `INSERT INTO attendance_events (
      id, company_id, employee_id, outlet_id, device_id, event_type,
      event_time, attendance_method, source, local_id, created_offline,
      sync_status, approval_status, source_device_id, source_event_id,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.company_id,
      input.employee_id,
      input.outlet_id,
      input.device_id,
      input.event_type,
      input.event_time,
      input.attendance_method,
      input.source,
      input.local_id,
      input.created_offline,
      input.sync_status,
      input.approval_status,
      input.source_device_id ?? null,
      input.source_event_id ?? null,
      input.metadata_json ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const upsertDailySummary = (
  env: Env,
  summary: Omit<AttendanceSummaryRecord, "created_at" | "updated_at">,
) =>
  run(
    env,
    `INSERT INTO attendance_daily_summary (
      id, company_id, employee_id, outlet_id, attendance_date, first_clock_in,
      last_clock_out, worked_minutes, late_minutes, early_out_minutes,
      break_minutes, overtime_minutes, status, payroll_status, expected_start,
      expected_end, classification, absence_minutes, is_paid_leave, is_unpaid_leave,
      is_holiday, is_rest_day, is_incomplete, warnings_json, source_references_json,
      calculated_at, recalculated_by, correction_applied_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, employee_id, attendance_date) DO UPDATE SET
      outlet_id = excluded.outlet_id,
      first_clock_in = excluded.first_clock_in,
      last_clock_out = excluded.last_clock_out,
      worked_minutes = excluded.worked_minutes,
      late_minutes = excluded.late_minutes,
      early_out_minutes = excluded.early_out_minutes,
      break_minutes = excluded.break_minutes,
      overtime_minutes = excluded.overtime_minutes,
      status = excluded.status,
      payroll_status = excluded.payroll_status,
      expected_start = excluded.expected_start,
      expected_end = excluded.expected_end,
      classification = excluded.classification,
      absence_minutes = excluded.absence_minutes,
      is_paid_leave = excluded.is_paid_leave,
      is_unpaid_leave = excluded.is_unpaid_leave,
      is_holiday = excluded.is_holiday,
      is_rest_day = excluded.is_rest_day,
      is_incomplete = excluded.is_incomplete,
      warnings_json = excluded.warnings_json,
      source_references_json = excluded.source_references_json,
      calculated_at = excluded.calculated_at,
      recalculated_by = excluded.recalculated_by,
      correction_applied_id = excluded.correction_applied_id,
      updated_at = excluded.updated_at`,
    [
      summary.id,
      summary.company_id,
      summary.employee_id,
      summary.outlet_id,
      summary.attendance_date,
      summary.first_clock_in,
      summary.last_clock_out,
      summary.worked_minutes,
      summary.late_minutes,
      summary.early_out_minutes,
      summary.break_minutes,
      summary.overtime_minutes,
      summary.status,
      summary.payroll_status,
      summary.expected_start ?? null,
      summary.expected_end ?? null,
      summary.classification ?? summary.status,
      summary.absence_minutes ?? 0,
      summary.is_paid_leave ?? 0,
      summary.is_unpaid_leave ?? 0,
      summary.is_holiday ?? 0,
      summary.is_rest_day ?? 0,
      summary.is_incomplete ?? 0,
      summary.warnings_json ?? null,
      summary.source_references_json ?? null,
      summary.calculated_at ?? new Date().toISOString(),
      summary.recalculated_by ?? null,
      summary.correction_applied_id ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const findDailySummary = (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
) =>
  one<AttendanceSummaryRecord>(
    env,
    "SELECT * FROM attendance_daily_summary WHERE company_id = ? AND employee_id = ? AND attendance_date = ? LIMIT 1",
    [companyId, employeeId, attendanceDate],
  );

export const findPayrollRunForMonth = (env: Env, companyId: string, payrollMonth: string) =>
  one<{ status: string }>(
    env,
    "SELECT status FROM payroll_runs WHERE company_id = ? AND payroll_month = ? LIMIT 1",
    [companyId, payrollMonth],
  );

export const findEmployeeOutlet = (
  env: Env,
  companyId: string,
  employeeId: string,
) =>
  one<{ primary_outlet_id: string | null }>(
    env,
    "SELECT primary_outlet_id FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );

export const findSummaryOutlet = (
  env: Env,
  companyId: string,
  employeeId: string,
  attendanceDate: string,
) =>
  one<{ outlet_id: string | null }>(
    env,
    "SELECT outlet_id FROM attendance_daily_summary WHERE company_id = ? AND employee_id = ? AND attendance_date = ? LIMIT 1",
    [companyId, employeeId, attendanceDate],
  );

export const createCorrection = (env: Env, input: {
  id: string;
  companyId: string;
  employeeId: string;
  outletId?: string | null;
  attendanceEventId?: string | null;
  correctionType: string;
  oldValueJson?: string | null;
  newValueJson: string;
  reason: string;
  requestedBy?: string | null;
  requestedDate?: string | null;
}) =>
  run(
    env,
    `INSERT INTO attendance_corrections (
      id, company_id, employee_id, attendance_event_id, correction_type,
      old_value_json, new_value_json, reason, requested_by, status,
      approval_status, requested_date, outlet_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'DRAFT', ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.attendanceEventId ?? null,
      input.correctionType,
      input.oldValueJson ?? null,
      input.newValueJson,
      input.reason,
      input.requestedBy ?? null,
      input.requestedDate ?? null,
      input.outletId ?? null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const findCorrectionById = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM attendance_corrections WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const findCorrectionByApprovalRequestId = (env: Env, companyId: string, approvalRequestId: string) =>
  one<any>(env, "SELECT * FROM attendance_corrections WHERE company_id = ? AND approval_request_id = ? LIMIT 1", [companyId, approvalRequestId]);

export const findDuplicatePendingCorrection = (
  env: Env,
  input: { companyId: string; employeeId: string; correctionType: string; requestedDate?: string | null; attendanceEventId?: string | null; currentId?: string | null },
) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM attendance_corrections
      WHERE company_id = ? AND employee_id = ? AND correction_type = ?
        AND status IN ('pending', 'PENDING', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL', 'PENDING_MANUAL_REVIEW')
        AND (? IS NULL OR requested_date = ? OR date(created_at) = ?)
        AND (? IS NULL OR attendance_event_id = ?)
        AND (? IS NULL OR id <> ?)
      LIMIT 1`,
    [
      input.companyId,
      input.employeeId,
      input.correctionType,
      input.requestedDate ?? null,
      input.requestedDate ?? null,
      input.requestedDate ?? null,
      input.attendanceEventId ?? null,
      input.attendanceEventId ?? null,
      input.currentId ?? null,
      input.currentId ?? null,
    ],
  );

export const updateCorrectionApprovalLink = (
  env: Env,
  companyId: string,
  id: string,
  input: { approvalRequestId: string; approvalStatus: string; currentStep?: string | null },
) =>
  run(
    env,
    `UPDATE attendance_corrections
        SET approval_request_id = ?, approval_status = ?, approval_current_step = ?,
            approval_submitted_at = COALESCE(approval_submitted_at, ?), updated_at = ?
      WHERE company_id = ? AND id = ?`,
    [input.approvalRequestId, input.approvalStatus, input.currentStep ?? null, new Date().toISOString(), new Date().toISOString(), companyId, id],
  );

export const updateCorrectionApprovalStatus = (
  env: Env,
  companyId: string,
  id: string,
  input: {
    status?: string;
    approvalStatus?: string | null;
    currentStep?: string | null;
    actorId?: string | null;
    reason?: string | null;
    departmentApproved?: boolean;
    hrApproved?: boolean;
    rejected?: boolean;
    cancelled?: boolean;
    applied?: boolean;
  },
) => {
  const now = new Date().toISOString();
  return run(
    env,
    `UPDATE attendance_corrections
        SET status = COALESCE(?, status),
            approval_status = COALESCE(?, approval_status),
            approval_current_step = ?,
            approved_by = CASE WHEN ? = 1 OR ? = 1 THEN ? ELSE approved_by END,
            department_approved_at = CASE WHEN ? = 1 THEN ? ELSE department_approved_at END,
            department_approved_by = CASE WHEN ? = 1 THEN ? ELSE department_approved_by END,
            hr_approved_at = CASE WHEN ? = 1 THEN ? ELSE hr_approved_at END,
            hr_approved_by = CASE WHEN ? = 1 THEN ? ELSE hr_approved_by END,
            rejected_at = CASE WHEN ? = 1 THEN ? ELSE rejected_at END,
            rejected_by = CASE WHEN ? = 1 THEN ? ELSE rejected_by END,
            rejection_reason = CASE WHEN ? = 1 THEN ? ELSE rejection_reason END,
            cancelled_at = CASE WHEN ? = 1 THEN ? ELSE cancelled_at END,
            cancelled_by = CASE WHEN ? = 1 THEN ? ELSE cancelled_by END,
            cancellation_reason = CASE WHEN ? = 1 THEN ? ELSE cancellation_reason END,
            approval_completed_at = CASE WHEN ? = 1 OR ? = 1 OR ? = 1 THEN ? ELSE approval_completed_at END,
            applied_at = CASE WHEN ? = 1 THEN ? ELSE applied_at END,
            applied_by = CASE WHEN ? = 1 THEN ? ELSE applied_by END,
            updated_at = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.status ?? null,
      input.approvalStatus ?? null,
      input.currentStep ?? null,
      input.departmentApproved ? 1 : 0,
      input.hrApproved ? 1 : 0,
      input.actorId ?? null,
      input.departmentApproved ? 1 : 0,
      now,
      input.departmentApproved ? 1 : 0,
      input.actorId ?? null,
      input.hrApproved ? 1 : 0,
      now,
      input.hrApproved ? 1 : 0,
      input.actorId ?? null,
      input.rejected ? 1 : 0,
      now,
      input.rejected ? 1 : 0,
      input.actorId ?? null,
      input.rejected ? 1 : 0,
      input.reason ?? null,
      input.cancelled ? 1 : 0,
      now,
      input.cancelled ? 1 : 0,
      input.actorId ?? null,
      input.cancelled ? 1 : 0,
      input.reason ?? null,
      input.hrApproved ? 1 : 0,
      input.rejected ? 1 : 0,
      input.cancelled ? 1 : 0,
      now,
      input.applied ? 1 : 0,
      now,
      input.applied ? 1 : 0,
      input.actorId ?? null,
      now,
      companyId,
      id,
    ],
  );
};

export const updateCorrectionStatus = (
  env: Env,
  companyId: string,
  id: string,
  status: string,
  approvedBy?: string | null,
) =>
  run(
    env,
    "UPDATE attendance_corrections SET status = ?, approved_by = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [status, approvedBy ?? null, new Date().toISOString(), companyId, id],
  );

export const listCorrections = (
  env: Env,
  companyId: string,
  filters: { status?: string; employee_id?: string; outlet_id?: string; date_from?: string; date_to?: string; page: number; page_size: number },
  scope: AttendanceOutletScope,
  visibilityExtra?: string,
  visibilityValues: unknown[] = [],
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!scope.isSuperAdmin) {
    if (scope.outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push("COALESCE(c.outlet_id, e.primary_outlet_id) IN (" + scope.outletIds.map(() => "?").join(", ") + ")");
      values.push(...scope.outletIds);
    }
  }
  if (filters.status) { clauses.push("c.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("COALESCE(c.outlet_id, e.primary_outlet_id) = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("COALESCE(c.requested_date, date(c.created_at)) >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("COALESCE(c.requested_date, date(c.created_at)) <= ?"); values.push(filters.date_to); }
  if (visibilityExtra) clauses.push(visibilityExtra);
  return many<any>(
    env,
    `SELECT c.*, e.full_name AS employee_name, e.employee_code, e.department_id, e.position_id, e.level,
            u.full_name AS requested_by_name,
            ars.step_name AS approval_current_step_name
       FROM attendance_corrections c
       JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
       LEFT JOIN users u ON u.company_id = c.company_id AND u.id = c.requested_by
       LEFT JOIN approval_request_steps ars ON ars.company_id = c.company_id AND ars.id = c.approval_current_step
      WHERE ${clauses.join(" AND ")}
      ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...values, ...visibilityValues, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countCorrections = async (
  env: Env,
  companyId: string,
  filters: { status?: string; employee_id?: string; outlet_id?: string; date_from?: string; date_to?: string },
  scope: AttendanceOutletScope,
  visibilityExtra?: string,
  visibilityValues: unknown[] = [],
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!scope.isSuperAdmin) {
    if (scope.outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push("COALESCE(c.outlet_id, e.primary_outlet_id) IN (" + scope.outletIds.map(() => "?").join(", ") + ")");
      values.push(...scope.outletIds);
    }
  }
  if (filters.status) { clauses.push("c.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("COALESCE(c.outlet_id, e.primary_outlet_id) = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("COALESCE(c.requested_date, date(c.created_at)) >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("COALESCE(c.requested_date, date(c.created_at)) <= ?"); values.push(filters.date_to); }
  if (visibilityExtra) clauses.push(visibilityExtra);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
       FROM attendance_corrections c
       JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
      WHERE ${clauses.join(" AND ")}`,
    [...values, ...visibilityValues],
  );
  return row?.total ?? 0;
};

export const createConflict = (env: Env, input: {
  id: string;
  companyId: string;
  employeeId?: string | null;
  outletId?: string | null;
  deviceId?: string | null;
  conflictType: string;
  localPayloadJson?: string | null;
  serverPayloadJson?: string | null;
}) =>
  run(
    env,
    `INSERT INTO attendance_conflicts (
      id, company_id, employee_id, outlet_id, device_id, conflict_type,
      local_payload_json, server_payload_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId ?? null,
      input.outletId ?? null,
      input.deviceId ?? null,
      input.conflictType,
      input.localPayloadJson ?? null,
      input.serverPayloadJson ?? null,
      new Date().toISOString(),
    ],
  );

export const findOpenAttendanceRuleConflict = (
  env: Env,
  input: {
    companyId: string;
    employeeId: string;
    attendanceDate: string;
    conflictType: string;
  },
) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM attendance_conflicts
     WHERE company_id = ? AND employee_id = ? AND attendance_date = ?
       AND conflict_type = ? AND source = 'attendance_rule_engine'
       AND status IN ('pending', 'open')
     LIMIT 1`,
    [input.companyId, input.employeeId, input.attendanceDate, input.conflictType],
  );

export const createAttendanceRuleConflict = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    employeeId: string;
    outletId?: string | null;
    conflictType: string;
    attendanceDate: string;
    severity: "warning" | "error";
    message: string;
  },
) =>
  run(
    env,
    `INSERT INTO attendance_conflicts (
      id, company_id, employee_id, outlet_id, device_id, conflict_type,
      local_payload_json, server_payload_json, status, attendance_date,
      severity, message, source, created_at
    ) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, 'open', ?, ?, ?, 'attendance_rule_engine', ?)`,
    [
      input.id,
      input.companyId,
      input.employeeId,
      input.outletId ?? null,
      input.conflictType,
      JSON.stringify({
        attendance_date: input.attendanceDate,
        severity: input.severity,
        message: input.message,
        source: "attendance_rule_engine",
      }),
      input.attendanceDate,
      input.severity,
      input.message,
      new Date().toISOString(),
    ],
  );

export const findConflictById = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM attendance_conflicts WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const resolveConflict = (
  env: Env,
  companyId: string,
  id: string,
  userId: string,
  notes: string,
) =>
  run(
    env,
    "UPDATE attendance_conflicts SET status = 'resolved', resolved_by = ?, resolution_notes = ?, resolved_at = ? WHERE company_id = ? AND id = ?",
    [userId, notes, new Date().toISOString(), companyId, id],
  );

export const listConflicts = (
  env: Env,
  companyId: string,
  filters: { status?: string; conflict_type?: string; employee_id?: string; outlet_id?: string; date_from?: string; date_to?: string; page: number; page_size: number },
  scope: AttendanceOutletScope,
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "c", filters, scope);
  if (filters.status) { clauses.push("c.status = ?"); values.push(filters.status); }
  if (filters.conflict_type) { clauses.push("c.conflict_type = ?"); values.push(filters.conflict_type); }
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("c.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("c.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("c.created_at <= ?"); values.push(filters.date_to); }
  return many<any>(
    env,
    `SELECT c.* FROM attendance_conflicts c WHERE ${clauses.join(" AND ")} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countConflicts = async (
  env: Env,
  companyId: string,
  filters: { status?: string; conflict_type?: string; employee_id?: string; outlet_id?: string; date_from?: string; date_to?: string },
  scope: AttendanceOutletScope,
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "c", filters, scope);
  if (filters.status) { clauses.push("c.status = ?"); values.push(filters.status); }
  if (filters.conflict_type) { clauses.push("c.conflict_type = ?"); values.push(filters.conflict_type); }
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("c.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("c.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("c.created_at <= ?"); values.push(filters.date_to); }
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_conflicts c WHERE ${clauses.join(" AND ")}`,
    values,
  );
  return row?.total ?? 0;
};

export const listMissingPunches = (
  env: Env,
  companyId: string,
  filters: { date_from?: string; date_to?: string; outlet_id?: string; employee_id?: string; missing_type?: string; page: number; page_size: number },
  scope: AttendanceOutletScope,
) => {
  const clauses = ["s.company_id = ?", "s.status IN ('checked_in', 'missing_clock_in', 'missing_clock_out')"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "s", filters, scope);
  if (filters.employee_id) { clauses.push("s.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("s.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("s.attendance_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("s.attendance_date <= ?"); values.push(filters.date_to); }
  if (filters.missing_type === "clock_in") clauses.push("s.status = 'missing_clock_in'");
  if (filters.missing_type === "clock_out") clauses.push("s.status IN ('checked_in', 'missing_clock_out')");
  return many<AttendanceListRow>(
    env,
    `SELECT s.*, e.employee_code, e.full_name AS employee_name, o.name AS outlet_name, NULL AS sync_status, 'correct,resolve' AS actions_available
     FROM attendance_daily_summary s JOIN employees e ON e.id = s.employee_id LEFT JOIN outlets o ON o.id = s.outlet_id
     WHERE ${clauses.join(" AND ")} ORDER BY s.attendance_date DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countMissingPunches = async (
  env: Env,
  companyId: string,
  filters: { date_from?: string; date_to?: string; outlet_id?: string; employee_id?: string; missing_type?: string },
  scope: AttendanceOutletScope,
) => {
  const clauses = ["s.company_id = ?", "s.status IN ('checked_in', 'missing_clock_in', 'missing_clock_out')"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "s", filters, scope);
  if (filters.employee_id) { clauses.push("s.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("s.outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("s.attendance_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("s.attendance_date <= ?"); values.push(filters.date_to); }
  if (filters.missing_type === "clock_in") clauses.push("s.status = 'missing_clock_in'");
  if (filters.missing_type === "clock_out") clauses.push("s.status IN ('checked_in', 'missing_clock_out')");
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_daily_summary s WHERE ${clauses.join(" AND ")}`,
    values,
  );
  return row?.total ?? 0;
};
