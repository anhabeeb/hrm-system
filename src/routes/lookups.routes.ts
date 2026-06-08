import { Hono } from "hono";

import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermissionOrError } from "../middleware/permission.middleware";
import * as permissionService from "../services/permission.service";
import type { AppContext, AuthActor, PaginationMeta } from "../types/api.types";
import { AuthError } from "../utils/errors";
import { paginated } from "../utils/response";

interface LookupRow {
  id: string;
  code: string | null;
  name: string;
  label: string;
  status?: string | null;
  payroll_month?: string;
}

const lookupsRoutes = new Hono<AppContext>();

lookupsRoutes.use("*", authMiddleware);

const lookupPermissionError = {
  code: "LOOKUP_PERMISSION_DENIED",
  message: "You do not have permission to load this lookup.",
};

const EMPLOYEE_LOOKUP_BROAD_PERMISSIONS = [
  "employees.view",
  "employees.profile.view",
  "dashboard.view",
  "attendance.view",
  "attendance.reports.view",
  "leave.requests.create_for_employee",
  "leave.approvals.view",
  "hr_reports.view",
  "payroll_reports.view",
];

const EMPLOYEE_LOOKUP_OWN_PERMISSIONS = [
  "my_profile.view",
  "leave.requests.submit",
  "expiry_alerts.view_own",
  "payslips.view",
];

const EMPLOYEE_LOOKUP_PERMISSIONS = [
  ...EMPLOYEE_LOOKUP_BROAD_PERMISSIONS,
  ...EMPLOYEE_LOOKUP_OWN_PERMISSIONS,
];

const OUTLET_LOOKUP_PERMISSIONS = [
  "outlets.view",
  "employees.view",
  "dashboard.view",
  "hr_reports.view",
  "payroll_reports.view",
];

const DEPARTMENT_LOOKUP_PERMISSIONS = [
  "departments.view",
  "employees.view",
  "dashboard.view",
  "hr_reports.view",
];

const POSITION_LOOKUP_PERMISSIONS = [
  "positions.view",
  "employees.view",
  "hr_reports.view",
];

const LEAVE_TYPE_LOOKUP_PERMISSIONS = [
  "leave.view",
  "leave.requests.submit",
  "leave.requests.create_for_employee",
  "leave.balances.view",
  "leave.approvals.view",
  "hr_reports.leave.view",
];

const PAYROLL_PERIOD_LOOKUP_PERMISSIONS = [
  "payroll.view",
  "payroll_reports.view",
  "payroll_reports.summary.view",
  "payroll_reports.employee.view",
  "payroll_reports.payslips.view",
  "payroll_reports.approvals.view",
  "payroll_reports.cost.view",
  "payroll_reports.finance_summary.view",
];

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const actor = (c: { get: (key: "authUser") => AuthActor | undefined }) => {
  const authUser = c.get("authUser");
  if (!authUser) throw new AuthError("Please sign in to continue.");
  return authUser;
};

const pageInput = (c: { req: { query: (key: string) => string | undefined } }) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("page_size") ?? 20) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  page_size: pageSize,
  total,
  total_pages: Math.ceil(total / pageSize),
});

const like = (value?: string) => `%${value ?? ""}%`;

const isCompanyScoped = (context: AuthActor) =>
  context.isSuperAdmin || context.isAdmin || context.outletIds.length === 0;

const scopedOutletClause = (context: AuthActor, alias: string, values: unknown[]) => {
  if (isCompanyScoped(context)) return "";
  if (context.outletIds.length === 0) return " AND 1 = 0";
  values.push(...context.outletIds);
  return ` AND ${alias} IN (${context.outletIds.map(() => "?").join(", ")})`;
};

