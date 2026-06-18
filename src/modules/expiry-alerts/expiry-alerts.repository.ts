import type {
  ExpiryAlertListFilters,
  ExpiryAlertRecord,
  ExpiryAlertSettingsRecord,
  ExpirySourceRow,
} from "./expiry-alerts.types";

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

const employeeLifecycleClause = (includeArchived: boolean, includeInactive: boolean) => {
  const clauses = ["e.deleted_at IS NULL"];
  if (!includeArchived) clauses.push("LOWER(COALESCE(e.employment_status, 'active')) NOT IN ('archived', 'terminated', 'resigned', 'retired')");
  if (!includeInactive) clauses.push("LOWER(COALESCE(e.employment_status, 'active')) NOT IN ('inactive', 'suspended')");
  return clauses.join(" AND ");
};

const scopedEmployeeFilters = (
  clauses: string[],
  values: unknown[],
  filters: { employee_id?: string; outlet_id?: string; department_id?: string },
  outletIds: string[],
  isSuperAdmin: boolean,
) => {
  if (filters.employee_id) {
    clauses.push("e.id = ?");
    values.push(filters.employee_id);
  }
  if (filters.outlet_id) {
    clauses.push("e.primary_outlet_id = ?");
    values.push(filters.outlet_id);
  }
  if (filters.department_id) {
    clauses.push("e.department_id = ?");
    values.push(filters.department_id);
  }
  if (!isSuperAdmin) {
    if (outletIds.length === 0) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`e.primary_outlet_id IN (${outletIds.map(() => "?").join(", ")})`);
      values.push(...outletIds);
    }
  }
};

export const getSettings = (env: Env, companyId: string) =>
  one<ExpiryAlertSettingsRecord>(env, "SELECT * FROM expiry_alert_settings WHERE company_id = ? LIMIT 1", [companyId]);

export const upsertSettings = (
  env: Env,
  input: {
    id: string;
    companyId: string;
    enabled: number;
    warningDaysJson: string;
    overdueEnabled: number;
    repeatFrequency: string;
    quietDays: number;
    inAppEnabled: number;
    emailEnabled: number;
    minimumEmailSeverity: string;
    notifyRolesJson: string;
    notifyPermissionsJson: string;
    notifyEmployeeSelf: number;
    fallbackToAdmins: number;
    includeArchivedEmployees: number;
    includeInactiveEmployees: number;
    sourceTogglesJson: string;
    updatedBy: string;
    reason: string;
    timestamp: string;
  },
) =>
  run(
    env,
    `INSERT INTO expiry_alert_settings (
      id, company_id, enabled, warning_days_json, overdue_enabled, repeat_frequency,
      quiet_days, in_app_enabled, email_enabled, minimum_email_severity,
      notify_roles_json, notify_permissions_json, notify_employee_self,
      fallback_to_admins, include_archived_employees, include_inactive_employees,
      source_toggles_json, updated_by, updated_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id) DO UPDATE SET
      enabled = excluded.enabled,
      warning_days_json = excluded.warning_days_json,
      overdue_enabled = excluded.overdue_enabled,
      repeat_frequency = excluded.repeat_frequency,
      quiet_days = excluded.quiet_days,
      in_app_enabled = excluded.in_app_enabled,
      email_enabled = excluded.email_enabled,
      minimum_email_severity = excluded.minimum_email_severity,
      notify_roles_json = excluded.notify_roles_json,
      notify_permissions_json = excluded.notify_permissions_json,
      notify_employee_self = excluded.notify_employee_self,
      fallback_to_admins = excluded.fallback_to_admins,
      include_archived_employees = excluded.include_archived_employees,
      include_inactive_employees = excluded.include_inactive_employees,
      source_toggles_json = excluded.source_toggles_json,
      updated_by = excluded.updated_by,
      updated_reason = excluded.updated_reason,
      updated_at = excluded.updated_at`,
    [
      input.id,
      input.companyId,
      input.enabled,
      input.warningDaysJson,
      input.overdueEnabled,
      input.repeatFrequency,
      input.quietDays,
      input.inAppEnabled,
      input.emailEnabled,
      input.minimumEmailSeverity,
      input.notifyRolesJson,
      input.notifyPermissionsJson,
      input.notifyEmployeeSelf,
      input.fallbackToAdmins,
      input.includeArchivedEmployees,
      input.includeInactiveEmployees,
      input.sourceTogglesJson,
      input.updatedBy,
      input.reason,
      input.timestamp,
      input.timestamp,
    ],
  );

