import type { AssetCreateInput, AssetDeductionFilters, AssetListFilters, AssetOutletScope, AssetUpdateInput } from "./assets.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const assetAccessExpr = "COALESCE(e.primary_outlet_id, ca.outlet_id, a.outlet_id)";

const applyAssetScope = (clauses: string[], values: unknown[], filters: { outlet_id?: string }, scope: AssetOutletScope) => {
  if (scope.isSuperAdmin) return;
  if (scope.outletIds.length === 0) {
    clauses.push("1 = 0");
    return;
  }
  if (filters.outlet_id && !scope.outletIds.includes(filters.outlet_id)) {
    clauses.push("1 = 0");
    return;
  }
  clauses.push(`${assetAccessExpr} IN (${scope.outletIds.map(() => "?").join(", ")})`);
  values.push(...scope.outletIds);
};

const assetListSql = `
  FROM assets a
  LEFT JOIN asset_assignments ca ON ca.asset_id = a.id AND ca.company_id = a.company_id AND ca.status = 'issued' AND ca.returned_date IS NULL
  LEFT JOIN employees e ON e.id = ca.employee_id AND e.company_id = a.company_id
  LEFT JOIN outlets o ON o.id = a.outlet_id AND o.company_id = a.company_id
  LEFT JOIN outlets ao ON ao.id = ca.outlet_id AND ao.company_id = a.company_id
`;

