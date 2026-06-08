import type { HolidayFilters, HolidayRecord, HolidaySettings } from "./holidays.types";

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

const selectHoliday = `
  SELECT h.*,
    COALESCE(h.name, h.holiday_name) AS name,
    COALESCE(h.date, h.start_date) AS date,
    COALESCE(h.paid_holiday, h.is_paid, 1) AS paid_holiday,
    COALESCE(h.is_recurring, h.repeat_yearly, 0) AS is_recurring,
    COALESCE(h.affects_leave_duration, h.affects_leave, 1) AS affects_leave_duration,
    COALESCE(h.affects_attendance_absence, h.affects_attendance, 1) AS affects_attendance_absence,
    COALESCE(h.affects_long_leave_payroll, h.affects_payroll, 1) AS affects_long_leave_payroll,
    COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) AS status,
    o.name AS outlet_name,
    d.name AS department_name
  FROM holidays h
  LEFT JOIN outlets o ON o.company_id = h.company_id AND o.id = h.outlet_id
  LEFT JOIN departments d ON d.company_id = h.company_id AND d.id = h.department_id
`;

const rangeForFilters = (filters: HolidayFilters) => {
  if (filters.date) return { from: filters.date, to: filters.date };
  if (filters.from_date || filters.to_date) return {
    from: filters.from_date ?? filters.to_date!,
    to: filters.to_date ?? filters.from_date!,
  };
  if (filters.year && filters.month) {
    const month = String(filters.month).padStart(2, "0");
    const first = `${filters.year}-${month}-01`;
    const last = new Date(Date.UTC(filters.year, filters.month, 0)).toISOString().slice(0, 10);
    return { from: first, to: last };
  }
  if (filters.year) return { from: `${filters.year}-01-01`, to: `${filters.year}-12-31` };
  return null;
};

const addRangeClause = (clauses: string[], values: unknown[], from?: string, to?: string) => {
  if (!from || !to) return;
  clauses.push(`(
    (COALESCE(h.is_recurring, h.repeat_yearly, 0) = 0 AND COALESCE(h.date, h.start_date) <= ? AND COALESCE(h.end_date, h.start_date) >= ?)
    OR COALESCE(h.is_recurring, h.repeat_yearly, 0) = 1
  )`);
  values.push(to, from);
};

const buildWhere = (companyId: string, filters: HolidayFilters) => {
  const clauses = ["h.company_id = ?"];
  const values: unknown[] = [companyId];
  const range = rangeForFilters(filters);
  addRangeClause(clauses, values, range?.from, range?.to);
  if (filters.outlet_id) {
    clauses.push(`(
      COALESCE(h.applies_to_all_outlets, 1) = 1
      OR h.outlet_id = ?
      OR EXISTS (SELECT 1 FROM holiday_outlets ho WHERE ho.company_id = h.company_id AND ho.holiday_id = h.id AND ho.outlet_id = ?)
    )`);
    values.push(filters.outlet_id, filters.outlet_id);
  }
  if (filters.department_id) { clauses.push("(h.department_id IS NULL OR h.department_id = ?)"); values.push(filters.department_id); }
  if (filters.holiday_type) { clauses.push("h.holiday_type = ?"); values.push(filters.holiday_type); }
  if (filters.status) {
    clauses.push("COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = ?");
    values.push(filters.status);
  }
  if (filters.recurring !== undefined) {
    clauses.push("COALESCE(h.is_recurring, h.repeat_yearly, 0) = ?");
    values.push(filters.recurring ? 1 : 0);
  }
  if (filters.employee_type === "local") clauses.push("COALESCE(h.applies_to_local_employees, 1) = 1");
  if (filters.employee_type === "foreign") clauses.push("COALESCE(h.applies_to_foreign_employees, 1) = 1");
  return { sql: clauses.join(" AND "), values };
};

