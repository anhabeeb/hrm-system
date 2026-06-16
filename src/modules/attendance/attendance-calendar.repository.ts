import type { AuthActor } from "../../types/api.types";
import type { AttendanceCalendarEmployeeLookupOption, AttendanceCalendarEmployeeRecord, AttendanceCalendarPayrollPeriod } from "./attendance-calendar.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const employeeOutletClause = (context: AuthActor, alias = "e") => {
  if (context.isSuperAdmin || context.isAdmin) return { sql: "", values: [] as string[] };
  if (context.outletIds.length === 0) return { sql: ` AND ${alias}.primary_outlet_id IS NULL`, values: [] as string[] };
  return {
    sql: ` AND (${alias}.primary_outlet_id IS NULL OR ${alias}.primary_outlet_id IN (${context.outletIds.map(() => "?").join(", ")}))`,
    values: context.outletIds,
  };
};

export const findEmployeeForCalendar = (
  env: Env,
  context: AuthActor,
  employeeId: string,
) => {
  const outlet = employeeOutletClause(context, "e");
  return one<AttendanceCalendarEmployeeRecord>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.department_id, d.name AS department_name,
      e.position_id, p.title AS position_name, e.level, e.primary_outlet_id, NULL AS store_id,
      e.joined_at, e.resigned_at, e.terminated_at, e.employment_status, e.deleted_at, e.archived_at
     FROM employees e
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
     WHERE e.company_id = ? AND e.id = ? AND e.deleted_at IS NULL${outlet.sql}
     LIMIT 1`,
    [context.companyId, employeeId, ...outlet.values],
  );
};

export const findActorLinkedEmployee = (env: Env, context: AuthActor) =>
  one<AttendanceCalendarEmployeeRecord>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.department_id, d.name AS department_name,
      e.position_id, p.title AS position_name, e.level, e.primary_outlet_id, NULL AS store_id,
      e.joined_at, e.resigned_at, e.terminated_at, e.employment_status, e.deleted_at, e.archived_at
     FROM users u
     JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
     WHERE u.company_id = ? AND u.id = ? AND u.deleted_at IS NULL AND e.deleted_at IS NULL
     LIMIT 1`,
    [context.companyId, context.actorUserId],
  );

