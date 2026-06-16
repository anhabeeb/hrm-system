import type { AuthActor } from "../../types/api.types";
import type { HrReportFilters, HrReportPagination } from "./hr-reports.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const many = async <T>(env: Env, sql: string, values: readonly unknown[] = []) => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const pageOffset = (filters: HrReportFilters) => (filters.page - 1) * filters.page_size;

const paginate = async (
  env: Env,
  sql: string,
  values: readonly unknown[],
  filters: HrReportFilters,
): Promise<{ rows: Array<Record<string, unknown>>; pagination: HrReportPagination }> => {
  const total = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM (${sql}) hr_report_rows`, values);
  const rows = await many<Record<string, unknown>>(
    env,
    `${sql} LIMIT ? OFFSET ?`,
    [...values, filters.page_size, pageOffset(filters)],
  );
  const totalRows = Number(total?.total ?? 0);
  return {
    rows,
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total: totalRows,
      total_pages: totalRows === 0 ? 0 : Math.ceil(totalRows / filters.page_size),
    },
  };
};

const employeeScope = (
  context: AuthActor,
  filters: HrReportFilters,
  employeeAlias = "e",
) => {
  const clauses: string[] = [`${employeeAlias}.company_id = ?`];
  const values: unknown[] = [context.companyId];

  if (!filters.include_archived) clauses.push(`${employeeAlias}.deleted_at IS NULL`);
  if (filters.employee_id) {
    clauses.push(`${employeeAlias}.id = ?`);
    values.push(filters.employee_id);
  }

  if (context.isSuperAdmin || context.isAdmin) {
    if (filters.outlet_id) {
      clauses.push(`${employeeAlias}.primary_outlet_id = ?`);
      values.push(filters.outlet_id);
    }
  } else if (filters.outlet_id) {
    if (!context.outletIds.includes(filters.outlet_id)) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`${employeeAlias}.primary_outlet_id = ?`);
      values.push(filters.outlet_id);
    }
  } else if (context.outletIds.length > 0) {
    clauses.push(`${employeeAlias}.primary_outlet_id IN (${context.outletIds.map(() => "?").join(", ")})`);
    values.push(...context.outletIds);
  } else {
    clauses.push("1 = 0");
  }

  if (filters.department_id) {
    clauses.push(`${employeeAlias}.department_id = ?`);
    values.push(filters.department_id);
  }
  if (filters.position_id) {
    clauses.push(`${employeeAlias}.position_id = ?`);
    values.push(filters.position_id);
  }
  if (filters.employee_type && filters.employee_type !== "all") {
    clauses.push(`${employeeAlias}.employee_type = ?`);
    values.push(filters.employee_type);
  }
  if (filters.employment_status) {
    clauses.push(`${employeeAlias}.employment_status = ?`);
    values.push(filters.employment_status);
  }
  if (filters.search) {
    clauses.push(`(${employeeAlias}.employee_code LIKE ? OR ${employeeAlias}.full_name LIKE ? OR ${employeeAlias}.nationality LIKE ?)`);
    const search = `%${filters.search}%`;
    values.push(search, search, search);
  }

  return { sql: clauses.join(" AND "), values };
};

const employeeJoins = `
  LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
  LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
  LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id`;

const employeeColumns = `
  e.id AS employee_id,
  e.employee_code,
  e.full_name AS employee_name,
  CASE WHEN e.profile_photo_key IS NULL THEN NULL ELSE '/api/v1/employees/' || e.id || '/profile-photo' END AS profile_photo_url,
  e.employee_type,
  e.nationality,
  e.primary_outlet_id AS outlet_id,
  COALESCE(o.name, 'Unassigned') AS outlet_name,
  e.department_id,
  COALESCE(d.name, 'Unassigned') AS department_name,
  e.position_id,
  COALESCE(p.title, 'Unassigned') AS position_name,
  e.joined_at,
  e.employment_status`;

const maskSql = (column: string) =>
  `CASE WHEN ${column} IS NULL OR ${column} = '' THEN NULL WHEN length(${column}) <= 4 THEN '****' ELSE substr('****************', 1, max(length(${column}) - 4, 4)) || substr(${column}, -4) END`;

const profileCompletenessSql = `CASE WHEN e.employee_code IS NOT NULL AND e.full_name IS NOT NULL AND e.primary_outlet_id IS NOT NULL AND e.department_id IS NOT NULL AND (e.employee_type <> 'foreign' OR (e.passport_number IS NOT NULL AND e.work_permit_number IS NOT NULL)) THEN 'complete' ELSE 'incomplete' END`;

const requiredDocumentCategoryWhere = (categoryAlias = "cat") =>
  `${categoryAlias}.status = 'active' AND ((e.employee_type = 'foreign' AND ${categoryAlias}.applies_to_foreign_employee = 1) OR (e.employee_type <> 'foreign' AND ${categoryAlias}.applies_to_local_employee = 1))`;

const activeDocumentWhere = (documentAlias = "doc") =>
  `${documentAlias}.deleted_at IS NULL AND ${documentAlias}.status NOT IN ('archived', 'replaced', 'deleted', 'rejected', 'metadata_only', 'pending_file', 'missing_file')`;

const documentCategoryMatch = (documentAlias = "doc", categoryAlias = "cat") =>
  `(${documentAlias}.document_type = ${categoryAlias}.category_key OR ${documentAlias}.document_category = ${categoryAlias}.category_key OR ${documentAlias}.document_type = ${categoryAlias}.id OR ${documentAlias}.document_category = ${categoryAlias}.id)`;

const requiredDocumentsCountSql = `(SELECT COUNT(*) FROM document_categories cat WHERE cat.company_id = e.company_id AND ${requiredDocumentCategoryWhere("cat")})`;

const missingRequiredDocumentsSql = `(SELECT COUNT(*)
        FROM document_categories cat
        WHERE cat.company_id = e.company_id
          AND ${requiredDocumentCategoryWhere("cat")}
          AND NOT EXISTS (
            SELECT 1 FROM employee_documents doc
            WHERE doc.company_id = e.company_id
              AND doc.employee_id = e.id
              AND ${activeDocumentWhere("doc")}
              AND ${documentCategoryMatch("doc", "cat")}
              AND (cat.requires_expiry_date = 0 OR doc.expiry_date IS NOT NULL)
          ))`;

const expiredDocumentsSql = `(SELECT COUNT(*) FROM employee_documents doc WHERE doc.company_id = e.company_id AND doc.employee_id = e.id AND ${activeDocumentWhere("doc")} AND (doc.status = 'expired' OR (doc.expiry_date IS NOT NULL AND doc.expiry_date < ?)))`;

const expiringDocumentsSql = `(SELECT COUNT(*) FROM employee_documents doc WHERE doc.company_id = e.company_id AND doc.employee_id = e.id AND ${activeDocumentWhere("doc")} AND doc.expiry_date BETWEEN ? AND date(?, '+30 day'))`;

const latestContractStatusSql = `COALESCE((SELECT c.contract_status FROM employee_contracts c WHERE c.company_id = e.company_id AND c.employee_id = e.id AND c.archived_at IS NULL ORDER BY CASE c.contract_status WHEN 'active' THEN 1 WHEN 'expiring_soon' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, COALESCE(c.start_date, c.created_at) DESC LIMIT 1), 'missing')`;

const latestProbationEndSql = `(SELECT c.probation_end_date FROM employee_contracts c WHERE c.company_id = e.company_id AND c.employee_id = e.id AND c.archived_at IS NULL AND c.probation_end_date IS NOT NULL ORDER BY c.start_date DESC, c.created_at DESC LIMIT 1)`;

const employeeMasterSql = (filters: HrReportFilters, context: AuthActor) => {
  const scope = employeeScope(context, filters);
  const sql = `SELECT ${employeeColumns},
      e.phone AS contact_summary,
      e.emergency_contact_relation,
      CASE
        WHEN e.employee_type = 'foreign' AND (e.passport_number IS NULL OR e.work_permit_number IS NULL) THEN 'missing_required_identity'
        WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed') AND a.severity IN ('critical', 'urgent', 'high')) THEN 'risk'
        ELSE 'complete'
      END AS document_compliance_status,
      COALESCE((SELECT c.contract_status FROM employee_contracts c WHERE c.company_id = e.company_id AND c.employee_id = e.id AND c.archived_at IS NULL ORDER BY c.start_date DESC, c.created_at DESC LIMIT 1), 'missing') AS active_contract_status,
      COALESCE((SELECT a.severity FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed') ORDER BY CASE a.severity WHEN 'urgent' THEN 1 WHEN 'critical' THEN 2 WHEN 'high' THEN 3 ELSE 4 END, a.expiry_date LIMIT 1), 'none') AS expiry_alert_severity,
      CASE WHEN e.employment_status = 'probation' OR EXISTS (SELECT 1 FROM employee_contracts c WHERE c.company_id = e.company_id AND c.employee_id = e.id AND c.probation_end_date IS NOT NULL AND c.probation_end_date >= ?) THEN 'active' ELSE 'not_on_probation' END AS probation_status,
      CASE WHEN EXISTS (SELECT 1 FROM long_leave_records ll WHERE ll.company_id = e.company_id AND ll.employee_id = e.id AND ll.status IN ('approved', 'active', 'extended') AND ll.start_date <= ? AND COALESCE(ll.actual_return_date, ll.expected_return_date) >= ?) THEN 'active' ELSE 'none' END AS active_long_leave_status,
      ${profileCompletenessSql} AS profile_completeness
    FROM employees e
    ${employeeJoins}
    WHERE ${scope.sql}
    ORDER BY e.employee_code ASC`;
  return { sql, values: [filters.as_of_date, filters.as_of_date, filters.as_of_date, ...scope.values] };
};

export const employeeMaster = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const query = employeeMasterSql(filters, context);
  return paginate(env, query.sql, query.values, filters);
};

export const employeeStatus = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  return paginate(env, `SELECT e.employment_status,
      COUNT(*) AS total_employees,
      SUM(CASE WHEN e.employee_type = 'local' THEN 1 ELSE 0 END) AS local_employees,
      SUM(CASE WHEN e.employee_type = 'foreign' THEN 1 ELSE 0 END) AS foreign_employees,
      SUM(CASE WHEN oc.status IN ('initiated', 'in_progress', 'pending') THEN 1 ELSE 0 END) AS offboarding_in_progress
    FROM employees e
    LEFT JOIN offboarding_cases oc ON oc.company_id = e.company_id AND oc.employee_id = e.id AND oc.status IN ('initiated', 'in_progress', 'pending')
    WHERE ${scope.sql}
    GROUP BY e.employment_status
    ORDER BY total_employees DESC, e.employment_status`, scope.values, filters);
};

export const localForeign = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  return paginate(env, `SELECT e.employee_type,
      COALESCE(e.nationality, 'Unspecified') AS nationality,
      COUNT(*) AS total_employees,
      SUM(CASE WHEN e.employee_type = 'foreign' AND (e.passport_number IS NULL OR e.passport_number = '') THEN 1 ELSE 0 END) AS missing_passport,
      SUM(CASE WHEN e.employee_type = 'foreign' AND (e.work_permit_number IS NULL OR e.work_permit_number = '') THEN 1 ELSE 0 END) AS missing_work_permit,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed')) THEN 1 ELSE 0 END) AS expiring_documents,
      CASE WHEN SUM(CASE WHEN e.employee_type = 'foreign' AND (e.passport_number IS NULL OR e.work_permit_number IS NULL) THEN 1 ELSE 0 END) > 0 THEN 'high' ELSE 'normal' END AS compliance_severity
    FROM employees e
    WHERE ${scope.sql}
    GROUP BY e.employee_type, COALESCE(e.nationality, 'Unspecified')
    ORDER BY e.employee_type, total_employees DESC`, scope.values, filters);
};

export const headcount = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const baseWhere = scope.sql;
  const period = [filters.from_date ?? "0000-01-01", filters.to_date ?? "9999-12-31"];
  const values = [...period, ...scope.values, ...period, ...scope.values, ...period, ...scope.values];
  const select = (grouping: string, idColumn: string, nameColumn: string, join = "") => `SELECT '${grouping}' AS grouping,
      ${idColumn} AS group_id,
      COALESCE(${nameColumn}, 'Unassigned') AS group_name,
      COUNT(*) AS headcount,
      SUM(CASE WHEN e.employment_status IN ('active', 'probation', 'on_leave', 'long_leave', 'on_long_leave') THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN e.employment_status NOT IN ('active', 'probation', 'on_leave', 'long_leave', 'on_long_leave') THEN 1 ELSE 0 END) AS inactive_count,
      SUM(CASE WHEN e.employee_type = 'local' THEN 1 ELSE 0 END) AS local_count,
      SUM(CASE WHEN e.employee_type = 'foreign' THEN 1 ELSE 0 END) AS foreign_count,
      SUM(CASE WHEN e.joined_at BETWEEN ? AND ? THEN 1 ELSE 0 END) AS new_joiners_count,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM long_leave_records ll WHERE ll.company_id = e.company_id AND ll.employee_id = e.id AND ll.status IN ('approved', 'active', 'extended')) THEN 1 ELSE 0 END) AS long_leave_count,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed') AND a.severity IN ('urgent', 'critical', 'high')) THEN 1 ELSE 0 END) AS compliance_risk_count
    FROM employees e ${join}
    WHERE ${baseWhere}
    GROUP BY ${idColumn}, ${nameColumn}`;
  return paginate(env, `${select("outlet", "e.primary_outlet_id", "o.name", "LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id")}
    UNION ALL
    ${select("department", "e.department_id", "d.name", "LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id")}
    UNION ALL
    ${select("position", "e.position_id", "p.title", "LEFT JOIN positions p ON p.company_id = e.company_id AND p.id = e.position_id")}`, values, filters);
};

export const newJoiners = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const sql = `SELECT ${employeeColumns},
      ${latestProbationEndSql} AS probation_end_date,
      CASE
        WHEN ${missingRequiredDocumentsSql} > 0 THEN 'missing'
        WHEN ${expiredDocumentsSql} > 0 THEN 'expired'
        WHEN ${expiringDocumentsSql} > 0 THEN 'expiring_soon'
        ELSE 'complete'
      END AS onboarding_document_status,
      ${latestContractStatusSql} AS contract_status,
      ${profileCompletenessSql} AS profile_completeness
    FROM employees e
    ${employeeJoins}
    WHERE ${scope.sql}
      AND e.joined_at BETWEEN ? AND ?
    ORDER BY e.joined_at DESC, e.employee_code`;
  return paginate(env, sql, [filters.as_of_date, filters.as_of_date, filters.as_of_date, ...scope.values, filters.from_date ?? "0000-01-01", filters.to_date ?? filters.as_of_date], filters);
};

export const probation = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  return paginate(env, `SELECT ${employeeColumns},
      c.probation_end_date,
      CAST(julianday(c.probation_end_date) - julianday(?) AS INTEGER) AS days_remaining,
      CASE WHEN c.probation_end_date < ? THEN 'overdue' WHEN c.probation_end_date <= date(?, '+14 day') THEN 'ending_soon' ELSE 'active' END AS probation_status,
      CASE WHEN c.probation_end_date <= date(?, '+14 day') THEN 1 ELSE 0 END AS action_required
    FROM employees e
    ${employeeJoins}
    LEFT JOIN employee_contracts c ON c.company_id = e.company_id AND c.employee_id = e.id AND c.archived_at IS NULL
    WHERE ${scope.sql} AND (e.employment_status = 'probation' OR c.probation_end_date IS NOT NULL)
    ORDER BY c.probation_end_date ASC`, [filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, ...scope.values], filters);
};

export const contracts = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const status = filters.contract_status ? " AND COALESCE(c.contract_status, 'missing') = ?" : "";
  const values = [filters.as_of_date, filters.as_of_date, filters.as_of_date, ...scope.values, ...(filters.contract_status ? [filters.contract_status] : [])];
  return paginate(env, `SELECT ${employeeColumns},
      c.contract_number,
      c.contract_type,
      COALESCE(c.contract_status, 'missing') AS contract_status,
      c.start_date,
      c.end_date,
      CASE WHEN c.id IS NULL THEN 'missing' WHEN c.end_date < ? THEN 'expired' WHEN c.end_date <= date(?, '+30 day') THEN 'expiring_soon' ELSE 'current' END AS renewal_due_status
    FROM employees e
    ${employeeJoins}
    LEFT JOIN employee_contracts c ON c.company_id = e.company_id AND c.employee_id = e.id AND c.archived_at IS NULL
    WHERE ${scope.sql}${status}
    ORDER BY CASE WHEN c.end_date IS NULL THEN 1 ELSE 0 END, c.end_date ASC`, values, filters);
};

export const documentCompliance = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  return paginate(env, `SELECT ${employeeColumns},
      ${requiredDocumentsCountSql} AS required_documents_count,
      (SELECT COUNT(*) FROM employee_documents doc WHERE doc.company_id = e.company_id AND doc.employee_id = e.id AND ${activeDocumentWhere("doc")}) AS uploaded_documents,
      ${missingRequiredDocumentsSql} AS missing_documents,
      ${expiredDocumentsSql} AS expired_documents,
      ${expiringDocumentsSql} AS expiring_documents,
      e.passport_expiry_date,
      e.work_permit_expiry_date,
      CASE WHEN ${missingRequiredDocumentsSql} > 0 OR (e.employee_type = 'foreign' AND (e.passport_number IS NULL OR e.work_permit_number IS NULL)) THEN 'missing'
           WHEN ${expiredDocumentsSql} > 0 THEN 'expired'
           WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed') AND a.severity IN ('urgent', 'critical', 'high')) THEN 'risk'
           ELSE 'compliant' END AS compliance_status,
      COALESCE((SELECT a.status FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id ORDER BY a.expiry_date ASC LIMIT 1), 'none') AS expiry_alert_status
    FROM employees e
    ${employeeJoins}
    WHERE ${scope.sql}
    ORDER BY compliance_status DESC, e.employee_code`, [
      filters.as_of_date,
      filters.as_of_date,
      filters.as_of_date,
      filters.as_of_date,
      ...scope.values,
    ], filters);
};

export const foreignCompliance = (env: Env, context: AuthActor, filters: HrReportFilters, canViewSensitive: boolean) => {
  const scopedFilters = { ...filters, employee_type: "foreign" as const };
  const scope = employeeScope(context, scopedFilters);
  return paginate(env, `SELECT ${employeeColumns},
      ${canViewSensitive ? "e.passport_number" : maskSql("e.passport_number")} AS passport_number_masked,
      e.passport_expiry_date,
      ${canViewSensitive ? "e.work_permit_number" : maskSql("e.work_permit_number")} AS work_permit_number_masked,
      e.work_permit_expiry_date,
      CAST(julianday(MIN(COALESCE(e.passport_expiry_date, '9999-12-31'), COALESCE(e.work_permit_expiry_date, '9999-12-31'))) - julianday(?) AS INTEGER) AS days_until_next_expiry,
      CASE WHEN e.passport_number IS NULL OR e.work_permit_number IS NULL THEN 'critical'
           WHEN e.passport_expiry_date < ? OR e.work_permit_expiry_date < ? THEN 'critical'
           WHEN e.passport_expiry_date <= date(?, '+30 day') OR e.work_permit_expiry_date <= date(?, '+30 day') THEN 'high'
           ELSE 'normal' END AS compliance_severity,
      (SELECT a.id FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed') ORDER BY a.expiry_date ASC LIMIT 1) AS expiry_alert_id
    FROM employees e
    ${employeeJoins}
    WHERE ${scope.sql}
    ORDER BY compliance_severity ASC, days_until_next_expiry ASC`, [filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, ...scope.values], filters);
};

export const leaveBalances = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const leaveType = filters.leave_type_id ? " AND lb.leave_type_id = ?" : "";
  return paginate(env, `SELECT ${employeeColumns},
      COALESCE(lt.leave_name, lt.leave_key, lb.leave_type_id) AS leave_type,
      lb.entitlement_days,
      lb.opening_balance,
      lb.accrued_days,
      lb.used_days,
      lb.pending_days,
      lb.adjusted_days,
      lb.carried_forward_days,
      lb.expired_days,
      COALESCE(lb.available_days, lb.remaining_days) AS available_days,
      CASE WHEN COALESCE(lb.available_days, lb.remaining_days, 0) < 0 THEN 1 ELSE 0 END AS negative_balance_warning,
      lb.last_accrual_date
    FROM leave_balances lb
    JOIN employees e ON e.company_id = lb.company_id AND e.id = lb.employee_id
    ${employeeJoins}
    LEFT JOIN leave_types lt ON lt.company_id = lb.company_id AND lt.id = lb.leave_type_id
    WHERE ${scope.sql}${leaveType}
    ORDER BY e.employee_code, leave_type`, [...scope.values, ...(filters.leave_type_id ? [filters.leave_type_id] : [])], filters);
};

export const leaveRequests = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const extra: string[] = [];
  const values: unknown[] = [...scope.values];
  if (filters.leave_type_id) { extra.push("l.leave_type_id = ?"); values.push(filters.leave_type_id); }
  if (filters.leave_status) { extra.push("l.status = ?"); values.push(filters.leave_status); }
  if (filters.approval_status) { extra.push("COALESCE(l.approval_status, l.status) = ?"); values.push(filters.approval_status); }
  extra.push("l.start_date <= ?");
  extra.push("l.end_date >= ?");
  values.push(filters.to_date ?? filters.as_of_date, filters.from_date ?? "0000-01-01");
  return paginate(env, `SELECT ${employeeColumns},
      COALESCE(lt.leave_name, lt.leave_key, l.leave_type_id) AS leave_type,
      l.start_date,
      l.end_date,
      CAST(julianday(l.end_date) - julianday(l.start_date) + 1 AS REAL) AS requested_duration_days,
      l.total_days AS duration_days,
      l.total_days AS holiday_adjusted_duration,
      l.status,
      COALESCE(l.approval_status, l.status) AS approval_status,
      COALESCE((SELECT s.step_name FROM leave_approval_steps s WHERE s.company_id = l.company_id AND s.leave_request_id = l.id AND s.status = 'pending' ORDER BY s.step_order, s.level LIMIT 1), 'complete') AS current_step,
      l.total_days AS balance_impact,
      substr(COALESCE(l.reason, l.decision_reason, ''), 1, 120) AS reason_summary,
      l.submitted_at,
      l.approved_at,
      l.rejected_at,
      l.cancelled_at
    FROM leave_requests l
    JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
    ${employeeJoins}
    LEFT JOIN leave_types lt ON lt.company_id = l.company_id AND lt.id = l.leave_type_id
    WHERE ${scope.sql} AND ${extra.join(" AND ")}
    ORDER BY l.start_date DESC, e.employee_code`, values, filters);
};

export const longLeave = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const status = filters.long_leave_status ? " AND ll.status = ?" : "";
  const values = [filters.as_of_date, ...scope.values, ...(filters.long_leave_status ? [filters.long_leave_status] : []), filters.to_date ?? filters.as_of_date, filters.from_date ?? "0000-01-01"];
  return paginate(env, `SELECT ${employeeColumns},
      ll.start_date,
      ll.expected_return_date AS end_date,
      ll.expected_return_date,
      ll.actual_return_date,
      ll.status,
      ll.approval_status,
      ll.payroll_status,
      COALESCE((SELECT SUM(i.deduction_amount) FROM long_leave_payroll_impacts i WHERE i.company_id = ll.company_id AND i.long_leave_id = ll.id), 0) AS estimated_deduction,
      CASE WHEN ll.actual_return_date IS NULL AND ll.expected_return_date < ? AND ll.status IN ('approved', 'active', 'extended') THEN 1 ELSE 0 END AS return_overdue
    FROM long_leave_records ll
    JOIN employees e ON e.company_id = ll.company_id AND e.id = ll.employee_id
    ${employeeJoins}
    WHERE ${scope.sql}${status} AND ll.start_date <= ? AND COALESCE(ll.actual_return_date, ll.expected_return_date) >= ?
    ORDER BY ll.start_date DESC`, values, filters);
};

export const assetsUniforms = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const status = filters.asset_status ? " AND assignment_status = ?" : "";
  const values = [...scope.values, ...scope.values, ...(filters.asset_status ? [filters.asset_status] : [])];
  const employeeSelect = `${employeeColumns}`;
  return paginate(env, `SELECT * FROM (
      SELECT ${employeeSelect},
        'asset' AS assignment_type,
        COALESCE(a.asset_name, a.asset_code, aa.asset_id) AS item_name,
        aa.issued_date AS issue_date,
        aa.returned_date AS due_return_date,
        COALESCE(aa.return_condition, aa.issue_condition) AS condition_status,
        aa.status AS assignment_status,
        CASE WHEN aa.returned_date IS NULL AND aa.status IN ('issued', 'assigned') THEN 1 ELSE 0 END AS overdue_return
      FROM asset_assignments aa
      JOIN employees e ON e.company_id = aa.company_id AND e.id = aa.employee_id
      ${employeeJoins}
      LEFT JOIN assets a ON a.company_id = aa.company_id AND a.id = aa.asset_id
      WHERE ${scope.sql}
      UNION ALL
      SELECT ${employeeSelect},
        'uniform' AS assignment_type,
        ui.uniform_type AS item_name,
        ui.issued_date AS issue_date,
        ui.returned_date AS due_return_date,
        NULL AS condition_status,
        ui.status AS assignment_status,
        CASE WHEN ui.returned_date IS NULL AND ui.status IN ('issued', 'assigned') THEN 1 ELSE 0 END AS overdue_return
      FROM uniform_issues ui
      JOIN employees e ON e.company_id = ui.company_id AND e.id = ui.employee_id
      ${employeeJoins}
      WHERE ${scope.sql}
    ) assignments
    WHERE 1 = 1${status}
    ORDER BY issue_date DESC`, values, filters);
};

export const complianceSummary = async (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const row = await one<Record<string, number | null>>(env, `SELECT
      SUM(CASE WHEN e.employee_type = 'foreign' AND (e.passport_number IS NULL OR e.work_permit_number IS NULL) THEN 1 ELSE 0 END) AS missing_documents,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM employee_documents doc WHERE doc.company_id = e.company_id AND doc.employee_id = e.id AND doc.expiry_date < ?) THEN 1 ELSE 0 END) AS expired_documents,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM employee_documents doc WHERE doc.company_id = e.company_id AND doc.employee_id = e.id AND doc.expiry_date BETWEEN ? AND date(?, '+30 day')) THEN 1 ELSE 0 END) AS expiring_documents,
      SUM(CASE WHEN e.employee_type = 'foreign' AND (e.passport_expiry_date <= date(?, '+30 day') OR e.work_permit_expiry_date <= date(?, '+30 day')) THEN 1 ELSE 0 END) AS foreign_identity_risk,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM employee_contracts c WHERE c.company_id = e.company_id AND c.employee_id = e.id AND c.end_date <= date(?, '+30 day')) THEN 1 ELSE 0 END) AS contract_expiry_risk,
      SUM(CASE WHEN e.employment_status = 'probation' AND EXISTS (SELECT 1 FROM employee_contracts c WHERE c.company_id = e.company_id AND c.employee_id = e.id AND c.probation_end_date < ?) THEN 1 ELSE 0 END) AS probation_overdue,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed')) THEN 1 ELSE 0 END) AS unresolved_expiry_alerts,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM long_leave_records ll WHERE ll.company_id = e.company_id AND ll.employee_id = e.id AND ll.actual_return_date IS NULL AND ll.expected_return_date < ? AND ll.status IN ('approved', 'active', 'extended')) THEN 1 ELSE 0 END) AS long_leave_overdue_returns,
      SUM(CASE WHEN e.employee_code IS NULL OR e.full_name IS NULL OR e.primary_outlet_id IS NULL OR e.department_id IS NULL THEN 1 ELSE 0 END) AS profile_incomplete_warnings
    FROM employees e
    WHERE ${scope.sql}`, [filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, filters.as_of_date, ...scope.values]);
  const metrics = [
    ["missing_documents", "Missing documents", "high", "Employees missing required HR identity/document fields."],
    ["expired_documents", "Expired documents", "critical", "Employees with expired uploaded documents."],
    ["expiring_documents", "Expiring documents", "high", "Employees with documents expiring within 30 days."],
    ["foreign_identity_risk", "Visa/work permit/passport risk", "critical", "Foreign employee passport or work permit expiry risk."],
    ["contract_expiry_risk", "Contract expiry risk", "high", "Employees with contracts expiring within 30 days."],
    ["probation_overdue", "Probation overdue", "high", "Employees whose probation end date has passed."],
    ["unresolved_expiry_alerts", "Unresolved expiry alerts", "critical", "Employees with open expiry alerts."],
    ["long_leave_overdue_returns", "Long leave overdue returns", "high", "Long leave employees overdue to return."],
    ["profile_incomplete_warnings", "Incomplete profiles", "normal", "Employees missing core profile fields."],
  ];
  const rows = metrics.map(([key, metric, severity, description]) => ({
    metric,
    count: Number(row?.[key] ?? 0),
    severity,
    description,
  }));
  return {
    rows,
    pagination: { page: 1, page_size: rows.length, total: rows.length, total_pages: 1 },
  };
};

export const lifecycle = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const fromDate = filters.from_date ?? "0000-01-01";
  const toDate = filters.to_date ?? filters.as_of_date;
  const values = [...scope.values, fromDate, toDate, ...scope.values, fromDate, toDate, ...scope.values, fromDate, toDate, ...scope.values, fromDate, toDate];
  const employeeSelect = `${employeeColumns}`;
  return paginate(env, `SELECT * FROM (
      SELECT ${employeeSelect}, 'job_change' AS event_type, j.change_type AS event_label, j.effective_from AS event_date, substr(COALESCE(j.reason, ''), 1, 120) AS reason
      FROM employee_job_history j JOIN employees e ON e.company_id = j.company_id AND e.id = j.employee_id ${employeeJoins}
      WHERE ${scope.sql} AND j.effective_from BETWEEN ? AND ?
      UNION ALL
      SELECT ${employeeSelect}, 'status_change' AS event_type, sh.new_status AS event_label, COALESCE(sh.changed_at, sh.created_at) AS event_date, substr(COALESCE(sh.reason, ''), 1, 120) AS reason
      FROM employee_status_history sh JOIN employees e ON e.company_id = sh.company_id AND e.id = sh.employee_id ${employeeJoins}
      WHERE ${scope.sql} AND date(COALESCE(sh.changed_at, sh.created_at)) BETWEEN ? AND ?
      UNION ALL
      SELECT ${employeeSelect}, 'long_leave' AS event_type, ll.status AS event_label, ll.start_date AS event_date, substr(COALESCE(ll.reason, ''), 1, 120) AS reason
      FROM long_leave_records ll JOIN employees e ON e.company_id = ll.company_id AND e.id = ll.employee_id ${employeeJoins}
      WHERE ${scope.sql} AND ll.start_date BETWEEN ? AND ?
      UNION ALL
      SELECT ${employeeSelect}, 'audit' AS event_type, al.action AS event_label, al.created_at AS event_date, substr(COALESCE(al.reason, ''), 1, 120) AS reason
      FROM audit_logs al JOIN employees e ON e.company_id = al.company_id AND e.id = al.employee_id ${employeeJoins}
      WHERE ${scope.sql} AND date(al.created_at) BETWEEN ? AND ?
    ) lifecycle_rows
    ORDER BY event_date DESC`, values, filters);
};

export const employee360Summary = (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  return paginate(env, `SELECT ${employeeColumns},
      CASE WHEN EXISTS (SELECT 1 FROM attendance_daily_summary s WHERE s.company_id = e.company_id AND s.employee_id = e.id AND s.attendance_date >= date(?, '-7 day') AND s.status IN ('missing_clock_in', 'missing_clock_out', 'missing_check_in', 'missing_checkout', 'conflict')) THEN 'attention' ELSE 'normal' END AS attendance_risk,
      CASE WHEN EXISTS (SELECT 1 FROM leave_balances lb WHERE lb.company_id = e.company_id AND lb.employee_id = e.id AND COALESCE(lb.available_days, lb.remaining_days, 0) < 0) THEN 'negative_balance' ELSE 'normal' END AS leave_risk,
      CASE WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed') AND a.severity IN ('urgent', 'critical', 'high')) THEN 'risk' ELSE 'normal' END AS document_risk,
      CASE WHEN EXISTS (SELECT 1 FROM long_leave_records ll WHERE ll.company_id = e.company_id AND ll.employee_id = e.id AND ll.status IN ('approved', 'active', 'extended')) THEN 'active' ELSE 'none' END AS long_leave_status,
      CASE WHEN e.employment_status = 'probation' THEN 'probation' WHEN EXISTS (SELECT 1 FROM employee_contracts c WHERE c.company_id = e.company_id AND c.employee_id = e.id AND c.end_date <= date(?, '+30 day')) THEN 'contract_due' ELSE 'normal' END AS contract_probation_status,
      (SELECT COUNT(*) FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed')) AS open_alerts,
      CASE
        WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed') AND a.severity IN ('urgent', 'critical')) THEN 'Resolve critical expiry alert'
        WHEN EXISTS (SELECT 1 FROM attendance_daily_summary s WHERE s.company_id = e.company_id AND s.employee_id = e.id AND s.attendance_date >= date(?, '-7 day') AND s.status IN ('missing_clock_in', 'missing_clock_out', 'missing_check_in', 'missing_checkout', 'conflict')) THEN 'Review attendance exceptions'
        WHEN EXISTS (SELECT 1 FROM leave_balances lb WHERE lb.company_id = e.company_id AND lb.employee_id = e.id AND COALESCE(lb.available_days, lb.remaining_days, 0) < 0) THEN 'Review leave balance'
        ELSE 'No immediate action'
      END AS next_action_required
    FROM employees e
    ${employeeJoins}
    WHERE ${scope.sql}
    ORDER BY open_alerts DESC, e.employee_code`, [filters.as_of_date, filters.as_of_date, filters.as_of_date, ...scope.values], filters);
};

export const summary = async (env: Env, context: AuthActor, filters: HrReportFilters) => {
  const scope = employeeScope(context, filters);
  const row = await one<Record<string, number | null>>(env, `SELECT
      COUNT(*) AS employees,
      SUM(CASE WHEN e.employee_type = 'foreign' THEN 1 ELSE 0 END) AS foreign_employees,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM expiry_alerts a WHERE a.company_id = e.company_id AND a.employee_id = e.id AND a.status IN ('open', 'acknowledged', 'snoozed')) THEN 1 ELSE 0 END) AS employees_with_alerts,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM long_leave_records ll WHERE ll.company_id = e.company_id AND ll.employee_id = e.id AND ll.status IN ('approved', 'active', 'extended')) THEN 1 ELSE 0 END) AS employees_on_long_leave,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM leave_balances lb WHERE lb.company_id = e.company_id AND lb.employee_id = e.id AND COALESCE(lb.available_days, lb.remaining_days, 0) < 0) THEN 1 ELSE 0 END) AS negative_leave_balance_employees
    FROM employees e
    WHERE ${scope.sql}`, scope.values);
  return row ?? {};
};