export const listHolidays = async (env: Env, companyId: string, filters: HolidayFilters) => {
  const where = buildWhere(companyId, filters);
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM holidays h WHERE ${where.sql}`, where.values);
  const rows = await many<HolidayRecord>(
    env,
    `${selectHoliday}
     WHERE ${where.sql}
     ORDER BY COALESCE(h.date, h.start_date) ASC, COALESCE(h.name, h.holiday_name) ASC
     LIMIT ? OFFSET ?`,
    [...where.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
  return { rows, total: total?.total ?? 0 };
};

export const listHolidaysForRange = (env: Env, companyId: string, fromDate: string, toDate: string, filters: Partial<HolidayFilters> = {}) => {
  const built = buildWhere(companyId, {
    page: 1,
    page_size: 100,
    from_date: fromDate,
    to_date: toDate,
    ...filters,
  });
  return many<HolidayRecord>(
    env,
    `${selectHoliday}
     WHERE ${built.sql}
       AND COALESCE(h.status, CASE WHEN h.is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND COALESCE(h.is_enabled, 1) = 1
     ORDER BY COALESCE(h.date, h.start_date) ASC`,
    built.values,
  );
};

export const findHoliday = (env: Env, companyId: string, id: string) =>
  one<HolidayRecord>(env, `${selectHoliday} WHERE h.company_id = ? AND h.id = ? LIMIT 1`, [companyId, id]);

export const findByCode = (env: Env, companyId: string, code: string, excludeId?: string) =>
  one<{ id: string }>(
    env,
    "SELECT id FROM holidays WHERE company_id = ? AND code = ? AND (? IS NULL OR id <> ?) LIMIT 1",
    [companyId, code, excludeId ?? null, excludeId ?? null],
  );

export const findDuplicateActiveHoliday = (
  env: Env,
  companyId: string,
  name: string,
  date: string,
  outletId?: string | null,
  excludeId?: string,
) =>
  one<{ id: string }>(
    env,
    `SELECT id FROM holidays
     WHERE company_id = ?
       AND LOWER(COALESCE(name, holiday_name)) = LOWER(?)
       AND COALESCE(date, start_date) = ?
       AND COALESCE(outlet_id, '') = COALESCE(?, '')
       AND COALESCE(status, CASE WHEN is_enabled = 1 THEN 'active' ELSE 'inactive' END) = 'active'
       AND (? IS NULL OR id <> ?)
     LIMIT 1`,
    [companyId, name, date, outletId ?? null, excludeId ?? null, excludeId ?? null],
  );

export const createHoliday = (env: Env, record: HolidayRecord) =>
  run(
    env,
    `INSERT INTO holidays (
      id, company_id, holiday_name, name, code, holiday_type, start_date, date, end_date,
      is_paid, paid_holiday, is_enabled, status, repeat_yearly, is_recurring,
      recurrence_rule, recurrence_month, recurrence_day, outlet_id, department_id,
      applies_to_all_outlets, applies_to_local_employees, applies_to_foreign_employees,
      counts_as_working_day, affects_leave, affects_leave_duration, affects_attendance,
      affects_attendance_absence, affects_payroll, affects_long_leave_payroll,
      affects_roster, affects_overtime, requires_work_pay_rate_multiplier, source,
      notes, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.company_id,
      record.name,
      record.name,
      record.code ?? null,
      record.holiday_type,
      record.date,
      record.date,
      record.end_date ?? null,
      record.paid_holiday,
      record.paid_holiday,
      record.status === "active" ? 1 : 0,
      record.status,
      record.is_recurring,
      record.is_recurring,
      record.recurrence_rule ?? null,
      record.recurrence_month ?? null,
      record.recurrence_day ?? null,
      record.outlet_id ?? null,
      record.department_id ?? null,
      record.applies_to_all_outlets,
      record.applies_to_local_employees,
      record.applies_to_foreign_employees,
      record.counts_as_working_day,
      record.affects_leave_duration,
      record.affects_leave_duration,
      record.affects_attendance_absence,
      record.affects_attendance_absence,
      record.affects_long_leave_payroll,
      record.affects_long_leave_payroll,
      1,
      record.affects_overtime,
      record.requires_work_pay_rate_multiplier ?? null,
      record.source,
      record.notes ?? null,
      record.created_by ?? null,
      record.updated_by ?? null,
      record.created_at,
      record.updated_at,
    ],
  );

export const updateHoliday = (env: Env, companyId: string, id: string, values: Partial<HolidayRecord>) => {
  const keys: Array<keyof HolidayRecord> = [
    "name", "code", "holiday_type", "date", "end_date", "is_recurring", "recurrence_rule",
    "recurrence_month", "recurrence_day", "outlet_id", "department_id", "applies_to_all_outlets",
    "applies_to_local_employees", "applies_to_foreign_employees", "paid_holiday",
    "counts_as_working_day", "affects_leave_duration", "affects_attendance_absence",
    "affects_overtime", "affects_long_leave_payroll", "requires_work_pay_rate_multiplier",
    "status", "notes", "updated_by",
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of keys) {
    if (values[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(values[key] ?? null);
      if (key === "name") { sets.push("holiday_name = ?"); params.push(values[key] ?? null); }
      if (key === "date") { sets.push("start_date = ?"); params.push(values[key] ?? null); }
      if (key === "paid_holiday") { sets.push("is_paid = ?"); params.push(values[key] ?? null); }
      if (key === "is_recurring") { sets.push("repeat_yearly = ?"); params.push(values[key] ?? null); }
      if (key === "affects_leave_duration") { sets.push("affects_leave = ?"); params.push(values[key] ?? null); }
      if (key === "affects_attendance_absence") { sets.push("affects_attendance = ?"); params.push(values[key] ?? null); }
      if (key === "affects_long_leave_payroll") { sets.push("affects_payroll = ?"); params.push(values[key] ?? null); }
      if (key === "status") { sets.push("is_enabled = ?"); params.push(values[key] === "active" ? 1 : 0); }
    }
  }
  sets.push("updated_at = ?");
  params.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE holidays SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, params);
};

export const archiveHoliday = (env: Env, companyId: string, id: string, actorUserId: string, reason: string) =>
  run(
    env,
    `UPDATE holidays
     SET status = 'archived', is_enabled = 0, archived_by = ?, archived_at = ?, archive_reason = ?, updated_by = ?, updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [actorUserId, new Date().toISOString(), reason, actorUserId, new Date().toISOString(), companyId, id],
  );

export const restoreHoliday = (env: Env, companyId: string, id: string, actorUserId: string) =>
  run(
    env,
    "UPDATE holidays SET status = 'active', is_enabled = 1, archived_by = NULL, archived_at = NULL, archive_reason = NULL, updated_by = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [actorUserId, new Date().toISOString(), companyId, id],
  );

export const replaceHolidayOutlet = async (env: Env, companyId: string, holidayId: string, outletId?: string | null) => {
  await run(env, "DELETE FROM holiday_outlets WHERE company_id = ? AND holiday_id = ?", [companyId, holidayId]);
  if (outletId) {
    await run(
      env,
      "INSERT OR IGNORE INTO holiday_outlets (id, company_id, holiday_id, outlet_id, created_at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), companyId, holidayId, outletId, new Date().toISOString()],
    );
  }
};

export const getSettings = (env: Env, companyId: string) =>
  one<HolidaySettings>(
    env,
    `SELECT *,
       exclude_holidays_from_paid_leave AS holidays_exclude_from_paid_leave,
       exclude_holidays_from_unpaid_leave AS holidays_exclude_from_unpaid_leave
     FROM holiday_settings WHERE company_id = ? LIMIT 1`,
    [companyId],
  );

export const insertSettings = (env: Env, companyId: string, settings: HolidaySettings) =>
  run(
    env,
    `INSERT INTO holiday_settings (
      id, company_id, holiday_module_enabled, public_holidays_enabled, company_holidays_enabled,
      other_holidays_enabled, outlet_specific_holidays_enabled, holiday_pay_enabled,
      holiday_leave_rules_enabled, holiday_attendance_rules_enabled, holiday_roster_rules_enabled,
      exclude_holidays_from_leave, pay_holidays_during_long_leave, optional_holidays_enabled,
      exclude_holidays_from_paid_leave, exclude_holidays_from_unpaid_leave,
      holidays_count_as_attendance_excused, holiday_work_overtime_enabled,
      replacement_holidays_enabled, holiday_import_enabled, holiday_approval_required,
      require_reason_for_holiday_changes, default_holiday_pay_multiplier,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(), companyId, settings.holiday_module_enabled, settings.public_holidays_enabled,
      settings.company_holidays_enabled, settings.other_holidays_enabled, settings.outlet_specific_holidays_enabled,
      settings.holiday_leave_rules_enabled, settings.holiday_attendance_rules_enabled, settings.holiday_roster_rules_enabled,
      settings.exclude_holidays_from_leave, settings.pay_holidays_during_long_leave, settings.optional_holidays_enabled,
      settings.holidays_exclude_from_paid_leave, settings.holidays_exclude_from_unpaid_leave,
      settings.holidays_count_as_attendance_excused, settings.holiday_work_overtime_enabled,
      settings.replacement_holidays_enabled, settings.holiday_import_enabled, settings.holiday_approval_required,
      settings.require_reason_for_holiday_changes, settings.default_holiday_pay_multiplier,
      new Date().toISOString(), new Date().toISOString(),
    ],
  );

export const updateSettings = (env: Env, companyId: string, settings: HolidaySettings) =>
  run(
    env,
    `UPDATE holiday_settings SET
      holiday_module_enabled = ?, public_holidays_enabled = ?, company_holidays_enabled = ?,
      outlet_specific_holidays_enabled = ?, optional_holidays_enabled = ?, other_holidays_enabled = ?,
      holiday_leave_rules_enabled = ?, holiday_attendance_rules_enabled = ?, holiday_roster_rules_enabled = ?,
      exclude_holidays_from_leave = ?, exclude_holidays_from_paid_leave = ?,
      exclude_holidays_from_unpaid_leave = ?, pay_holidays_during_long_leave = ?,
      holidays_count_as_attendance_excused = ?, holiday_work_overtime_enabled = ?,
      replacement_holidays_enabled = ?, holiday_import_enabled = ?, holiday_approval_required = ?,
      require_reason_for_holiday_changes = ?, default_holiday_pay_multiplier = ?, updated_at = ?
     WHERE company_id = ?`,
    [
      settings.holiday_module_enabled, settings.public_holidays_enabled, settings.company_holidays_enabled,
      settings.outlet_specific_holidays_enabled, settings.optional_holidays_enabled, settings.other_holidays_enabled,
      settings.holiday_leave_rules_enabled, settings.holiday_attendance_rules_enabled, settings.holiday_roster_rules_enabled,
      settings.exclude_holidays_from_leave, settings.holidays_exclude_from_paid_leave,
      settings.holidays_exclude_from_unpaid_leave, settings.pay_holidays_during_long_leave,
      settings.holidays_count_as_attendance_excused, settings.holiday_work_overtime_enabled,
      settings.replacement_holidays_enabled, settings.holiday_import_enabled, settings.holiday_approval_required,
      settings.require_reason_for_holiday_changes, settings.default_holiday_pay_multiplier,
      new Date().toISOString(), companyId,
    ],
  );

export const findEmployee = (env: Env, companyId: string, employeeId: string) =>
  one<{ id: string; employee_type: string | null; primary_outlet_id: string | null; department_id: string | null }>(
    env,
    "SELECT id, employee_type, primary_outlet_id, department_id FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, employeeId],
  );