export const listEmployeeIdentitySources = (
  env: Env,
  companyId: string,
  throughDate: string,
  filters: { employee_id?: string; outlet_id?: string; department_id?: string },
  outletIds: string[],
  isSuperAdmin: boolean,
  includeArchived: boolean,
  includeInactive: boolean,
) => {
  const clauses = ["e.company_id = ?", employeeLifecycleClause(includeArchived, includeInactive)];
  const values: unknown[] = [companyId];
  scopedEmployeeFilters(clauses, values, filters, outletIds, isSuperAdmin);
  clauses.push("(e.passport_expiry_date IS NOT NULL AND e.passport_expiry_date <= ? OR e.work_permit_expiry_date IS NOT NULL AND e.work_permit_expiry_date <= ?)");
  values.push(throughDate, throughDate);
  return many<any>(
    env,
    `SELECT e.id AS employee_id, e.employee_code, e.full_name AS employee_name, e.employee_type,
      e.employment_status, e.primary_outlet_id AS outlet_id, o.name AS outlet_name,
      e.department_id, d.name AS department_name,
      e.passport_expiry_date, e.work_permit_expiry_date
     FROM employees e
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     LEFT JOIN departments d ON d.company_id = e.company_id AND d.id = e.department_id
     WHERE ${clauses.join(" AND ")}
     LIMIT 500`,
    values,
  );
};

export const listDocumentSources = (
  env: Env,
  companyId: string,
  throughDate: string,
  filters: { employee_id?: string; outlet_id?: string; department_id?: string },
  outletIds: string[],
  isSuperAdmin: boolean,
  includeArchived: boolean,
  includeInactive: boolean,
) => {
  const clauses = [
    "d.company_id = ?",
    "d.deleted_at IS NULL",
    "d.expiry_date IS NOT NULL",
    "d.expiry_date <= ?",
    "LOWER(COALESCE(d.status, 'active')) NOT IN ('archived', 'replaced', 'deleted', 'rejected')",
    employeeLifecycleClause(includeArchived, includeInactive),
  ];
  const values: unknown[] = [companyId, throughDate];
  scopedEmployeeFilters(clauses, values, filters, outletIds, isSuperAdmin);
  return many<ExpirySourceRow>(
    env,
    `SELECT 'employee_document' AS source_type, 'employee_documents' AS source_table,
      d.id AS source_id, COALESCE(d.document_type, 'Employee document') AS source_label,
      d.expiry_date, d.employee_id, e.employee_code, e.full_name AS employee_name,
      e.employee_type, e.employment_status, e.primary_outlet_id AS outlet_id, o.name AS outlet_name,
      e.department_id, dep.name AS department_name,
      json_object('document_type', d.document_type, 'document_number', d.document_number, 'is_sensitive', d.is_sensitive) AS metadata_json
     FROM employee_documents d
     JOIN employees e ON e.company_id = d.company_id AND e.id = d.employee_id
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     LEFT JOIN departments dep ON dep.company_id = e.company_id AND dep.id = e.department_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY d.expiry_date ASC
     LIMIT 500`,
    values,
  );
};

export const listContractSources = (
  env: Env,
  companyId: string,
  throughDate: string,
  includeProbation: boolean,
  filters: { employee_id?: string; outlet_id?: string; department_id?: string },
  outletIds: string[],
  isSuperAdmin: boolean,
  includeArchived: boolean,
  includeInactive: boolean,
) => {
  const clauses = [
    "c.company_id = ?",
    "LOWER(COALESCE(c.contract_status, 'active')) NOT IN ('renewed', 'archived', 'cancelled')",
    employeeLifecycleClause(includeArchived, includeInactive),
  ];
  const values: unknown[] = [companyId];
  const dateClause = includeProbation
    ? "((c.end_date IS NOT NULL AND c.end_date <= ?) OR (c.probation_end_date IS NOT NULL AND c.probation_end_date <= ?))"
    : "(c.end_date IS NOT NULL AND c.end_date <= ?)";
  clauses.push(dateClause);
  values.push(throughDate);
  if (includeProbation) values.push(throughDate);
  scopedEmployeeFilters(clauses, values, filters, outletIds, isSuperAdmin);
  return many<any>(
    env,
    `SELECT c.id AS contract_id, c.contract_number, c.contract_type, c.end_date, c.probation_end_date,
      c.employee_id, e.employee_code, e.full_name AS employee_name, e.employee_type,
      e.employment_status, COALESCE(c.outlet_id, e.primary_outlet_id) AS outlet_id, o.name AS outlet_name,
      COALESCE(c.department_id, e.department_id) AS department_id, dep.name AS department_name
     FROM employee_contracts c
     JOIN employees e ON e.company_id = c.company_id AND e.id = c.employee_id
     LEFT JOIN outlets o ON o.company_id = c.company_id AND o.id = COALESCE(c.outlet_id, e.primary_outlet_id)
     LEFT JOIN departments dep ON dep.company_id = c.company_id AND dep.id = COALESCE(c.department_id, e.department_id)
     WHERE ${clauses.join(" AND ")}
     ORDER BY COALESCE(c.end_date, c.probation_end_date) ASC
     LIMIT 500`,
    values,
  );
};

