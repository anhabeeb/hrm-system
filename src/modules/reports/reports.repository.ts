import type { AuthActor } from "../../types/api.types";
import type { ReportFilters } from "./reports.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const outletClause = (context: AuthActor, column: string, requestedOutletId?: string) => {
  if (context.isSuperAdmin) {
    return requestedOutletId ? { sql: ` AND ${column} = ?`, values: [requestedOutletId] } : { sql: "", values: [] };
  }
  if (requestedOutletId && !context.outletIds.includes(requestedOutletId)) {
    return { sql: " AND 1 = 0", values: [] };
  }
  const outlets = requestedOutletId ? [requestedOutletId] : context.outletIds;
  if (outlets.length === 0) return { sql: " AND 1 = 0", values: [] };
  return { sql: ` AND ${column} IN (${outlets.map(() => "?").join(", ")})`, values: outlets };
};

export const employeeSummary = async (env: Env, context: AuthActor, filters: ReportFilters) => {
  const outlet = outletClause(context, "e.primary_outlet_id", filters.outlet_id);
  const extra: string[] = [];
  const values: unknown[] = [context.companyId, ...outlet.values];
  if (filters.department_id) { extra.push("e.department_id = ?"); values.push(filters.department_id); }
  if (filters.position_id) { extra.push("e.position_id = ?"); values.push(filters.position_id); }
  if (filters.employee_type) { extra.push("e.employee_type = ?"); values.push(filters.employee_type); }
  if (filters.employment_status) { extra.push("e.employment_status = ?"); values.push(filters.employment_status); }
  if (filters.nationality) { extra.push("e.nationality = ?"); values.push(filters.nationality); }
  if (filters.joined_from) { extra.push("e.joined_at >= ?"); values.push(filters.joined_from); }
  if (filters.joined_to) { extra.push("e.joined_at <= ?"); values.push(filters.joined_to); }
  const where = `e.company_id = ? AND e.deleted_at IS NULL${outlet.sql}${extra.length ? ` AND ${extra.join(" AND ")}` : ""}`;
  const summary = await one<any>(
    env,
    `SELECT COUNT(*) AS total_employees,
      SUM(CASE WHEN employment_status = 'active' THEN 1 ELSE 0 END) AS active_employees,
      SUM(CASE WHEN employment_status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave,
      SUM(CASE WHEN employment_status = 'long_leave' THEN 1 ELSE 0 END) AS long_leave,
      SUM(CASE WHEN employment_status = 'suspended' THEN 1 ELSE 0 END) AS suspended,
      SUM(CASE WHEN employment_status = 'resigned' THEN 1 ELSE 0 END) AS resigned,
      SUM(CASE WHEN employment_status = 'terminated' THEN 1 ELSE 0 END) AS terminated,
      SUM(CASE WHEN employee_type = 'local' THEN 1 ELSE 0 END) AS local_count,
      SUM(CASE WHEN employee_type = 'foreign' THEN 1 ELSE 0 END) AS foreign_count
     FROM employees e WHERE ${where}`,
    values,
  );
  const byOutlet = await many<any>(
    env,
    `SELECT o.id AS outlet_id, o.name AS outlet_name, COUNT(e.id) AS total
     FROM employees e LEFT JOIN outlets o ON o.id = e.primary_outlet_id AND o.company_id = e.company_id
     WHERE ${where} GROUP BY o.id, o.name ORDER BY o.name`,
    values,
  );
  return { summary: summary ?? {}, by_outlet: byOutlet };
};