const buildAssetFilters = (companyId: string, filters: AssetListFilters, scope: AssetOutletScope) => {
  const clauses = ["a.company_id = ?", "a.deleted_at IS NULL"];
  const values: unknown[] = [companyId];
  applyAssetScope(clauses, values, filters, scope);
  if (filters.search) {
    clauses.push("(lower(a.asset_code) LIKE lower(?) OR lower(a.asset_name) LIKE lower(?))");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.outlet_id) { clauses.push(`${assetAccessExpr} = ?`); values.push(filters.outlet_id); }
  if (filters.employee_id) { clauses.push("ca.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.asset_type) { clauses.push("a.asset_type = ?"); values.push(filters.asset_type); }
  if (filters.status) { clauses.push("a.status = ?"); values.push(filters.status); }
  if (filters.current_condition) { clauses.push("a.current_condition = ?"); values.push(filters.current_condition); }
  if (filters.assigned_to === "employee") clauses.push("ca.employee_id IS NOT NULL");
  if (filters.assigned_to === "outlet") clauses.push("ca.outlet_id IS NOT NULL");
  return { sql: clauses.join(" AND "), values };
};

export const countAssets = async (env: Env, companyId: string, filters: AssetListFilters, scope: AssetOutletScope) => {
  const built = buildAssetFilters(companyId, filters, scope);
  const row = await one<{ total: number }>(env, `SELECT COUNT(DISTINCT a.id) AS total ${assetListSql} WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listAssets = (env: Env, companyId: string, filters: AssetListFilters, scope: AssetOutletScope) => {
  const built = buildAssetFilters(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT a.id, a.asset_code, a.asset_name, a.asset_type, a.outlet_id, o.name AS outlet_name,
      ca.employee_id AS assigned_employee_id, e.full_name AS assigned_employee_name,
      ca.outlet_id AS assigned_outlet_id, ao.name AS assigned_outlet_name,
      a.status, a.current_condition, a.purchase_value_amount, a.created_at, a.updated_at
     ${assetListSql}
     WHERE ${built.sql}
     GROUP BY a.id
     ORDER BY a.${filters.sort_by} ${filters.sort_direction.toUpperCase()}
     LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const findAssetById = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT a.*, o.name AS outlet_name, ca.id AS current_assignment_id,
      ca.employee_id AS assigned_employee_id, e.full_name AS assigned_employee_name,
      ca.outlet_id AS assigned_outlet_id, ao.name AS assigned_outlet_name,
      ${assetAccessExpr} AS access_outlet_id
     ${assetListSql}
     WHERE a.company_id = ? AND a.id = ? AND a.deleted_at IS NULL
     GROUP BY a.id LIMIT 1`,
    [companyId, id],
  );

export const findAssetByCode = (env: Env, companyId: string, code: string) =>
  one<{ id: string }>(env, "SELECT id FROM assets WHERE company_id = ? AND asset_code = ? AND deleted_at IS NULL LIMIT 1", [companyId, code]);

export const findEmployee = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    "SELECT id, full_name, primary_outlet_id, employment_status, deleted_at FROM employees WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const findOutlet = (env: Env, companyId: string, id: string) =>
  one<{ id: string; name: string; status: string }>(
    env,
    "SELECT id, name, status FROM outlets WHERE company_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId, id],
  );

export const createAsset = (env: Env, id: string, companyId: string, input: AssetCreateInput) =>
  run(
    env,
    `INSERT INTO assets (
      id, company_id, asset_code, asset_name, asset_type, outlet_id,
      status, purchase_value_amount, current_condition, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)`,
    [id, companyId, input.asset_code, input.asset_name, input.asset_type, input.outlet_id ?? null, input.purchase_value_amount ?? null, input.current_condition ?? null, new Date().toISOString(), new Date().toISOString()],
  );

export const updateAsset = (env: Env, companyId: string, id: string, input: AssetUpdateInput) => {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of ["asset_code", "asset_name", "asset_type", "outlet_id", "purchase_value_amount", "current_condition"] as const) {
    if (input[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(input[key]);
    }
  }
  if (sets.length === 0) return Promise.resolve();
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), companyId, id);
  return run(env, `UPDATE assets SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const updateAssetStatus = (env: Env, companyId: string, id: string, status: string, condition?: string | null, outletId?: string | null) => {
  const sets = ["status = ?", "updated_at = ?"];
  const values: unknown[] = [status, new Date().toISOString()];
  if (condition !== undefined) { sets.push("current_condition = ?"); values.push(condition); }
  if (outletId !== undefined) { sets.push("outlet_id = ?"); values.push(outletId); }
  values.push(companyId, id);
  return run(env, `UPDATE assets SET ${sets.join(", ")} WHERE company_id = ? AND id = ?`, values);
};

export const findActiveAssignment = (env: Env, companyId: string, assetId: string) =>
  one<any>(
    env,
    `SELECT aa.*, e.primary_outlet_id AS employee_outlet_id, e.full_name AS employee_name
     FROM asset_assignments aa
     LEFT JOIN employees e ON e.id = aa.employee_id AND e.company_id = aa.company_id
     WHERE aa.company_id = ? AND aa.asset_id = ? AND aa.status = 'issued' AND aa.returned_date IS NULL
     ORDER BY aa.created_at DESC LIMIT 1`,
    [companyId, assetId],
  );

export const createAssignment = (env: Env, input: { id: string; companyId: string; assetId: string; employeeId?: string | null; outletId?: string | null; issuedDate: string; issueCondition?: string | null; createdBy: string }) =>
  run(
    env,
    `INSERT INTO asset_assignments (
      id, company_id, asset_id, employee_id, outlet_id, issued_date,
      issue_condition, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?)`,
    [input.id, input.companyId, input.assetId, input.employeeId ?? null, input.outletId ?? null, input.issuedDate, input.issueCondition ?? null, input.createdBy, new Date().toISOString(), new Date().toISOString()],
  );

export const returnAssignment = (env: Env, companyId: string, assignmentId: string, returnedDate: string, returnCondition?: string | null, status = "returned") =>
  run(
    env,
    "UPDATE asset_assignments SET returned_date = ?, return_condition = ?, status = ?, updated_at = ? WHERE company_id = ? AND id = ?",
    [returnedDate, returnCondition ?? null, status, new Date().toISOString(), companyId, assignmentId],
  );

export const updateAssignmentStatusOnly = (env: Env, companyId: string, assignmentId: string, status: string, condition?: string | null) =>
  run(
    env,
    "UPDATE asset_assignments SET status = ?, return_condition = COALESCE(?, return_condition), updated_at = ? WHERE company_id = ? AND id = ?",
    [status, condition ?? null, new Date().toISOString(), companyId, assignmentId],
  );

export const createDeduction = (env: Env, input: { id: string; companyId: string; assignmentId: string; employeeId: string; amount: number; reason: string; status?: string; approvalRequestId?: string | null }) =>
  run(
    env,
    `INSERT INTO asset_deductions (
      id, company_id, asset_assignment_id, employee_id, amount, reason,
      status, approval_request_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.id, input.companyId, input.assignmentId, input.employeeId, input.amount, input.reason, input.status ?? "pending", input.approvalRequestId ?? null, new Date().toISOString(), new Date().toISOString()],
  );

export const findDeductionById = (env: Env, companyId: string, id: string) =>
  one<any>(
    env,
    `SELECT d.*, aa.asset_id, a.asset_code, a.asset_name, e.primary_outlet_id AS outlet_id, e.full_name AS employee_name
     FROM asset_deductions d
     JOIN asset_assignments aa ON aa.id = d.asset_assignment_id AND aa.company_id = d.company_id
     JOIN assets a ON a.id = aa.asset_id AND a.company_id = d.company_id
     JOIN employees e ON e.id = d.employee_id AND e.company_id = d.company_id
     WHERE d.company_id = ? AND d.id = ? LIMIT 1`,
    [companyId, id],
  );

export const updateDeductionStatus = (env: Env, companyId: string, id: string, status: string) =>
  run(env, "UPDATE asset_deductions SET status = ?, updated_at = ? WHERE company_id = ? AND id = ?", [status, new Date().toISOString(), companyId, id]);

const deductionWhere = (companyId: string, filters: AssetDeductionFilters, scope: AssetOutletScope) => {
  const clauses = ["d.company_id = ?"];
  const values: unknown[] = [companyId];
  if (!scope.isSuperAdmin) {
    if (scope.outletIds.length === 0) clauses.push("1 = 0");
    else {
      clauses.push(`e.primary_outlet_id IN (${scope.outletIds.map(() => "?").join(", ")})`);
      values.push(...scope.outletIds);
    }
  }
  if (filters.status) { clauses.push("d.status = ?"); values.push(filters.status); }
  if (filters.employee_id) { clauses.push("d.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push("e.primary_outlet_id = ?"); values.push(filters.outlet_id); }
  return { sql: clauses.join(" AND "), values };
};

export const countDeductions = async (env: Env, companyId: string, filters: AssetDeductionFilters, scope: AssetOutletScope) => {
  const built = deductionWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total FROM asset_deductions d JOIN employees e ON e.id = d.employee_id WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const listDeductions = (env: Env, companyId: string, filters: AssetDeductionFilters, scope: AssetOutletScope) => {
  const built = deductionWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT d.*, a.asset_code, a.asset_name, e.full_name AS employee_name, e.primary_outlet_id AS outlet_id, o.name AS outlet_name
     FROM asset_deductions d
     JOIN asset_assignments aa ON aa.id = d.asset_assignment_id AND aa.company_id = d.company_id
     JOIN assets a ON a.id = aa.asset_id AND a.company_id = d.company_id
     JOIN employees e ON e.id = d.employee_id AND e.company_id = d.company_id
     LEFT JOIN outlets o ON o.id = e.primary_outlet_id
     WHERE ${built.sql}
     ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

const pendingReturnWhere = (companyId: string, filters: AssetListFilters, scope: AssetOutletScope) => {
  const clauses = ["a.company_id = ?", "a.deleted_at IS NULL", "ca.returned_date IS NULL", "ca.status IN ('issued', 'lost', 'damaged')", "a.status IN ('issued', 'lost', 'damaged')"];
  const values: unknown[] = [companyId];
  applyAssetScope(clauses, values, filters, scope);
  if (filters.employee_id) { clauses.push("ca.employee_id = ?"); values.push(filters.employee_id); }
  if (filters.outlet_id) { clauses.push(`${assetAccessExpr} = ?`); values.push(filters.outlet_id); }
  if (filters.date_from) { clauses.push("ca.issued_date >= ?"); values.push(filters.date_from); }
  if (filters.date_to) { clauses.push("ca.issued_date <= ?"); values.push(filters.date_to); }
  return { sql: clauses.join(" AND "), values };
};

export const pendingReturn = (env: Env, companyId: string, filters: AssetListFilters, scope: AssetOutletScope) => {
  const built = pendingReturnWhere(companyId, filters, scope);
  return many<any>(
    env,
    `SELECT a.id, a.asset_code, a.asset_name, a.asset_type, ${assetAccessExpr} AS outlet_id,
      COALESCE(o.name, ao.name) AS outlet_name, ca.id AS assignment_id,
      ca.employee_id AS assigned_employee_id, e.full_name AS assigned_employee_name,
      ca.issued_date, ca.status AS assignment_status, a.status, a.current_condition,
      a.created_at, a.updated_at
     ${assetListSql}
     WHERE ${built.sql}
     ORDER BY ca.issued_date DESC LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const countPendingReturn = async (env: Env, companyId: string, filters: AssetListFilters, scope: AssetOutletScope) => {
  const built = pendingReturnWhere(companyId, filters, scope);
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(*) AS total ${assetListSql} WHERE ${built.sql}`,
    built.values,
  );
  return row?.total ?? 0;
};

export const findPayrollRun = (env: Env, companyId: string, payrollMonth: string) =>
  one<{ status: string }>(env, "SELECT status FROM payroll_runs WHERE company_id = ? AND payroll_month = ? LIMIT 1", [companyId, payrollMonth]);

export const findApprovalWorkflow = (env: Env, companyId: string, workflowKey: string) =>
  one<{ id: string; is_enabled: number }>(env, "SELECT id, is_enabled FROM approval_workflows WHERE company_id = ? AND workflow_key = ? LIMIT 1", [companyId, workflowKey]);

export const createApprovalRequest = (env: Env, input: { id: string; companyId: string; workflowId: string; entityId: string; employeeId: string; requestedBy: string; payloadJson: string }) =>
  run(
    env,
    `INSERT INTO approval_requests (
      id, company_id, workflow_id, module, entity_type, entity_id, employee_id,
      requested_by, status, current_step, summary, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, 'assets', 'asset_deduction', ?, ?, ?, 'pending', 1, 'Asset deduction needs approval.', ?, ?, ?)`,
    [input.id, input.companyId, input.workflowId, input.entityId, input.employeeId, input.requestedBy, input.payloadJson, new Date().toISOString(), new Date().toISOString()],
  );