export const listLongLeaveReturnSources = (
  env: Env,
  companyId: string,
  throughDate: string,
  filters: { employee_id?: string; outlet_id?: string; department_id?: string },
  outletIds: string[],
  isSuperAdmin: boolean,
  includeArchived: boolean,
  includeInactive: boolean,
) => {
  const clauses = [
    "l.company_id = ?",
    "l.expected_return_date IS NOT NULL",
    "l.expected_return_date <= ?",
    "l.actual_return_date IS NULL",
    "LOWER(COALESCE(l.status, 'submitted')) IN ('submitted', 'pending_approval', 'approved', 'active', 'extended')",
    employeeLifecycleClause(includeArchived, includeInactive),
  ];
  const values: unknown[] = [companyId, throughDate];
  scopedEmployeeFilters(clauses, values, filters, outletIds, isSuperAdmin);
  return many<ExpirySourceRow>(
    env,
    `SELECT 'long_leave_return' AS source_type, 'long_leave_records' AS source_table,
      l.id AS source_id, 'Long leave expected return' AS source_label,
      l.expected_return_date AS expiry_date, l.employee_id, e.employee_code, e.full_name AS employee_name,
      e.employee_type, e.employment_status, e.primary_outlet_id AS outlet_id, o.name AS outlet_name,
      e.department_id, dep.name AS department_name,
      json_object('status', l.status, 'payroll_status', l.payroll_status) AS metadata_json
     FROM long_leave_records l
     JOIN employees e ON e.company_id = l.company_id AND e.id = l.employee_id
     LEFT JOIN outlets o ON o.company_id = e.company_id AND o.id = e.primary_outlet_id
     LEFT JOIN departments dep ON dep.company_id = e.company_id AND dep.id = e.department_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY l.expected_return_date ASC
     LIMIT 500`,
    values,
  );
};

export const findUserEmployeeId = async (env: Env, companyId: string, userId: string) => {
  const row = await one<{ employee_id: string | null }>(
    env,
    `SELECT employee_id
       FROM users
      WHERE company_id = ? AND id = ?
        AND LOWER(COALESCE(status, 'active')) NOT IN ('inactive', 'suspended', 'disabled')
      LIMIT 1`,
    [companyId, userId],
  );
  return row?.employee_id ?? null;
};

const buildAlertWhere = (
  companyId: string,
  filters: ExpiryAlertListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
  employeeIdScope?: string | null,
) => {
  const clauses = ["company_id = ?"];
  const values: unknown[] = [companyId];
  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  } else if (!filters.include_closed) {
    clauses.push("status NOT IN ('resolved', 'dismissed')");
  }
  if (filters.severity) {
    clauses.push("severity = ?");
    values.push(filters.severity);
  }
  if (filters.source_type) {
    clauses.push("source_type = ?");
    values.push(filters.source_type);
  } else if (filters.source_types) {
    if (filters.source_types.length === 0) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`source_type IN (${filters.source_types.map(() => "?").join(", ")})`);
      values.push(...filters.source_types);
    }
  }
  if (filters.employee_id) {
    clauses.push("employee_id = ?");
    values.push(filters.employee_id);
  }
  if (employeeIdScope) {
    clauses.push("employee_id = ?");
    values.push(employeeIdScope);
  }
  if (filters.outlet_id) {
    clauses.push("outlet_id = ?");
    values.push(filters.outlet_id);
  }
  if (filters.department_id) {
    clauses.push("department_id = ?");
    values.push(filters.department_id);
  }
  if (filters.alert_type) {
    clauses.push("alert_type = ?");
    values.push(filters.alert_type);
  }
  if (filters.from_date) {
    clauses.push("expiry_date >= ?");
    values.push(filters.from_date);
  }
  if (filters.to_date) {
    clauses.push("expiry_date <= ?");
    values.push(filters.to_date);
  }
  if (!isSuperAdmin) {
    if (outletIds.length === 0) {
      clauses.push("1 = 0");
    } else {
      clauses.push(`(outlet_id IS NULL OR outlet_id IN (${outletIds.map(() => "?").join(", ")}))`);
      values.push(...outletIds);
    }
  }
  return { sql: clauses.join(" AND "), values };
};