export const listCalendarEmployees = (
  env: Env,
  context: AuthActor,
  options: {
    search?: string;
    departmentId?: string;
    outletId?: string;
    limit: number;
    actorEmployee?: AttendanceCalendarEmployeeRecord | null;
    scope: "broad" | "team" | "own" | "none";
  },
) => {
  const clauses = ["e.company_id = ?", "e.deleted_at IS NULL", "lower(COALESCE(e.employment_status, 'active')) NOT IN ('archived', 'deleted')"];
  const values: unknown[] = [context.companyId];
  const outlet = employeeOutletClause(context, "e");
  if (outlet.sql) {
    clauses.push(outlet.sql.replace(/^ AND /, ""));
    values.push(...outlet.values);
  }
  if (options.outletId) {
    clauses.push("e.primary_outlet_id = ?");
    values.push(options.outletId);
  }
  if (options.departmentId) {
    clauses.push("e.department_id = ?");
    values.push(options.departmentId);
  }
  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`;
    clauses.push(`(
      lower(COALESCE(e.employee_code, '')) LIKE ?
      OR lower(COALESCE(e.full_name, '')) LIKE ?
      OR lower(COALESCE(d.name, '')) LIKE ?
      OR lower(COALESCE(p.title, '')) LIKE ?
      OR lower(COALESCE(o.name, '')) LIKE ?
    )`);
    values.push(term, term, term, term, term);
  }

  if (options.scope === "team" && options.actorEmployee) {
    clauses.push("e.department_id = ?");
    values.push(options.actorEmployee.department_id);
    clauses.push("COALESCE(e.level, 0) < ?");
    values.push(Number(options.actorEmployee.level ?? 0));
  } else if (options.scope === "own" && options.actorEmployee) {
    clauses.push("e.id = ?");
    values.push(options.actorEmployee.id);
  } else if (options.scope === "none") {
    clauses.push("1 = 0");
  }

  return many<AttendanceCalendarEmployeeLookupOption>(
    env,
    `SELECT e.id, e.employee_code AS code, e.full_name AS name,
      d.name AS department_name, p.title AS position_name, e.level,
      o.name AS outlet_name, NULL AS store_name, e.employment_status AS status,
      COALESCE(e.employee_code, e.id) || ' - ' || e.full_name ||
        CASE WHEN d.name IS NOT NULL THEN ' / ' || d.name ELSE '' END ||
        CASE WHEN p.title IS NOT NULL THEN ' / ' || p.title ELSE '' END AS label
     FROM employees e
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.employee_code ASC, e.full_name ASC
     LIMIT ?`,
    [...values, options.limit],
  );
};

export const findPayrollRunForCalendar = async (
  env: Env,
  companyId: string,
  month: string,
  payrollPeriodId?: string,
): Promise<AttendanceCalendarPayrollPeriod | null> => {
  const row = await one<Record<string, any>>(
    env,
    payrollPeriodId
      ? `SELECT id, payroll_month, period_start, period_end, status, locked_at, finalized_at
         FROM payroll_runs WHERE company_id = ? AND id = ? LIMIT 1`
      : `SELECT id, payroll_month, period_start, period_end, status, locked_at, finalized_at
         FROM payroll_runs WHERE company_id = ? AND payroll_month = ? ORDER BY created_at DESC LIMIT 1`,
    payrollPeriodId ? [companyId, payrollPeriodId] : [companyId, month],
  );
  if (!row) return null;
  const start = String(row.period_start ?? `${row.payroll_month ?? month}-01`);
  const end = String(row.period_end ?? `${row.payroll_month ?? month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate().toString().padStart(2, "0")}`);
  return {
    id: String(row.id),
    start_date: start,
    end_date: end,
    pay_date: end,
    status: String(row.status ?? "OPEN").toUpperCase(),
    attendance_locked: Boolean(row.locked_at || row.finalized_at || ["locked", "finalized"].includes(String(row.status ?? "").toLowerCase())),
    is_derived: false,
  };
};

export const listDailySummaries = (env: Env, companyId: string, employeeId: string, startDate: string, endDate: string) =>
  many<Record<string, any>>(
    env,
    `SELECT * FROM attendance_daily_summary
     WHERE company_id = ? AND employee_id = ? AND attendance_date BETWEEN ? AND ?
     ORDER BY attendance_date ASC`,
    [companyId, employeeId, startDate, endDate],
  );

export const listAttendanceEvents = (env: Env, companyId: string, employeeId: string, startDate: string, endDate: string) =>
  many<Record<string, any>>(
    env,
    `SELECT * FROM attendance_events
     WHERE company_id = ? AND employee_id = ? AND substr(event_time, 1, 10) BETWEEN ? AND ?
     ORDER BY event_time ASC`,
    [companyId, employeeId, startDate, endDate],
  );

export const listApprovedLeaves = (env: Env, companyId: string, employeeId: string, startDate: string, endDate: string) =>
  many<Record<string, any>>(
    env,
    `SELECT l.id, l.start_date, l.end_date, l.status, l.affects_payroll,
      lt.leave_name, lt.leave_key, lt.is_paid
     FROM leave_requests l
     LEFT JOIN leave_types lt ON lt.company_id = l.company_id AND lt.id = l.leave_type_id
     WHERE l.company_id = ? AND l.employee_id = ?
       AND l.start_date <= ? AND l.end_date >= ?
       AND l.status IN ('approved', 'APPROVED', 'APPLIED')
     ORDER BY l.start_date ASC`,
    [companyId, employeeId, endDate, startDate],
  );

export const listAttendanceCorrections = (env: Env, companyId: string, employeeId: string, startDate: string, endDate: string) =>
  many<Record<string, any>>(
    env,
    `SELECT id, requested_date, created_at, status, correction_type
     FROM attendance_corrections
     WHERE company_id = ? AND employee_id = ?
       AND COALESCE(requested_date, date(created_at)) BETWEEN ? AND ?
     ORDER BY created_at DESC`,
    [companyId, employeeId, startDate, endDate],
  );

export const listRosterShifts = (env: Env, companyId: string, employeeId: string, startDate: string, endDate: string) =>
  many<Record<string, any>>(
    env,
    `SELECT rs.id, COALESCE(rs.roster_date, rs.shift_date) AS shift_date,
      COALESCE(st.name, rs.source, 'Assigned shift') AS shift_name,
      rs.start_time, rs.end_time, rs.status
     FROM roster_shifts rs
     LEFT JOIN shift_templates st ON st.company_id = rs.company_id AND st.id = rs.shift_template_id
     WHERE rs.company_id = ? AND rs.employee_id = ?
       AND COALESCE(rs.roster_date, rs.shift_date) BETWEEN ? AND ?
     ORDER BY COALESCE(rs.roster_date, rs.shift_date), rs.start_time`,
    [companyId, employeeId, startDate, endDate],
  );

export const listHolidays = (env: Env, companyId: string, outletId: string | null, startDate: string, endDate: string) =>
  many<Record<string, any>>(
    env,
    `SELECT h.id, COALESCE(h.name, h.holiday_name) AS holiday_name,
      COALESCE(h.date, h.start_date) AS start_date, COALESCE(h.end_date, h.date, h.start_date) AS end_date,
      COALESCE(h.paid_holiday, h.is_paid, 1) AS is_paid
     FROM holidays h
     WHERE h.company_id = ?
       AND COALESCE(h.is_enabled, 1) = 1
       AND COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND COALESCE(h.affects_attendance_absence, h.affects_attendance, 1) = 1
       AND COALESCE(h.date, h.start_date) <= ?
       AND COALESCE(h.end_date, h.date, h.start_date) >= ?
       AND (
         ? IS NULL
         OR COALESCE(h.applies_to_all_outlets, 1) = 1
         OR h.outlet_id = ?
         OR NOT EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id)
         OR EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id AND ho.outlet_id = ?)
       )
     ORDER BY COALESCE(h.date, h.start_date) ASC`,
    [companyId, endDate, startDate, outletId, outletId, outletId],
  );
