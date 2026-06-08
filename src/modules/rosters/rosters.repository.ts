import type {
  RosterConflictFilters,
  RosterConflictRecord,
  RosterEmployeeRecord,
  RosterListFilters,
  RosterShiftRecord,
  ShiftTemplateFilters,
  ShiftTemplateInput,
  ShiftTemplateRecord,
} from "./rosters.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<RosterEmployeeRecord>(
    env,
    `SELECT id, company_id, employee_code, full_name, employee_type, employment_status, primary_outlet_id,
      department_id, position_id, joined_at, resigned_at, terminated_at, deleted_at
     FROM employees
     WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const findShiftTemplate = (env: Env, companyId: string, id: string) =>
  one<ShiftTemplateRecord>(
    env,
    `SELECT * FROM shift_templates WHERE company_id = ? AND id = ? LIMIT 1`,
    [companyId, id],
  );

export const findShiftTemplateByCode = (env: Env, companyId: string, code: string, excludeId?: string) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM shift_templates
     WHERE company_id = ? AND code = ? AND (? IS NULL OR id <> ?) LIMIT 1`,
    [companyId, code, excludeId ?? null, excludeId ?? null],
  );

export const listShiftTemplates = async (
  env: Env,
  companyId: string,
  filters: ShiftTemplateFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.outlet_id) {
    clauses.push("(outlet_id = ? OR outlet_id IS NULL)");
    values.push(filters.outlet_id);
  } else if (!isSuperAdmin) {
    if (outletIds.length === 0) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`(outlet_id IS NULL OR outlet_id IN (${outletIds.map(() => "?").join(", ")}))`);
      values.push(...outletIds);
    }
  }
  if (filters.department_id) {
    clauses.push("(department_id = ? OR department_id IS NULL)");
    values.push(filters.department_id);
  }
  if (filters.status && filters.status !== "all") {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  if (filters.search) {
    clauses.push("(LOWER(name) LIKE ? OR LOWER(COALESCE(code, '')) LIKE ?)");
    values.push(`%${filters.search.toLowerCase()}%`, `%${filters.search.toLowerCase()}%`);
  }
  const where = clauses.join(" AND ");
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM shift_templates WHERE ${where}`, values);
  const rows = await many<ShiftTemplateRecord>(
    env,
    `SELECT * FROM shift_templates WHERE ${where}
     ORDER BY active DESC, name ASC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: total?.total ?? 0 };
};

export const createShiftTemplate = (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  payload: ShiftTemplateInput & { crosses_midnight: boolean; break_minutes: number };
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO shift_templates (
      id, company_id, outlet_id, department_id, name, code, start_time, end_time,
      break_minutes, crosses_midnight, active, status, notes, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.payload.outlet_id ?? null,
      input.payload.department_id ?? null,
      input.payload.name,
      input.payload.code ?? null,
      input.payload.start_time,
      input.payload.end_time,
      input.payload.break_minutes,
      input.payload.crosses_midnight ? 1 : 0,
      input.payload.notes ?? null,
      input.actorUserId,
      now,
      input.actorUserId,
      now,
    ],
  );
};