const employeeOutletExistsClause = (context: AuthActor, outerTable: string, columnSql: string, values: unknown[]) => {
  if (isCompanyScoped(context)) return "";
  if (context.outletIds.length === 0) return " AND 1 = 0";
  values.push(...context.outletIds);
  return ` AND EXISTS (
    SELECT 1 FROM employees scope_employee
    WHERE scope_employee.company_id = ${outerTable}.company_id
      AND scope_employee.deleted_at IS NULL
      AND scope_employee.${columnSql} = ${outerTable}.id
      AND scope_employee.primary_outlet_id IN (${context.outletIds.map(() => "?").join(", ")})
  )`;
};

const linkedEmployeeId = async (env: Env, context: AuthActor) =>
  (await one<{ employee_id: string | null }>(
    env,
    "SELECT employee_id FROM users WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [context.companyId, context.actorUserId],
  ))?.employee_id ?? null;

const monthLabel = (payrollMonth: string) => {
  const [year, month] = payrollMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
};

lookupsRoutes.get("/employees", requireAnyPermissionOrError(EMPLOYEE_LOOKUP_PERMISSIONS, lookupPermissionError), async (c) => {
  const context = actor(c);
  const { page, pageSize, offset } = pageInput(c);
  const search = c.req.query("search")?.trim();
  const outletId = c.req.query("outlet_id")?.trim();
  const departmentId = c.req.query("department_id")?.trim();
  const positionId = c.req.query("position_id")?.trim();
  const status = c.req.query("status")?.trim() || "active";
  const clauses = ["company_id = ?", "deleted_at IS NULL"];
  const values: unknown[] = [context.companyId];
  const hasBroadLookupAccess = permissionService.hasAnyPermission(context, EMPLOYEE_LOOKUP_BROAD_PERMISSIONS);

  if (hasBroadLookupAccess) {
    const outletScope = scopedOutletClause(context, "primary_outlet_id", values);
    if (outletScope) clauses.push(outletScope.replace(/^ AND /, ""));
    if (outletId) {
      clauses.push("primary_outlet_id = ?");
      values.push(outletId);
    }
  } else {
    const ownEmployeeId = await linkedEmployeeId(c.env, context);
    if (!ownEmployeeId) {
      clauses.push("1 = 0");
    } else {
      clauses.push("id = ?");
      values.push(ownEmployeeId);
    }
  }
  if (departmentId) {
    clauses.push("department_id = ?");
    values.push(departmentId);
  }
  if (positionId) {
    clauses.push("position_id = ?");
    values.push(positionId);
  }
  if (status) {
    clauses.push("employment_status = ?");
    values.push(status);
  }
  if (search) {
    clauses.push(`(
      lower(employee_code) LIKE lower(?)
      OR lower(full_name) LIKE lower(?)
      OR lower(COALESCE(phone, '')) LIKE lower(?)
      OR lower(COALESCE(id_card_number, '')) LIKE lower(?)
      OR lower(COALESCE(passport_number, '')) LIKE lower(?)
    )`);
    values.push(like(search), like(search), like(search), like(search), like(search));
  }

  const where = clauses.join(" AND ");
  const total = (await one<{ total: number }>(c.env, `SELECT COUNT(*) AS total FROM employees WHERE ${where}`, values))?.total ?? 0;
  const rows = await many<{ id: string; employee_code: string; full_name: string; employment_status: string }>(
    c.env,
    `SELECT id, employee_code, full_name, employment_status
     FROM employees WHERE ${where}
     ORDER BY employee_code ASC LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );

  return paginated(
    rows.map((row) => ({
      id: row.id,
      code: row.employee_code,
      name: row.full_name,
      label: `${row.employee_code} - ${row.full_name}`,
      status: row.employment_status,
    })),
    pagination(page, pageSize, total),
    "Employee lookup loaded successfully.",
    { requestId: c.get("requestId") },
  );
});

lookupsRoutes.get("/outlets", requireAnyPermissionOrError(OUTLET_LOOKUP_PERMISSIONS, lookupPermissionError), async (c) => {
  const context = actor(c);
  const { page, pageSize, offset } = pageInput(c);
  const search = c.req.query("search")?.trim();
  const clauses = ["company_id = ?", "deleted_at IS NULL"];
  const values: unknown[] = [context.companyId];
  const scope = scopedOutletClause(context, "id", values);
  if (scope) clauses.push(scope.replace(/^ AND /, ""));
  if (search) {
    clauses.push("(lower(name) LIKE lower(?) OR lower(COALESCE(code, '')) LIKE lower(?))");
    values.push(like(search), like(search));
  }
  const where = clauses.join(" AND ");
  const total = (await one<{ total: number }>(c.env, `SELECT COUNT(*) AS total FROM outlets WHERE ${where}`, values))?.total ?? 0;
  const rows = await many<{ id: string; code: string | null; name: string; status: string }>(
    c.env,
    `SELECT id, code, name, status FROM outlets WHERE ${where} ORDER BY COALESCE(code, name), name LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );

  return paginated(rows.map((row) => ({ ...row, label: `${row.code ?? row.id} - ${row.name}` })), pagination(page, pageSize, total), "Outlet lookup loaded successfully.", { requestId: c.get("requestId") });
});

