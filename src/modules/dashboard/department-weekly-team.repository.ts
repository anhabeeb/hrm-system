import type { AuthActor } from "../../types/api.types";
import type { AttendanceCalendarEmployeeRecord } from "../attendance/attendance-calendar.types";

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

export const findDepartment = (env: Env, companyId: string, departmentId: string) =>
  one<{ id: string; name: string }>(
    env,
    `SELECT id, name
       FROM departments
      WHERE company_id = ? AND id = ? AND archived_at IS NULL AND COALESCE(is_active, 1) = 1
      LIMIT 1`,
    [companyId, departmentId],
  );

export const listActiveDepartmentsForWeeklyTeam = (env: Env, context: AuthActor) =>
  many<{ id: string; name: string }>(
    env,
    `SELECT id, name
       FROM departments
      WHERE company_id = ? AND archived_at IS NULL AND COALESCE(is_active, 1) = 1
      ORDER BY name ASC
      LIMIT 200`,
    [context.companyId],
  );

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

export const listDepartmentEmployeesForWeek = (
  env: Env,
  context: AuthActor,
  options: {
    departmentId: string;
    outletId?: string;
    search?: string;
    actorEmployee?: AttendanceCalendarEmployeeRecord | null;
    scope: "all" | "team" | "none";
  },
) => {
  const clauses = [
    "e.company_id = ?",
    "e.department_id = ?",
    "e.deleted_at IS NULL",
    "e.archived_at IS NULL",
    "lower(COALESCE(e.employment_status, 'active')) NOT IN ('archived', 'deleted')",
  ];
  const values: unknown[] = [context.companyId, options.departmentId];
  const outlet = employeeOutletClause(context, "e");
  if (outlet.sql) {
    clauses.push(outlet.sql.replace(/^ AND /, ""));
    values.push(...outlet.values);
  }
  if (options.outletId) {
    clauses.push("e.primary_outlet_id = ?");
    values.push(options.outletId);
  }
  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`;
    clauses.push("(lower(COALESCE(e.employee_code, '')) LIKE ? OR lower(COALESCE(e.full_name, '')) LIKE ? OR lower(COALESCE(p.title, '')) LIKE ?)");
    values.push(term, term, term);
  }
  if (options.scope === "team" && options.actorEmployee) {
    clauses.push("COALESCE(e.level, 0) < ?");
    values.push(Number(options.actorEmployee.level ?? 0));
  } else if (options.scope === "none") {
    clauses.push("1 = 0");
  }

  return many<AttendanceCalendarEmployeeRecord>(
    env,
    `SELECT e.id, e.employee_code, e.full_name, e.department_id, d.name AS department_name,
      e.position_id, p.title AS position_name, e.level, e.primary_outlet_id, NULL AS store_id,
      e.joined_at, e.resigned_at, e.terminated_at, e.employment_status, e.deleted_at, e.archived_at
     FROM employees e
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.employee_code ASC, e.full_name ASC
     LIMIT 100`,
    values,
  );
};