export const attendanceSummary = async (env: Env, context: AuthActor, filters: ReportFilters) => {
  const outlet = outletClause(context, "s.outlet_id", filters.outlet_id);
  const values: unknown[] = [context.companyId, filters.date_from ?? "0000-01-01", filters.date_to ?? "9999-12-31", ...outlet.values];
  const status = filters.status ? " AND s.status = ?" : "";
  if (filters.status) values.push(filters.status);
  const employee = filters.employee_id ? " AND s.employee_id = ?" : "";
  if (filters.employee_id) values.push(filters.employee_id);
  const row = await one<any>(
    env,
    `SELECT
      SUM(CASE WHEN s.status = 'present' THEN 1 ELSE 0 END) AS total_present_days,
      SUM(CASE WHEN s.status = 'absent' THEN 1 ELSE 0 END) AS total_absent_days,
      SUM(CASE WHEN s.status = 'checked_in' THEN 1 ELSE 0 END) AS checked_in_count,
      SUM(CASE WHEN s.status = 'missing_clock_in' THEN 1 ELSE 0 END) AS missing_clock_in_count,
      SUM(CASE WHEN s.status = 'missing_clock_out' THEN 1 ELSE 0 END) AS missing_clock_out_count,
      SUM(CASE WHEN s.status = 'conflict' THEN 1 ELSE 0 END) AS conflict_count,
      COALESCE(SUM(s.late_minutes), 0) AS total_late_minutes,
      COALESCE(SUM(s.early_out_minutes), 0) AS total_early_out_minutes,
      COALESCE(SUM(s.overtime_minutes), 0) AS total_overtime_minutes
     FROM attendance_daily_summary s
     WHERE s.company_id = ? AND s.attendance_date BETWEEN ? AND ?${outlet.sql}${status}${employee}`,
    values,
  );
  return { summary: row ?? {} };
};

export const leaveSummary = async (env: Env, context: AuthActor, filters: ReportFilters) => {
  const outlet = outletClause(context, "e.primary_outlet_id", filters.outlet_id);
  const values: unknown[] = [context.companyId, filters.date_from ?? "0000-01-01", filters.date_to ?? "9999-12-31", ...outlet.values];
  const row = await one<any>(
    env,
    `SELECT COUNT(l.id) AS total_requests,
      SUM(CASE WHEN l.status = 'approved' THEN 1 ELSE 0 END) AS approved_requests,
      SUM(CASE WHEN l.status = 'pending' THEN 1 ELSE 0 END) AS pending_requests,
      SUM(CASE WHEN l.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_requests,
      SUM(CASE WHEN l.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_requests,
      COALESCE(SUM(l.total_days), 0) AS total_leave_days
     FROM leave_requests l
     JOIN employees e ON e.id = l.employee_id AND e.company_id = l.company_id
     WHERE l.company_id = ? AND l.start_date <= ? AND l.end_date >= ?${outlet.sql}`,
    values,
  );
  return { summary: row ?? {} };
};

export const payrollSummary = async (env: Env, context: AuthActor, filters: ReportFilters) => {
  const outlet = outletClause(context, "pi.outlet_id", filters.outlet_id);
  const values: unknown[] = [context.companyId, ...outlet.values];
  const month = filters.payroll_month ? " AND pr.payroll_month = ?" : "";
  if (filters.payroll_month) values.push(filters.payroll_month);
  const row = await one<any>(
    env,
    `SELECT COUNT(DISTINCT pr.id) AS payroll_runs,
      COALESCE(SUM(pi.gross_amount), 0) AS total_gross_amount,
      COALESCE(SUM(pi.total_deductions_amount), 0) AS total_deduction_amount,
      COALESCE(SUM(pi.net_amount), 0) AS total_net_amount
     FROM payroll_runs pr
     LEFT JOIN payroll_items pi ON pi.payroll_run_id = pr.id AND pi.company_id = pr.company_id
     WHERE pr.company_id = ?${outlet.sql}${month}`,
    values,
  );
  return { summary: { ...(row ?? {}), totals_scope: context.isSuperAdmin ? "company" : "accessible_outlets" } };
};

export const simpleCount = (env: Env, sql: string, values: readonly unknown[]) => one<any>(env, sql, values);
export const listRows = <T>(env: Env, sql: string, values: readonly unknown[] = []) => many<T>(env, sql, values);
export { outletClause };