export const updateShiftTemplate = (env: Env, companyId: string, id: string, input: Record<string, unknown>, actorUserId: string) => {
  const allowed = ["outlet_id", "department_id", "name", "code", "start_time", "end_time", "break_minutes", "crosses_midnight", "notes"] as const;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(key === "crosses_midnight" ? (input[key] ? 1 : 0) : input[key] ?? null);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_by = ?", "updated_at = ?");
  values.push(actorUserId, new Date().toISOString(), companyId, id);
  return run(env, `UPDATE shift_templates SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const setShiftTemplateStatus = (env: Env, companyId: string, id: string, active: boolean, actorUserId: string) =>
  run(
    env,
    `UPDATE shift_templates
     SET active = ?, status = ?, updated_by = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [active ? 1 : 0, active ? "active" : "inactive", actorUserId, new Date().toISOString(), companyId, id],
  );

const rosterSelect = `
  SELECT r.*,
    COALESCE(r.roster_date, r.shift_date) AS roster_date,
    e.employee_code,
    e.full_name AS employee_name,
    o.name AS outlet_name,
    d.name AS department_name,
    p.title AS position_title,
    st.name AS shift_template_name,
    st.code AS shift_template_code,
    (
      SELECT COUNT(*) FROM roster_conflicts rc
      WHERE rc.company_id = r.company_id AND rc.roster_shift_id = r.id AND rc.status = 'open'
    ) AS open_conflict_count,
    (
      SELECT COUNT(*) FROM roster_conflicts rc
      WHERE rc.company_id = r.company_id AND rc.roster_shift_id = r.id AND rc.status = 'open' AND rc.severity = 'error'
    ) AS blocking_conflict_count
  FROM roster_shifts r
  JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id
  LEFT JOIN outlets o ON o.company_id = r.company_id AND o.id = r.outlet_id
  LEFT JOIN departments d ON d.company_id = r.company_id AND d.id = r.department_id
  LEFT JOIN positions p ON p.company_id = r.company_id AND p.id = r.position_id
  LEFT JOIN shift_templates st ON st.company_id = r.company_id AND st.id = r.shift_template_id
`;

const applyRosterFilters = (
  clauses: string[],
  values: unknown[],
  filters: Partial<RosterListFilters>,
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  if (filters.outlet_id) {
    clauses.push("r.outlet_id = ?");
    values.push(filters.outlet_id);
  } else if (!isSuperAdmin) {
    if (outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`r.outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
      values.push(...outletIds);
    }
  }
  if (filters.department_id) {
    clauses.push("r.department_id = ?");
    values.push(filters.department_id);
  }
  if (filters.position_id) {
    clauses.push("r.position_id = ?");
    values.push(filters.position_id);
  }
  if (filters.employee_id) {
    clauses.push("r.employee_id = ?");
    values.push(filters.employee_id);
  }
  if (filters.date_from) {
    clauses.push("COALESCE(r.roster_date, r.shift_date) >= ?");
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("COALESCE(r.roster_date, r.shift_date) <= ?");
    values.push(filters.date_to);
  }
  if (filters.status) {
    clauses.push("r.status = ?");
    values.push(filters.status);
  }
  if (filters.conflict_status) {
    clauses.push(`EXISTS (
      SELECT 1 FROM roster_conflicts rc
      WHERE rc.company_id = r.company_id AND rc.roster_shift_id = r.id AND rc.status = ?
    )`);
    values.push(filters.conflict_status);
  }
};

export const listRosterShifts = async (
  env: Env,
  companyId: string,
  filters: RosterListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  const clauses = ["r.company_id = ?"];
  const values: unknown[] = [companyId];
  applyRosterFilters(clauses, values, filters, outletIds, isSuperAdmin);
  const where = clauses.join(" AND ");
  const count = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM roster_shifts r JOIN employees e ON e.company_id = r.company_id AND e.id = r.employee_id WHERE ${where}`,
    values,
  );
  const rows = await many<RosterShiftRecord>(
    env,
    `${rosterSelect}
     WHERE ${where}
     ORDER BY COALESCE(r.roster_date, r.shift_date) DESC, r.start_time ASC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: count?.total ?? 0 };
};

export const findRosterShift = (env: Env, companyId: string, id: string) =>
  one<RosterShiftRecord>(env, `${rosterSelect} WHERE r.company_id = ? AND r.id = ? LIMIT 1`, [companyId, id]);

interface RosterWindowInput {
  roster_date: string;
  start_time: string;
  end_time: string;
}

const dayStartMinutes = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 60000);

const timeMinutes = (time: string) => {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
};

export const rosterShiftCrossesMidnight = (startTime: string, endTime: string) =>
  timeMinutes(endTime) <= timeMinutes(startTime);

export const rosterShiftWindow = (input: RosterWindowInput) => {
  const base = dayStartMinutes(input.roster_date);
  const start = base + timeMinutes(input.start_time);
  let end = base + timeMinutes(input.end_time);
  if (end <= start) end += 1440;
  return { start, end, crosses_midnight: end - base > 1440 };
};

export const rosterWindowsOverlap = (
  left: ReturnType<typeof rosterShiftWindow>,
  right: ReturnType<typeof rosterShiftWindow>,
) => left.start < right.end && right.start < left.end;

export const findOverlappingShift = async (
  env: Env,
  companyId: string,
  employeeId: string,
  rosterDate: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
) => {
  const candidates = await many<{ id: string; roster_date: string; start_time: string; end_time: string; crosses_midnight: number }>(
    env,
    `SELECT id, COALESCE(roster_date, shift_date) AS roster_date, start_time, end_time,
        CASE WHEN end_time <= start_time THEN 1 ELSE 0 END AS crosses_midnight
     FROM roster_shifts
     WHERE company_id = ? AND employee_id = ?
       AND COALESCE(roster_date, shift_date) BETWEEN date(?, '-1 day') AND date(?, '+1 day')
       AND status <> 'cancelled'
       AND (? IS NULL OR id <> ?)
     ORDER BY COALESCE(roster_date, shift_date), start_time`,
    [companyId, employeeId, rosterDate, rosterDate, excludeId ?? null, excludeId ?? null],
  );
  const target = rosterShiftWindow({ roster_date: rosterDate, start_time: startTime, end_time: endTime });
  return candidates.find((candidate) => rosterWindowsOverlap(
    target,
    rosterShiftWindow({
      roster_date: candidate.roster_date,
      start_time: candidate.start_time,
      end_time: candidate.end_time,
    }),
  )) ?? null;
};

export const createRosterShift = (env: Env, input: {
  id: string;
  companyId: string;
  actorUserId: string;
  payload: {
    outlet_id: string;
    department_id?: string | null;
    position_id?: string | null;
    employee_id: string;
    shift_template_id?: string | null;
    roster_date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    notes?: string | null;
    source: string;
  };
}) => {
  const now = new Date().toISOString();
  return run(
    env,
    `INSERT INTO roster_shifts (
      id, company_id, outlet_id, department_id, position_id, employee_id,
      shift_template_id, shift_date, roster_date, start_time, end_time, break_minutes,
      status, notes, source, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.companyId,
      input.payload.outlet_id,
      input.payload.department_id ?? null,
      input.payload.position_id ?? null,
      input.payload.employee_id,
      input.payload.shift_template_id ?? null,
      input.payload.roster_date,
      input.payload.roster_date,
      input.payload.start_time,
      input.payload.end_time,
      input.payload.break_minutes,
      input.payload.notes ?? null,
      input.payload.source,
      input.actorUserId,
      now,
      input.actorUserId,
      now,
    ],
  );
};

export const updateRosterShift = (env: Env, companyId: string, id: string, input: Record<string, unknown>, actorUserId: string) => {
  const allowed = ["outlet_id", "department_id", "position_id", "employee_id", "shift_template_id", "roster_date", "start_time", "end_time", "break_minutes", "status", "notes"] as const;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(input[key] ?? null);
      if (key === "roster_date") {
        sets.push("shift_date = ?");
        values.push(input[key]);
      }
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_by = ?", "updated_at = ?");
  values.push(actorUserId, new Date().toISOString(), companyId, id);
  return run(env, `UPDATE roster_shifts SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const cancelRosterShift = (env: Env, companyId: string, id: string, actorUserId: string, reason: string) =>
  run(
    env,
    `UPDATE roster_shifts
     SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancellation_reason = ?,
         updated_by = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [actorUserId, new Date().toISOString(), reason, actorUserId, new Date().toISOString(), companyId, id],
  );

export const clearOpenConflictsForShift = (env: Env, companyId: string, rosterShiftId: string) =>
  run(
    env,
    `UPDATE roster_conflicts SET status = 'resolved', updated_at = ?, resolution_note = 'Rechecked after roster update'
     WHERE company_id = ? AND roster_shift_id = ? AND status = 'open'`,
    [new Date().toISOString(), companyId, rosterShiftId],
  );

export const createConflictStatements = (env: Env, conflicts: Array<{
  id: string;
  companyId: string;
  rosterShiftId?: string | null;
  employeeId?: string | null;
  outletId?: string | null;
  departmentId?: string | null;
  conflictType: string;
  severity: string;
  message: string;
}>) => {
  const now = new Date().toISOString();
  return conflicts.map((conflict) =>
    env.DB.prepare(
      `INSERT INTO roster_conflicts (
        id, company_id, roster_shift_id, employee_id, outlet_id, department_id,
        conflict_type, severity, message, status, detected_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    ).bind(
      conflict.id,
      conflict.companyId,
      conflict.rosterShiftId ?? null,
      conflict.employeeId ?? null,
      conflict.outletId ?? null,
      conflict.departmentId ?? null,
      conflict.conflictType,
      conflict.severity,
      conflict.message,
      now,
      now,
      now,
    )
  );
};

export const insertConflicts = async (env: Env, conflicts: ReturnType<typeof createConflictStatements>) => {
  if (conflicts.length > 0) await env.DB.batch(conflicts);
};

export const createRosterShiftBatch = async (
  env: Env,
  statements: D1PreparedStatement[],
) => {
  if (statements.length > 0) await env.DB.batch(statements);
};

export const buildCreateRosterStatement = (env: Env, input: Parameters<typeof createRosterShift>[1]) => {
  const now = new Date().toISOString();
  return env.DB.prepare(
    `INSERT INTO roster_shifts (
      id, company_id, outlet_id, department_id, position_id, employee_id,
      shift_template_id, shift_date, roster_date, start_time, end_time, break_minutes,
      status, notes, source, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.id,
    input.companyId,
    input.payload.outlet_id,
    input.payload.department_id ?? null,
    input.payload.position_id ?? null,
    input.payload.employee_id,
    input.payload.shift_template_id ?? null,
    input.payload.roster_date,
    input.payload.roster_date,
    input.payload.start_time,
    input.payload.end_time,
    input.payload.break_minutes,
    input.payload.notes ?? null,
    input.payload.source,
    input.actorUserId,
    now,
    input.actorUserId,
    now,
  );
};

export const hasApprovedLeaveOnDate = (env: Env, companyId: string, employeeId: string, date: string, statuses: readonly string[]) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM leave_requests
     WHERE company_id = ? AND employee_id = ? AND start_date <= ? AND end_date >= ?
       AND status IN (${statuses.map(() => "?").join(", ")})
     LIMIT 1`,
    [companyId, employeeId, date, date, ...statuses],
  );

export const findHolidayOnDate = (env: Env, companyId: string, outletId: string, date: string) =>
  one<{ id: string; holiday_name: string }>(
    env,
    `SELECT h.id, COALESCE(h.name, h.holiday_name) AS holiday_name FROM holidays h
     WHERE h.company_id = ? AND COALESCE(h.is_enabled, 1) = 1
       AND COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND COALESCE(h.affects_roster, 1) = 1
       AND h.start_date <= ? AND COALESCE(h.end_date, h.start_date) >= ?
       AND (
         COALESCE(h.applies_to_all_outlets, 1) = 1
         OR h.outlet_id = ?
         OR NOT EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id)
         OR EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id AND ho.outlet_id = ?)
       )
     LIMIT 1`,
    [companyId, date, date, outletId, outletId],
  );

export const hasActiveContractOnDate = (env: Env, companyId: string, employeeId: string, date: string) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM employee_contracts
     WHERE company_id = ? AND employee_id = ?
       AND contract_status NOT IN ('archived', 'cancelled')
       AND start_date <= ? AND COALESCE(end_date, '9999-12-31') >= ?
     LIMIT 1`,
    [companyId, employeeId, date, date],
  );

export const hasContractRecords = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM employee_contracts WHERE company_id = ? AND employee_id = ? LIMIT 1`,
    [companyId, employeeId],
  );

export const findDuplicateRosterShift = (
  env: Env,
  companyId: string,
  employeeId: string,
  rosterDate: string,
  shiftTemplateId: string,
) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM roster_shifts
     WHERE company_id = ? AND employee_id = ? AND COALESCE(roster_date, shift_date) = ?
       AND shift_template_id = ? AND status <> 'cancelled'
     LIMIT 1`,
    [companyId, employeeId, rosterDate, shiftTemplateId],
  );

export const publishRosterRange = (env: Env, input: {
  companyId: string;
  outletId: string;
  departmentId?: string | null;
  dateFrom: string;
  dateTo: string;
  actorUserId: string;
}) => {
  const values: unknown[] = [input.actorUserId, new Date().toISOString(), input.actorUserId, new Date().toISOString(), input.companyId, input.outletId, input.dateFrom, input.dateTo];
  const departmentClause = input.departmentId ? "AND department_id = ?" : "";
  if (input.departmentId) values.push(input.departmentId);
  return run(
    env,
    `UPDATE roster_shifts
     SET status = 'published', published_by = ?, published_at = ?, updated_by = ?, updated_at = ?
     WHERE company_id = ? AND outlet_id = ? AND COALESCE(roster_date, shift_date) BETWEEN ? AND ?
       AND status = 'draft' ${departmentClause}`,
    values,
  );
};

export const countOpenBlockingConflictsInRange = (env: Env, input: {
  companyId: string;
  outletId: string;
  departmentId?: string | null;
  dateFrom: string;
  dateTo: string;
}) => {
  const values: unknown[] = [input.companyId, input.outletId, input.dateFrom, input.dateTo];
  const departmentClause = input.departmentId ? "AND r.department_id = ?" : "";
  if (input.departmentId) values.push(input.departmentId);
  return one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM roster_conflicts rc
     JOIN roster_shifts r ON r.company_id = rc.company_id AND r.id = rc.roster_shift_id
     WHERE rc.company_id = ? AND r.outlet_id = ? AND COALESCE(r.roster_date, r.shift_date) BETWEEN ? AND ?
       AND rc.status = 'open' AND rc.severity = 'error' ${departmentClause}`,
    values,
  );
};

export const findLockedAttendanceSummaryInRange = (env: Env, input: {
  companyId: string;
  outletId: string;
  departmentId?: string | null;
  dateFrom: string;
  dateTo: string;
}) => {
  const values: unknown[] = [input.companyId, input.outletId, input.dateFrom, input.dateTo];
  const departmentClause = input.departmentId ? "AND e.department_id = ?" : "";
  if (input.departmentId) values.push(input.departmentId);
  return one<{ id: string }>(
    env,
    `SELECT ads.id
     FROM attendance_daily_summary ads
     JOIN employees e ON e.company_id = ads.company_id AND e.id = ads.employee_id
     WHERE ads.company_id = ? AND ads.outlet_id = ?
       AND ads.attendance_date BETWEEN ? AND ?
       AND ads.payroll_status IN ('locked', 'finalized', 'paid')
       ${departmentClause}
     LIMIT 1`,
    values,
  );
};

export const listConflicts = async (
  env: Env,
  companyId: string,
  filters: RosterConflictFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  const clauses = ["rc.company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.outlet_id) {
    clauses.push("rc.outlet_id = ?");
    values.push(filters.outlet_id);
  } else if (!isSuperAdmin) {
    if (outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`rc.outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
      values.push(...outletIds);
    }
  }
  if (filters.department_id) {
    clauses.push("rc.department_id = ?");
    values.push(filters.department_id);
  }
  if (filters.employee_id) {
    clauses.push("rc.employee_id = ?");
    values.push(filters.employee_id);
  }
  if (filters.severity) {
    clauses.push("rc.severity = ?");
    values.push(filters.severity);
  }
  if (filters.status) {
    clauses.push("rc.status = ?");
    values.push(filters.status);
  }
  if (filters.conflict_type) {
    clauses.push("rc.conflict_type = ?");
    values.push(filters.conflict_type);
  }
  if (filters.date_from) {
    clauses.push("COALESCE(r.roster_date, r.shift_date) >= ?");
    values.push(filters.date_from);
  }
  if (filters.date_to) {
    clauses.push("COALESCE(r.roster_date, r.shift_date) <= ?");
    values.push(filters.date_to);
  }
  const where = clauses.join(" AND ");
  const total = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total
     FROM roster_conflicts rc
     LEFT JOIN roster_shifts r ON r.company_id = rc.company_id AND r.id = rc.roster_shift_id
     WHERE ${where}`,
    values,
  );
  const rows = await many<RosterConflictRecord>(
    env,
    `SELECT rc.*, e.full_name AS employee_name, o.name AS outlet_name
     FROM roster_conflicts rc
     LEFT JOIN roster_shifts r ON r.company_id = rc.company_id AND r.id = rc.roster_shift_id
     LEFT JOIN employees e ON e.company_id = rc.company_id AND e.id = rc.employee_id
     LEFT JOIN outlets o ON o.company_id = rc.company_id AND o.id = rc.outlet_id
     WHERE ${where}
     ORDER BY rc.detected_at DESC
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: total?.total ?? 0 };
};