export const countAlerts = async (
  env: Env,
  companyId: string,
  filters: ExpiryAlertListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
  employeeIdScope?: string | null,
) => {
  const built = buildAlertWhere(companyId, filters, outletIds, isSuperAdmin, employeeIdScope);
  const row = await one<{ total: number }>(env, `SELECT COUNT(*) AS total FROM expiry_alerts WHERE ${built.sql}`, built.values);
  return row?.total ?? 0;
};

export const listAlerts = (
  env: Env,
  companyId: string,
  filters: ExpiryAlertListFilters,
  outletIds: string[],
  isSuperAdmin: boolean,
  employeeIdScope?: string | null,
) => {
  const built = buildAlertWhere(companyId, filters, outletIds, isSuperAdmin, employeeIdScope);
  return many<ExpiryAlertRecord>(
    env,
    `SELECT * FROM expiry_alerts
      WHERE ${built.sql}
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        expiry_date ASC,
        last_detected_at DESC
      LIMIT ? OFFSET ?`,
    [...built.values, filters.page_size, (filters.page - 1) * filters.page_size],
  );
};

export const getAlertById = (env: Env, companyId: string, id: string) =>
  one<ExpiryAlertRecord>(env, "SELECT * FROM expiry_alerts WHERE company_id = ? AND id = ? LIMIT 1", [companyId, id]);

export const getAlertByIdempotency = (env: Env, companyId: string, idempotencyKey: string) =>
  one<ExpiryAlertRecord>(
    env,
    "SELECT * FROM expiry_alerts WHERE company_id = ? AND idempotency_key = ? LIMIT 1",
    [companyId, idempotencyKey],
  );

