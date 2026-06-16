import type { AuthActor } from "../../types/api.types";
import type {
  RosterMatrixAssignmentRecord,
  RosterMatrixAttendanceOverlayRecord,
  RosterMatrixEmployeeOption,
  RosterMatrixEmployeeRecord,
  RosterMatrixPendingChangeRecord,
  RosterMatrixShiftOption,
} from "./roster-weekly-matrix.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const employeeOutletClause = (actor: AuthActor, alias = "e") => {
  if (actor.isSuperAdmin || actor.isAdmin) return { sql: "", values: [] as string[] };
  if (actor.outletIds.length === 0) return { sql: ` AND ${alias}.primary_outlet_id IS NULL`, values: [] as string[] };
  return {
    sql: ` AND (${alias}.primary_outlet_id IS NULL OR ${alias}.primary_outlet_id IN (${actor.outletIds.map(() => "?").join(", ")}))`,
    values: actor.outletIds,
  };
};

export const findActorLinkedEmployee = (env: Env, actor: AuthActor) =>
  one<RosterMatrixEmployeeRecord>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.department_id, d.name AS department_name,
      e.position_id, p.title AS position_name, e.level, e.primary_outlet_id, o.name AS outlet_name,
      e.joined_at, e.resigned_at, e.terminated_at, e.employment_status, e.deleted_at, e.archived_at
     FROM users u
     JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     WHERE u.company_id = ? AND u.id = ? AND u.deleted_at IS NULL AND e.deleted_at IS NULL
     LIMIT 1`,
    [actor.companyId, actor.actorUserId],
  );

export const findDepartment = (env: Env, companyId: string, departmentId: string) =>
  one<{ id: string; name: string }>(
    env,
    `SELECT id, name FROM departments
     WHERE company_id = ? AND id = ? AND archived_at IS NULL AND COALESCE(is_active, 1) = 1
     LIMIT 1`,
    [companyId, departmentId],
  );

export const listRosterMatrixEmployees = (
  env: Env,
  actor: AuthActor,
  options: {
    departmentId?: string | null;
    outletId?: string | null;
    search?: string | null;
    actorEmployee?: RosterMatrixEmployeeRecord | null;
    scope: "all" | "team" | "none";
    limit?: number;
  },
) => {
  const clauses = [
    "e.company_id = ?",
    "e.deleted_at IS NULL",
    "e.archived_at IS NULL",
    "lower(COALESCE(e.employment_status, 'active')) NOT IN ('archived', 'deleted')",
  ];
  const values: unknown[] = [actor.companyId];
  const outlet = employeeOutletClause(actor, "e");
  if (outlet.sql) {
    clauses.push(outlet.sql.replace(/^ AND /, ""));
    values.push(...outlet.values);
  }
  if (options.departmentId) {
    clauses.push("e.department_id = ?");
    values.push(options.departmentId);
  }
  if (options.outletId) {
    clauses.push("e.primary_outlet_id = ?");
    values.push(options.outletId);
  }
  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`;
    clauses.push(`(
      lower(COALESCE(e.employee_code, '')) LIKE ?
      OR lower(COALESCE(e.full_name, '')) LIKE ?
      OR lower(COALESCE(d.name, '')) LIKE ?
      OR lower(COALESCE(p.title, '')) LIKE ?
    )`);
    values.push(term, term, term, term);
  }
  if (options.scope === "team" && options.actorEmployee) {
    clauses.push("e.department_id = ?");
    values.push(options.actorEmployee.department_id);
    clauses.push("COALESCE(e.level, 0) < ?");
    values.push(Number(options.actorEmployee.level ?? 0));
  } else if (options.scope === "none") {
    clauses.push("1 = 0");
  }

  return many<RosterMatrixEmployeeRecord>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.department_id, d.name AS department_name,
      e.position_id, p.title AS position_name, e.level, e.primary_outlet_id, o.name AS outlet_name,
      e.joined_at, e.resigned_at, e.terminated_at, e.employment_status, e.deleted_at, e.archived_at
     FROM employees e
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.employee_code ASC, e.full_name ASC
     LIMIT ?`,
    [...values, options.limit ?? 150],
  );
};

export const listRosterMatrixEmployeeOptions = async (
  env: Env,
  actor: AuthActor,
  options: Parameters<typeof listRosterMatrixEmployees>[2],
): Promise<RosterMatrixEmployeeOption[]> => {
  const rows = await listRosterMatrixEmployees(env, actor, options);
  return rows.map((row) => ({
    id: row.id,
    employee_no: row.employee_code,
    name: row.full_name,
    department_name: row.department_name,
    position_name: row.position_name,
    level: row.level,
    outlet_name: row.outlet_name,
    store_name: null,
    status: row.employment_status,
  }));
};

export const listRosterMatrixShifts = (
  env: Env,
  actor: AuthActor,
  options: { departmentId?: string | null; outletId?: string | null } = {},
) => {
  const clauses = ["company_id = ?", "status = 'active'", "active = 1"];
  const values: unknown[] = [actor.companyId];
  if (options.departmentId) {
    clauses.push("(department_id = ? OR department_id IS NULL)");
    values.push(options.departmentId);
  }
  if (options.outletId) {
    clauses.push("(outlet_id = ? OR outlet_id IS NULL)");
    values.push(options.outletId);
  } else if (!actor.isSuperAdmin && !actor.isAdmin && actor.outletIds.length > 0) {
    clauses.push(`(outlet_id IS NULL OR outlet_id IN (${actor.outletIds.map(() => "?").join(", ")}))`);
    values.push(...actor.outletIds);
  }
  return many<RosterMatrixShiftOption>(
    env,
    `SELECT id, name, code, start_time, end_time, break_minutes, department_id, outlet_id
     FROM shift_templates
     WHERE ${clauses.join(" AND ")}
     ORDER BY name ASC
     LIMIT 200`,
    values,
  );
};

export const listRosterMatrixAssignments = (
  env: Env,
  companyId: string,
  employeeIds: string[],
  startDate: string,
  endDate: string,
) => {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return many<RosterMatrixAssignmentRecord>(
    env,
    `SELECT r.id, r.employee_id, COALESCE(r.roster_date, r.shift_date) AS roster_date,
      r.status, r.shift_template_id, st.name AS shift_name, st.code AS shift_code,
      r.start_time, r.end_time, r.break_minutes, r.outlet_id, r.department_id, r.position_id,
      r.source, r.published_at,
      (SELECT COUNT(*) FROM roster_conflicts rc WHERE rc.company_id = r.company_id AND rc.roster_shift_id = r.id AND rc.status = 'open') AS open_conflict_count,
      (SELECT COUNT(*) FROM roster_conflicts rc WHERE rc.company_id = r.company_id AND rc.roster_shift_id = r.id AND rc.status = 'open' AND rc.severity = 'error') AS blocking_conflict_count
     FROM roster_shifts r
     LEFT JOIN shift_templates st ON st.company_id = r.company_id AND st.id = r.shift_template_id
     WHERE r.company_id = ?
       AND r.employee_id IN (${employeeIds.map(() => "?").join(", ")})
       AND COALESCE(r.roster_date, r.shift_date) BETWEEN ? AND ?
       AND r.status <> 'cancelled'
     ORDER BY r.employee_id, COALESCE(r.roster_date, r.shift_date), r.start_time`,
    [companyId, ...employeeIds, startDate, endDate],
  );
};

export const listPendingRosterMatrixChanges = (
  env: Env,
  companyId: string,
  employeeIds: string[],
  startDate: string,
  endDate: string,
) => {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return many<RosterMatrixPendingChangeRecord>(
    env,
    `SELECT id, employee_id, shift_id, requested_date, change_type, requested_value_json, status, approval_status
     FROM roster_change_requests
     WHERE company_id = ?
       AND employee_id IN (${employeeIds.map(() => "?").join(", ")})
       AND requested_date BETWEEN ? AND ?
       AND status IN ('DRAFT', 'PENDING', 'PENDING_DEPARTMENT_APPROVAL', 'PENDING_HR_APPROVAL', 'PENDING_MANUAL_REVIEW', 'APPROVED')
     ORDER BY created_at DESC`,
    [companyId, ...employeeIds, startDate, endDate],
  );
};

export const listOpenRosterMatrixConflicts = (
  env: Env,
  companyId: string,
  employeeIds: string[],
  startDate: string,
  endDate: string,
) => {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return many<{ employee_id: string | null; roster_shift_id: string | null; conflict_type: string; severity: string; message: string }>(
    env,
    `SELECT rc.employee_id, rc.roster_shift_id, rc.conflict_type, rc.severity, rc.message
     FROM roster_conflicts rc
     LEFT JOIN roster_shifts rs ON rs.company_id = rc.company_id AND rs.id = rc.roster_shift_id
     WHERE rc.company_id = ?
       AND rc.status = 'open'
       AND rc.employee_id IN (${employeeIds.map(() => "?").join(", ")})
       AND COALESCE(rs.roster_date, rs.shift_date, substr(rc.detected_at, 1, 10)) BETWEEN ? AND ?`,
    [companyId, ...employeeIds, startDate, endDate],
  );
};

export const listApprovedLeavesForRosterMatrix = (
  env: Env,
  companyId: string,
  employeeIds: string[],
  startDate: string,
  endDate: string,
) => {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return many<Record<string, any>>(
    env,
    `SELECT l.id, l.employee_id, l.start_date, l.end_date, l.status,
      lt.leave_name, lt.leave_key, lt.is_paid
     FROM leave_requests l
     LEFT JOIN leave_types lt ON lt.company_id = l.company_id AND lt.id = l.leave_type_id
     WHERE l.company_id = ?
       AND l.employee_id IN (${employeeIds.map(() => "?").join(", ")})
       AND l.start_date <= ? AND l.end_date >= ?
       AND l.status IN ('approved', 'APPROVED', 'APPLIED')
     ORDER BY l.start_date ASC`,
    [companyId, ...employeeIds, endDate, startDate],
  );
};

export const listHolidaysForRosterMatrix = (
  env: Env,
  companyId: string,
  outletId: string | null | undefined,
  startDate: string,
  endDate: string,
) =>
  many<Record<string, any>>(
    env,
    `SELECT h.id, COALESCE(h.name, h.holiday_name) AS holiday_name,
      COALESCE(h.date, h.start_date) AS start_date, COALESCE(h.end_date, h.date, h.start_date) AS end_date
     FROM holidays h
     WHERE h.company_id = ?
       AND COALESCE(h.is_enabled, 1) = 1
       AND COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
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
    [companyId, endDate, startDate, outletId ?? null, outletId ?? null, outletId ?? null],
  );