lookupsRoutes.get("/departments", requireAnyPermissionOrError(DEPARTMENT_LOOKUP_PERMISSIONS, lookupPermissionError), async (c) => {
  const context = actor(c);
  const { page, pageSize, offset } = pageInput(c);
  const search = c.req.query("search")?.trim();
  const clauses = ["company_id = ?", "deleted_at IS NULL"];
  const values: unknown[] = [context.companyId];
  const scope = employeeOutletExistsClause(context, "departments", "department_id", values);
  if (scope) clauses.push(scope.replace(/^ AND /, ""));
  if (search) {
    clauses.push("(lower(name) LIKE lower(?) OR lower(COALESCE(code, '')) LIKE lower(?))");
    values.push(like(search), like(search));
  }
  const where = clauses.join(" AND ");
  const total = (await one<{ total: number }>(c.env, `SELECT COUNT(*) AS total FROM departments WHERE ${where}`, values))?.total ?? 0;
  const rows = await many<{ id: string; code: string | null; name: string; status: string }>(
    c.env,
    `SELECT id, code, name, status FROM departments WHERE ${where} ORDER BY COALESCE(code, name), name LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );

  return paginated(rows.map((row) => ({ ...row, label: `${row.code ?? row.id} - ${row.name}` })), pagination(page, pageSize, total), "Department lookup loaded successfully.", { requestId: c.get("requestId") });
});

lookupsRoutes.get("/positions", requireAnyPermissionOrError(POSITION_LOOKUP_PERMISSIONS, lookupPermissionError), async (c) => {
  const context = actor(c);
  const { page, pageSize, offset } = pageInput(c);
  const search = c.req.query("search")?.trim();
  const departmentId = c.req.query("department_id")?.trim();
  const clauses = ["company_id = ?", "deleted_at IS NULL"];
  const values: unknown[] = [context.companyId];
  const scope = employeeOutletExistsClause(context, "positions", "position_id", values);
  if (scope) clauses.push(scope.replace(/^ AND /, ""));
  if (departmentId) {
    clauses.push("department_id = ?");
    values.push(departmentId);
  }
  if (search) {
    clauses.push("(lower(title) LIKE lower(?) OR lower(COALESCE(code, '')) LIKE lower(?))");
    values.push(like(search), like(search));
  }
  const where = clauses.join(" AND ");
  const total = (await one<{ total: number }>(c.env, `SELECT COUNT(*) AS total FROM positions WHERE ${where}`, values))?.total ?? 0;
  const rows = await many<{ id: string; code: string | null; name: string; status: string }>(
    c.env,
    `SELECT id, code, title AS name, status FROM positions WHERE ${where} ORDER BY COALESCE(code, title), title LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );

  return paginated(rows.map((row) => ({ ...row, label: `${row.code ?? row.id} - ${row.name}` })), pagination(page, pageSize, total), "Position lookup loaded successfully.", { requestId: c.get("requestId") });
});