export const findConflictById = (env: Env, companyId: string, id: string) =>
  one<RosterConflictRecord>(
    env,
    `SELECT rc.*, e.full_name AS employee_name, o.name AS outlet_name
     FROM roster_conflicts rc
     LEFT JOIN employees e ON e.company_id = rc.company_id AND e.id = rc.employee_id
     LEFT JOIN outlets o ON o.company_id = rc.company_id AND o.id = rc.outlet_id
     WHERE rc.company_id = ? AND rc.id = ?
     LIMIT 1`,
    [companyId, id],
  );

export const updateConflictStatus = (env: Env, input: {
  companyId: string;
  id: string;
  status: "resolved" | "overridden";
  actorUserId: string;
  resolutionNote: string;
}) =>
  run(
    env,
    `UPDATE roster_conflicts
     SET status = ?, resolved_by = ?, resolved_at = ?, resolution_note = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.status,
      input.actorUserId,
      new Date().toISOString(),
      input.resolutionNote,
      new Date().toISOString(),
      input.companyId,
      input.id,
    ],
  );

export const getExpectedRosterForEmployeeDate = (env: Env, companyId: string, employeeId: string, date: string) =>
  many<RosterShiftRecord>(
    env,
    `${rosterSelect}
     WHERE r.company_id = ? AND r.employee_id = ? AND COALESCE(r.roster_date, r.shift_date) = ?
       AND r.status IN ('draft', 'published')
     ORDER BY r.start_time ASC`,
    [companyId, employeeId, date],
  );
