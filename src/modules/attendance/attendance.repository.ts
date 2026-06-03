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
    employment_status: string;
    deleted_at: string | null;
  }>(
    env,
    "SELECT id, employee_code, full_name, primary_outlet_id, employment_status, deleted_at FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
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

export const updateAttendanceEvent = (
  env: Env,
  companyId: string,
  id: string,
  eventType: "clock_in" | "clock_out",
  eventTime: string,
) =>
  run(
    env,
    `UPDATE attendance_events
     SET event_type = ?, event_time = ?, attendance_method = 'manual',
       source = 'admin_dashboard', updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [eventType, eventTime, new Date().toISOString(), companyId, id],
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
      sync_status, approval_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      break_minutes, overtime_minutes, status, payroll_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  attendanceEventId?: string | null;
  correctionType: string;
  oldValueJson?: string | null;
  newValueJson: string;
  reason: string;
  requestedBy?: string | null;
}) =>
  run(
    env,
    `INSERT INTO attendance_corrections (
      id, company_id, employee_id, attendance_event_id, correction_type,
      old_value_json, new_value_json, reason, requested_by, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
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
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const findCorrectionById = (env: Env, companyId: string, id: string) =>
  one<any>(env, "SELECT * FROM attendance_corrections WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

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
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.status) { clauses.push("c.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("c.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("c.created_at <= ?"); values.push(filters.date_to); }
  return many<any>(
    env,
    `SELECT c.* FROM attendance_corrections c JOIN employees e ON e.id = c.employee_id WHERE ${clauses.join(" AND ")} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countCorrections = async (
  env: Env,
  companyId: string,
  filters: { status?: string; employee_id?: string; outlet_id?: string; date_from?: string; date_to?: string },
  scope: AttendanceOutletScope,
) => {
  const clauses = ["c.company_id = ?"];
  const values: unknown[] = [companyId];
  applyOutletScope(clauses, values, "e", filters, scope);
  if (filters.status) { clauses.push("c.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("c.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("c.created_at >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("c.created_at <= ?"); values.push(filters.date_to); }
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM attendance_corrections c JOIN employees e ON e.id = c.employee_id WHERE ${clauses.join(" AND ")}`,
    values,
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