export const insertAlert = (env: Env, input: Record<string, unknown>) =>
  run(
    env,
    `INSERT INTO expiry_alerts (
      id, company_id, employee_id, user_id, outlet_id, department_id, source_type,
      source_table, source_id, source_label, expiry_date, days_until_expiry,
      alert_type, severity, status, title, message, action_url, idempotency_key,
      first_detected_at, last_detected_at, next_notification_at, metadata_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.company_id,
      input.employee_id ?? null,
      input.user_id ?? null,
      input.outlet_id ?? null,
      input.department_id ?? null,
      input.source_type,
      input.source_table,
      input.source_id,
      input.source_label,
      input.expiry_date,
      input.days_until_expiry,
      input.alert_type,
      input.severity,
      input.title,
      input.message,
      input.action_url ?? null,
      input.idempotency_key,
      input.first_detected_at,
      input.last_detected_at,
      input.next_notification_at ?? null,
      input.metadata_json ?? null,
      input.created_at,
      input.updated_at,
    ],
  );

export const refreshAlert = (env: Env, input: Record<string, unknown>) =>
  run(
    env,
    `UPDATE expiry_alerts
        SET days_until_expiry = ?,
            alert_type = ?,
            severity = ?,
            title = ?,
            message = ?,
            action_url = ?,
            last_detected_at = ?,
            next_notification_at = COALESCE(next_notification_at, ?),
            metadata_json = ?,
            updated_at = ?
      WHERE company_id = ? AND id = ? AND status NOT IN ('resolved', 'dismissed')`,
    [
      input.days_until_expiry,
      input.alert_type,
      input.severity,
      input.title,
      input.message,
      input.action_url ?? null,
      input.last_detected_at,
      input.next_notification_at ?? null,
      input.metadata_json ?? null,
      input.updated_at,
      input.company_id,
      input.id,
    ],
  );

export const updateAlertStatus = (
  env: Env,
  input: {
    companyId: string;
    id: string;
    status: string;
    actorId: string;
    timestamp: string;
    reason?: string | null;
    snoozedUntil?: string | null;
  },
) =>
  run(
    env,
    `UPDATE expiry_alerts
        SET status = ?,
            acknowledged_by = CASE WHEN ? = 'acknowledged' THEN ? ELSE acknowledged_by END,
            acknowledged_at = CASE WHEN ? = 'acknowledged' THEN ? ELSE acknowledged_at END,
            resolved_by = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_by END,
            resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END,
            dismissed_by = CASE WHEN ? = 'dismissed' THEN ? ELSE dismissed_by END,
            dismissed_at = CASE WHEN ? = 'dismissed' THEN ? ELSE dismissed_at END,
            snoozed_until = CASE WHEN ? = 'snoozed' THEN ? ELSE snoozed_until END,
            resolution_note = COALESCE(?, resolution_note),
            updated_at = ?
      WHERE company_id = ? AND id = ?`,
    [
      input.status,
      input.status,
      input.actorId,
      input.status,
      input.timestamp,
      input.status,
      input.actorId,
      input.status,
      input.timestamp,
      input.status,
      input.actorId,
      input.status,
      input.timestamp,
      input.status,
      input.snoozedUntil ?? null,
      input.reason ?? null,
      input.timestamp,
      input.companyId,
      input.id,
    ],
  );

export const updateAlertNotificationRefs = (
  env: Env,
  input: {
    companyId: string;
    id: string;
    notificationId?: string | null;
    emailNotificationId?: string | null;
    lastNotifiedAt?: string | null;
    nextNotificationAt?: string | null;
    timestamp: string;
  },
) =>
  run(
    env,
    `UPDATE expiry_alerts
        SET notification_id = COALESCE(notification_id, ?),
            email_notification_id = COALESCE(email_notification_id, ?),
            last_notified_at = COALESCE(?, last_notified_at),
            next_notification_at = ?,
            updated_at = ?
      WHERE company_id = ? AND id = ? AND status NOT IN ('resolved', 'dismissed')`,
    [
      input.notificationId ?? null,
      input.emailNotificationId ?? null,
      input.lastNotifiedAt ?? null,
      input.nextNotificationAt ?? null,
      input.timestamp,
      input.companyId,
      input.id,
    ],
  );

export const summary = async (
  env: Env,
  companyId: string,
  outletIds: string[],
  isSuperAdmin: boolean,
  employeeIdScope?: string | null,
  sourceTypes?: string[],
) => {
  const built = buildAlertWhere(companyId, { page: 1, page_size: 1, source_types: sourceTypes }, outletIds, isSuperAdmin, employeeIdScope);
  return one<Record<string, number>>(
    env,
    `SELECT
      SUM(CASE WHEN status IN ('open', 'acknowledged', 'snoozed') THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN severity = 'critical' AND status NOT IN ('resolved', 'dismissed') THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN severity = 'high' AND status NOT IN ('resolved', 'dismissed') THEN 1 ELSE 0 END) AS high_count,
      SUM(CASE WHEN severity = 'warning' AND status NOT IN ('resolved', 'dismissed') THEN 1 ELSE 0 END) AS warning_count,
      SUM(CASE WHEN alert_type = 'overdue' AND status NOT IN ('resolved', 'dismissed') THEN 1 ELSE 0 END) AS overdue_count,
      SUM(CASE WHEN alert_type = 'due_today' AND status NOT IN ('resolved', 'dismissed') THEN 1 ELSE 0 END) AS due_today_count,
      SUM(CASE WHEN days_until_expiry BETWEEN 0 AND 7 AND status NOT IN ('resolved', 'dismissed') THEN 1 ELSE 0 END) AS due_7_days_count,
      SUM(CASE WHEN days_until_expiry BETWEEN 0 AND 30 AND status NOT IN ('resolved', 'dismissed') THEN 1 ELSE 0 END) AS due_30_days_count
     FROM expiry_alerts WHERE ${built.sql}`,
    built.values,
  );
};

export const sourceSummary = async (
  env: Env,
  companyId: string,
  outletIds: string[],
  isSuperAdmin: boolean,
  employeeIdScope?: string | null,
  sourceTypes?: string[],
) => {
  const built = buildAlertWhere(companyId, { page: 1, page_size: 1, source_types: sourceTypes }, outletIds, isSuperAdmin, employeeIdScope);
  return many<{ source_type: string; total: number }>(
    env,
    `SELECT source_type, COUNT(*) AS total
       FROM expiry_alerts
      WHERE ${built.sql}
      GROUP BY source_type`,
    built.values,
  );
};