lookupsRoutes.get("/leave-types", requireAnyPermissionOrError(LEAVE_TYPE_LOOKUP_PERMISSIONS, lookupPermissionError), async (c) => {
  const context = actor(c);
  const { page, pageSize, offset } = pageInput(c);
  const search = c.req.query("search")?.trim();
  const enabled = c.req.query("is_enabled") ?? "1";
  const clauses = ["company_id = ?"];
  const values: unknown[] = [context.companyId];
  if (enabled !== "all") {
    clauses.push("is_enabled = ?");
    values.push(enabled === "false" || enabled === "0" ? 0 : 1);
  }
  if (search) {
    clauses.push("(lower(leave_name) LIKE lower(?) OR lower(leave_key) LIKE lower(?))");
    values.push(like(search), like(search));
  }
  const where = clauses.join(" AND ");
  const total = (await one<{ total: number }>(c.env, `SELECT COUNT(*) AS total FROM leave_types WHERE ${where}`, values))?.total ?? 0;
  const rows = await many<{ id: string; code: string | null; name: string; status: string }>(
    c.env,
    `SELECT id, leave_key AS code, leave_name AS name, CASE WHEN is_enabled = 1 THEN 'active' ELSE 'disabled' END AS status
     FROM leave_types WHERE ${where} ORDER BY leave_name LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );

  return paginated(rows.map((row) => ({ ...row, label: row.name })), pagination(page, pageSize, total), "Leave type lookup loaded successfully.", { requestId: c.get("requestId") });
});

lookupsRoutes.get("/payroll-periods", requireAnyPermissionOrError(PAYROLL_PERIOD_LOOKUP_PERMISSIONS, lookupPermissionError), async (c) => {
  const context = actor(c);
  const { page, pageSize, offset } = pageInput(c);
  const search = c.req.query("search")?.trim();
  const clauses = ["company_id = ?"];
  const values: unknown[] = [context.companyId];
  if (!isCompanyScoped(context)) {
    if (context.outletIds.length === 0) {
      clauses.push("1 = 0");
    } else {
      values.push(...context.outletIds);
      clauses.push(`EXISTS (
        SELECT 1
        FROM payroll_items pi
        JOIN employees e ON e.company_id = pi.company_id AND e.id = pi.employee_id
        WHERE pi.company_id = payroll_runs.company_id
          AND pi.payroll_run_id = payroll_runs.id
          AND e.deleted_at IS NULL
          AND e.primary_outlet_id IN (${context.outletIds.map(() => "?").join(", ")})
      )`);
    }
  }
  if (search) {
    clauses.push("(payroll_month LIKE ? OR status LIKE ?)");
    values.push(like(search), like(search));
  }
  const where = clauses.join(" AND ");
  const total = (await one<{ total: number }>(c.env, `SELECT COUNT(*) AS total FROM payroll_runs WHERE ${where}`, values))?.total ?? 0;
  const rows = await many<{ id: string; payroll_month: string; status: string }>(
    c.env,
    `SELECT id, payroll_month, status FROM payroll_runs WHERE ${where} ORDER BY payroll_month DESC LIMIT ? OFFSET ?`,
    [...values, pageSize, offset],
  );
  const data: LookupRow[] = rows.map((row) => {
    const label = `${monthLabel(row.payroll_month)} - ${row.status.replace(/_/g, " ")}`;
    return { id: row.id, code: row.payroll_month, name: monthLabel(row.payroll_month), label, status: row.status, payroll_month: row.payroll_month };
  });

  return paginated(data, pagination(page, pageSize, total), "Payroll period lookup loaded successfully.", { requestId: c.get("requestId") });
});

export { lookupsRoutes };