export const listAttendanceOverlaysForRosterMatrix = (
  env: Env,
  companyId: string,
  employeeIds: string[],
  startDate: string,
  endDate: string,
) => {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return many<RosterMatrixAttendanceOverlayRecord>(
    env,
    `SELECT s.employee_id, s.attendance_date,
      s.status,
      s.first_clock_in AS check_in,
      s.last_clock_out AS check_out,
      COALESCE(s.late_minutes, 0) AS late_minutes,
      COALESCE(s.worked_minutes, 0) AS worked_minutes,
      COALESCE((
        SELECT COUNT(*) FROM attendance_corrections ac
        WHERE ac.company_id = s.company_id
          AND ac.employee_id = s.employee_id
          AND COALESCE(ac.requested_date, date(ac.created_at)) = s.attendance_date
          AND upper(COALESCE(ac.status, '')) IN ('PENDING', 'SUBMITTED', 'PENDING_DEPARTMENT_REVIEW', 'PENDING_OWNER_REVIEW', 'PENDING_FINAL_APPROVAL')
      ), 0) AS pending_correction_count,
      COALESCE((
        SELECT COUNT(*) FROM attendance_corrections ac
        WHERE ac.company_id = s.company_id
          AND ac.employee_id = s.employee_id
          AND COALESCE(ac.requested_date, date(ac.created_at)) = s.attendance_date
          AND upper(COALESCE(ac.status, '')) IN ('APPROVED', 'APPLIED')
      ), 0) AS approved_correction_count
     FROM attendance_daily_summary s
     WHERE s.company_id = ?
       AND s.employee_id IN (${employeeIds.map(() => "?").join(", ")})
       AND s.attendance_date BETWEEN ? AND ?
     ORDER BY s.employee_id, s.attendance_date`,
    [companyId, ...employeeIds, startDate, endDate],
  );
};
