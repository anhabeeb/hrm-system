import type { KioskEmployeeFilters } from "./kiosk.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

export const findDevice = (env: Env, companyId: string, deviceId: string) =>
  one<{
    id: string;
    outlet_id: string | null;
    device_type: string;
    status: string;
    last_seen_at: string | null;
    last_sync_at: string | null;
  }>(
    env,
    "SELECT id, outlet_id, device_type, status, last_seen_at, last_sync_at FROM devices WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, deviceId],
  );

export const listKioskEmployees = (
  env: Env,
  companyId: string,
  outletId: string,
  filters: KioskEmployeeFilters,
) => {
  const clauses = [
    "e.company_id = ?",
    "e.primary_outlet_id = ?",
    "e.deleted_at IS NULL",
    "e.employment_status NOT IN ('archived', 'resigned', 'terminated')",
  ];
  const values: unknown[] = [companyId, outletId];
  if (filters.search) {
    clauses.push("(lower(e.employee_code) LIKE lower(?) OR lower(e.full_name) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  return many(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.primary_outlet_id,
      e.employment_status, d.name AS department_name, p.title AS position_title
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.full_name
     LIMIT ? OFFSET ?`,
    [...values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countKioskEmployees = async (
  env: Env,
  companyId: string,
  outletId: string,
  filters: KioskEmployeeFilters,
) => {
  const clauses = [
    "company_id = ?",
    "primary_outlet_id = ?",
    "deleted_at IS NULL",
    "employment_status NOT IN ('archived', 'resigned', 'terminated')",
  ];
  const values: unknown[] = [companyId, outletId];
  if (filters.search) {
    clauses.push("(lower(employee_code) LIKE lower(?) OR lower(full_name) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM employees WHERE ${clauses.join(" AND ")}`,
    values,
  );
  return row?.total ?? 0;
};

export const kioskToday = (env: Env, companyId: string, outletId: string) =>
  many(
    env,
    `SELECT s.attendance_date, s.employee_id, e.employee_code, e.full_name AS employee_name,
      s.first_clock_in, s.last_clock_out, s.status
     FROM attendance_daily_summary s
     JOIN employees e ON e.id = s.employee_id
     WHERE s.company_id = ? AND s.outlet_id = ? AND s.attendance_date = ?
     ORDER BY e.full_name`,
    [companyId, outletId, new Date().toISOString().slice(0, 10)],
  );

export const deviceSummary = async (env: Env, companyId: string, outletId: string) => {
  const today = new Date().toISOString().slice(0, 10);
  const row = await one<{
    total_employees_available: number;
    checked_in_today: number;
    checked_out_today: number;
    missing_clock_out_count: number;
  }>(
    env,
    `SELECT
      (SELECT COUNT(*) FROM employees WHERE company_id = ? AND primary_outlet_id = ? AND deleted_at IS NULL AND employment_status NOT IN ('archived', 'resigned', 'terminated')) AS total_employees_available,
      (SELECT COUNT(*) FROM attendance_daily_summary WHERE company_id = ? AND outlet_id = ? AND attendance_date = ? AND first_clock_in IS NOT NULL) AS checked_in_today,
      (SELECT COUNT(*) FROM attendance_daily_summary WHERE company_id = ? AND outlet_id = ? AND attendance_date = ? AND last_clock_out IS NOT NULL) AS checked_out_today,
      (SELECT COUNT(*) FROM attendance_daily_summary WHERE company_id = ? AND outlet_id = ? AND attendance_date = ? AND status IN ('checked_in', 'missing_clock_out')) AS missing_clock_out_count`,
    [companyId, outletId, companyId, outletId, today, companyId, outletId, today, companyId, outletId, today],
  );
  const conflicts = await one<{ total: number }>(
    env,
    "SELECT COUNT(*) AS total FROM attendance_conflicts WHERE company_id = ? AND outlet_id = ? AND status = 'pending'",
    [companyId, outletId],
  );
  return {
    ...(row ?? {
      total_employees_available: 0,
      checked_in_today: 0,
      checked_out_today: 0,
      missing_clock_out_count: 0,
    }),
    conflicts_pending_count: conflicts?.total ?? 0,
  };
};
