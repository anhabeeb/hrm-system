import { SEED_COMPANY_ID } from "./bootstrap.constants";
import type { BootstrapCompanyInput, BootstrapOutletInput, BootstrapSuperAdminInput, SystemBootstrapRow } from "./bootstrap.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));
const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).first<T>();
const run = (env: Env, sql: string, values: readonly unknown[] = []) => bind(env.DB.prepare(sql), values).run();

const now = () => new Date().toISOString();

const isMissingSystemBootstrapTableError = (error: unknown): boolean =>
  error instanceof Error && /no such table:\s*system_bootstrap/i.test(error.message);

const logSystemBootstrapTableMissing = (operation: string, error: unknown) => {
  console.warn("System bootstrap table is not available yet", {
    operation,
    error,
  });
};

const logOptionalBootstrapDefaultFailure = (label: string, error: unknown) => {
  console.warn("Optional bootstrap defaults could not be copied", {
    default_group: label,
    error,
  });
};

export const countCompanies = async (env: Env) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM companies WHERE deleted_at IS NULL");
  return row?.total ?? 0;
};

export const countUsers = async (env: Env) => {
  const row = await one<{ total: number }>(env, "SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL");
  return row?.total ?? 0;
};

export const countSuperAdmins = async (env: Env) => {
  const row = await one<{ total: number }>(
    env,
    `SELECT COUNT(DISTINCT u.id) AS total
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.deleted_at IS NULL
       AND r.is_active = 1
       AND (lower(r.role_key) = 'super_admin' OR lower(r.role_name) = 'super admin')`,
  );
  return row?.total ?? 0;
};

export const ensureSystemBootstrapRow = async (env: Env): Promise<boolean> => {
  try {
    await run(
      env,
      `INSERT OR IGNORE INTO system_bootstrap (
        id,
        is_initialized,
        created_at,
        updated_at
      ) VALUES (
        'default',
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )`,
    );
    return true;
  } catch (error) {
    if (isMissingSystemBootstrapTableError(error)) {
      logSystemBootstrapTableMissing("ensure_default_row", error);
      return false;
    }

    throw error;
  }
};

export const findSystemBootstrap = async (env: Env): Promise<SystemBootstrapRow | null> => {
  const available = await ensureSystemBootstrapRow(env);
  if (!available) return null;

  try {
    return await one<SystemBootstrapRow>(
      env,
      "SELECT * FROM system_bootstrap WHERE id = 'default' LIMIT 1",
    ) ?? null;
  } catch (error) {
    if (isMissingSystemBootstrapTableError(error)) {
      logSystemBootstrapTableMissing("read_default_row", error);
      return null;
    }

    throw error;
  }
};

export const getRememberMeAllowed = async (env: Env, companyId: string): Promise<boolean> => {
  const row = await one<{ setting_value_json: string | null }>(
    env,
    "SELECT setting_value_json FROM company_settings WHERE company_id = ? AND setting_key = 'security.default_rules' LIMIT 1",
    [companyId],
  );

  if (!row?.setting_value_json) return false;

  try {
    const settings = JSON.parse(row.setting_value_json) as { remember_me_allowed?: unknown };
    return settings.remember_me_allowed === true;
  } catch {
    return false;
  }
};

export const markSystemBootstrapInitialized = async (
  env: Env,
  input: {
    companyId: string;
    initializedByUserId: string;
  },
): Promise<void> => {
  const available = await ensureSystemBootstrapRow(env);
  if (!available) return;

  try {
    await run(
      env,
      `UPDATE system_bootstrap
       SET is_initialized = 1,
           company_id = ?,
           initialized_by_user_id = ?,
           initialized_at = COALESCE(initialized_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 'default'`,
      [input.companyId, input.initializedByUserId],
    );
  } catch (error) {
    if (isMissingSystemBootstrapTableError(error)) {
      logSystemBootstrapTableMissing("mark_initialized", error);
      return;
    }

    throw error;
  }
};

export const findSeedSuperAdminRole = (env: Env) =>
  one<{ id: string; role_key: string; role_name: string; description: string | null; is_system_role: number }>(
    env,
    `SELECT id, role_key, role_name, description, is_system_role
     FROM roles
     WHERE is_active = 1
       AND (lower(role_key) = 'super_admin' OR lower(role_name) = 'super admin' OR role_key = 'SUPER_ADMIN')
     ORDER BY CASE WHEN company_id = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    [SEED_COMPANY_ID],
  );

export const findCompanyRoleByKey = (env: Env, companyId: string, roleKey: string) =>
  one<{ id: string; role_key: string; role_name: string }>(
    env,
    "SELECT id, role_key, role_name FROM roles WHERE company_id = ? AND role_key = ? AND is_active = 1 LIMIT 1",
    [companyId, roleKey],
  );

export const findOutletByCode = (env: Env, companyId: string, outletCode: string) =>
  one<{ id: string }>(
    env,
    "SELECT id FROM outlets WHERE company_id = ? AND lower(code) = lower(?) AND deleted_at IS NULL LIMIT 1",
    [companyId, outletCode],
  );

export const createCompany = (env: Env, companyId: string, company: BootstrapCompanyInput) =>
  run(
    env,
    `INSERT INTO companies (id, name, legal_name, logo_url, currency, timezone, status, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, NULL, ?, ?, 'active', ?, ?, NULL)`,
    [companyId, company.company_name, company.legal_name ?? null, company.currency, company.timezone, now(), now()],
  );

export const createOutlet = (env: Env, outletId: string, companyId: string, outlet: BootstrapOutletInput) =>
  run(
    env,
    `INSERT INTO outlets (
      id, company_id, name, code, address, phone, manager_user_id, gps_lat, gps_lng,
      status, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'active', ?, ?, NULL)`,
    [outletId, companyId, outlet.outlet_name, outlet.outlet_code ?? null, now(), now()],
  );

export const createSuperAdminUser = (
  env: Env,
  userId: string,
  companyId: string,
  input: BootstrapSuperAdminInput,
  passwordHash: string,
  passwordAlgo: string,
) =>
  run(
    env,
    `INSERT INTO users (
      id, company_id, employee_id, full_name, email, phone, password_hash,
      password_algo, password_updated_at, password_reset_required,
      failed_login_attempts, locked_until, last_password_reset_at,
      two_factor_enabled, status, last_login_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, 0, 0, NULL, ?, 0, 'active', NULL, ?, ?, NULL)`,
    [userId, companyId, input.full_name, input.email, passwordHash, passwordAlgo, now(), now(), now(), now()],
  );

export const assignRole = (env: Env, companyId: string, userId: string, roleId: string) =>
  run(
    env,
    "INSERT INTO user_roles (id, company_id, user_id, role_id, created_at) VALUES (?, ?, ?, ?, ?)",
    [crypto.randomUUID(), companyId, userId, roleId, now()],
  );

export const disableUser = (env: Env, companyId: string, userId: string) =>
  run(env, "UPDATE users SET status = 'disabled', updated_at = ? WHERE company_id = ? AND id = ?", [now(), companyId, userId]);

export const insertBootstrapAudit = (env: Env, companyId: string, userId: string) =>
  run(
    env,
    `INSERT INTO audit_logs (
      id, company_id, outlet_id, module, action, severity, entity_type,
      entity_id, employee_id, actor_user_id, actor_role_id, device_id,
      ip_address, user_agent, old_value_json, new_value_json, reason,
      effective_date, approval_request_id, sync_batch_id, created_at
    ) VALUES (?, ?, NULL, 'auth', 'super_admin_bootstrapped', 'high', 'user',
      ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, 'Initial production Super Admin bootstrap',
      NULL, NULL, NULL, ?)`,
    [crypto.randomUUID(), companyId, userId, JSON.stringify({ user_id: userId, role: "super_admin" }), now()],
  );

export const createBootstrapCore = (
  env: Env,
  input: {
    companyId: string;
    company: BootstrapCompanyInput;
    outletId?: string | null;
    outlet?: BootstrapOutletInput;
    userId: string;
    user: BootstrapSuperAdminInput;
    passwordHash: string;
    passwordAlgo: string;
    roleId: string;
  },
) => {
  const timestamp = now();
  const statements = [
    env.DB.prepare(
      `INSERT INTO companies (id, name, legal_name, logo_url, currency, timezone, status, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, NULL, ?, ?, 'active', ?, ?, NULL)`,
    ).bind(input.companyId, input.company.company_name, input.company.legal_name ?? null, input.company.currency, input.company.timezone, timestamp, timestamp),
  ];

  if (input.outlet && input.outletId) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO outlets (
          id, company_id, name, code, address, phone, manager_user_id, gps_lat, gps_lng,
          status, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 'active', ?, ?, NULL)`,
      ).bind(input.outletId, input.companyId, input.outlet.outlet_name, input.outlet.outlet_code ?? null, timestamp, timestamp),
    );
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO users (
        id, company_id, employee_id, full_name, email, phone, password_hash,
        password_algo, password_updated_at, password_reset_required,
        failed_login_attempts, locked_until, last_password_reset_at,
        two_factor_enabled, status, last_login_at, created_at, updated_at, deleted_at
      ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, 0, 0, NULL, ?, 0, 'active', NULL, ?, ?, NULL)`,
    ).bind(input.userId, input.companyId, input.user.full_name, input.user.email, input.passwordHash, input.passwordAlgo, timestamp, timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO user_roles (id, company_id, user_id, role_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), input.companyId, input.userId, input.roleId, timestamp),
    env.DB.prepare(
      `INSERT INTO audit_logs (
        id, company_id, outlet_id, module, action, severity, entity_type,
        entity_id, employee_id, actor_user_id, actor_role_id, device_id,
        ip_address, user_agent, old_value_json, new_value_json, reason,
        effective_date, approval_request_id, sync_batch_id, created_at
      ) VALUES (?, ?, NULL, 'auth', 'super_admin_bootstrapped', 'high', 'user',
        ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, 'Initial production Super Admin bootstrap',
        NULL, NULL, NULL, ?)`,
    ).bind(crypto.randomUUID(), input.companyId, input.userId, JSON.stringify({ user_id: input.userId, role: "super_admin" }), timestamp),
  );

  return env.DB.batch(statements);
};

export const ensureCompanySuperAdminRole = (
  env: Env,
  companyId: string,
  seedRole: { role_key: string; role_name: string; description: string | null; is_system_role: number },
) => {
  const roleKey = seedRole.role_key.toLowerCase() === "super_admin" ? "super_admin" : seedRole.role_key;

  return run(
    env,
    `INSERT OR IGNORE INTO roles (
      id, company_id, role_key, role_name, description, is_system_role, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      `${companyId}_role_${roleKey}`,
      companyId,
      roleKey,
      seedRole.role_name,
      seedRole.description,
      seedRole.is_system_role,
      now(),
      now(),
    ],
  );
};

const copyOptionalBootstrapDefaults = async (
  env: Env,
  label: string,
  statements: D1PreparedStatement[],
) => {
  if (statements.length === 0) return;

  try {
    await env.DB.batch(statements);
  } catch (error) {
    logOptionalBootstrapDefaultFailure(label, error);
  }
};

export const cloneCompanyDefaults = async (env: Env, companyId: string, company: BootstrapCompanyInput) => {
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO roles (id, company_id, role_key, role_name, description, is_system_role, is_active, created_at, updated_at)
       SELECT ? || '_role_' || role_key, ?, role_key, role_name, description, is_system_role, is_active, ?, ?
       FROM roles WHERE company_id = ?`,
    ).bind(companyId, companyId, timestamp, timestamp, SEED_COMPANY_ID),
  ]);

  await copyOptionalBootstrapDefaults(env, "role_permissions", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO role_permissions (id, company_id, role_id, permission_key, created_at)
       SELECT ? || '_rp_' || r.role_key || '_' || replace(rp.permission_key, '.', '_'), ?, ? || '_role_' || r.role_key, rp.permission_key, ?
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       WHERE rp.company_id = ? AND r.company_id = ?`,
    ).bind(companyId, companyId, companyId, timestamp, SEED_COMPANY_ID, SEED_COMPANY_ID),
  ]);

  await copyOptionalBootstrapDefaults(env, "company_settings", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO company_settings (
        id, company_id, setting_key, setting_group, setting_value_json, effective_from,
        created_by, updated_by, created_at, updated_at
      )
       SELECT ? || '_setting_' || replace(setting_key, '.', '_'), ?, setting_key, setting_group,
         CASE WHEN setting_key = 'company.basic'
           THEN ?
           ELSE setting_value_json
         END,
         effective_from, NULL, NULL, ?, ?
       FROM company_settings WHERE company_id = ?`,
    ).bind(
      companyId,
      companyId,
      JSON.stringify({
        currency: company.currency,
        timezone: company.timezone,
        country: company.country,
        registration_number: company.registration_number,
        default_language: "en",
        date_format: "YYYY-MM-DD",
        time_format: "24h",
      }),
      timestamp,
      timestamp,
      SEED_COMPANY_ID,
    ),
  ]);

  await copyOptionalBootstrapDefaults(env, "feature_settings", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO feature_settings (
        id, company_id, feature_key, feature_name, is_enabled, status,
        applies_to_all_outlets, allowed_outlet_ids_json, allowed_role_ids_json,
        affects_payroll, affects_attendance, affects_leave, affects_roster,
        offline_enabled, audit_enabled, effective_from, created_at, updated_at
      )
       SELECT ? || '_feature_' || feature_key, ?, feature_key, feature_name, is_enabled, status,
        applies_to_all_outlets, allowed_outlet_ids_json, allowed_role_ids_json,
        affects_payroll, affects_attendance, affects_leave, affects_roster,
        offline_enabled, audit_enabled, effective_from, ?, ?
       FROM feature_settings WHERE company_id = ?`,
    ).bind(companyId, companyId, timestamp, timestamp, SEED_COMPANY_ID),
  ]);

  await copyOptionalBootstrapDefaults(env, "approval_workflows", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO approval_workflows (
        id, company_id, workflow_key, workflow_name, module, is_enabled, approval_mode, created_at, updated_at
      )
       SELECT ? || '_workflow_' || workflow_key, ?, workflow_key, workflow_name, module, is_enabled, approval_mode, ?, ?
       FROM approval_workflows WHERE company_id = ?`,
    ).bind(companyId, companyId, timestamp, timestamp, SEED_COMPANY_ID),
  ]);

  await copyOptionalBootstrapDefaults(env, "approval_steps", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO approval_steps (
        id, company_id, workflow_id, step_order, step_name, required_role_key,
        required_permission_key, is_required, approval_type, amount_min, amount_max, created_at, updated_at
      )
       SELECT ? || '_step_' || s.id, ?, ? || '_workflow_' || w.workflow_key,
        s.step_order, s.step_name, s.required_role_key, s.required_permission_key,
        s.is_required, s.approval_type, s.amount_min, s.amount_max, ?, ?
       FROM approval_steps s
       JOIN approval_workflows w ON w.id = s.workflow_id AND w.company_id = s.company_id
       WHERE s.company_id = ?`,
    ).bind(companyId, companyId, companyId, timestamp, timestamp, SEED_COMPANY_ID),
  ]);

  await copyOptionalBootstrapDefaults(env, "approval_thresholds", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO approval_thresholds (
        id, company_id, workflow_key, threshold_name, threshold_type,
        amount_min, amount_max, percentage_min, percentage_max, currency,
        required_roles_json, required_permissions_json, is_active, effective_from,
        created_at, updated_at
      )
       SELECT ? || '_threshold_' || id, ?, workflow_key, threshold_name, threshold_type,
        amount_min, amount_max, percentage_min, percentage_max, currency,
        required_roles_json, required_permissions_json, is_active, effective_from, ?, ?
       FROM approval_thresholds WHERE company_id = ?`,
    ).bind(companyId, companyId, timestamp, timestamp, SEED_COMPANY_ID),
  ]);

  await copyOptionalBootstrapDefaults(env, "leave_types", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO leave_types (
        id, company_id, leave_key, leave_name, is_statutory, is_enabled, is_paid,
        default_days, requires_attachment, affects_payroll, created_at, updated_at
      )
       SELECT ? || '_leave_' || leave_key, ?, leave_key, leave_name, is_statutory, is_enabled, is_paid,
        default_days, requires_attachment, affects_payroll, ?, ?
       FROM leave_types WHERE company_id = ?`,
    ).bind(companyId, companyId, timestamp, timestamp, SEED_COMPANY_ID),
  ]);

  await copyOptionalBootstrapDefaults(env, "document_categories", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO document_categories (
        id, company_id, category_key, category_name, is_sensitive, requires_expiry_date,
        applies_to_foreign_employee, applies_to_local_employee, status, created_at, updated_at
      )
       SELECT ? || '_document_category_' || category_key, ?, category_key, category_name, is_sensitive,
        requires_expiry_date, applies_to_foreign_employee, applies_to_local_employee, status, ?, ?
       FROM document_categories WHERE company_id = ?`,
    ).bind(companyId, companyId, timestamp, timestamp, SEED_COMPANY_ID),
  ]);
};

export const ensureProductionFallbackDefaults = async (env: Env, companyId: string) => {
  const timestamp = now();
  const approvalRules = JSON.stringify({
    approval_workflows_enabled: true,
    approval_mode: "auto_admin_superadmin",
    require_approval_if_only_admin_superadmin_exist: false,
    auto_approve_for_admin_superadmin: true,
    require_reason_when_approvals_disabled: true,
    audit_when_approvals_disabled: true,
  });
  const features = [
    ["employee_management", "Employee Management"],
    ["user_management", "User Management"],
    ["settings", "Settings"],
    ["audit_logs", "Audit Logs"],
    ["documents", "Documents"],
    ["asset_tracking", "Asset Tracking"],
    ["uniform_tracking", "Uniform Tracking"],
    ["leave_management", "Leave Management"],
    ["payroll", "Payroll"],
    ["attendance", "Attendance"],
    ["approvals", "Approvals"],
    ["operation_ownership", "Operation Ownership"],
    ["payroll_adjustments", "Payroll Adjustments"],
    ["advance_salary", "Advance Salary"],
    ["employee_structure_changes", "Employee Structure Changes"],
    ["resignation_offboarding", "Resignation / Offboarding"],
    ["disciplinary_actions", "Disciplinary Actions"],
  ];

  await copyOptionalBootstrapDefaults(env, "fallback_company_settings", [
    env.DB.prepare(
      `INSERT OR IGNORE INTO company_settings (
        id, company_id, setting_key, setting_group, setting_value_json,
        effective_from, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, 'approvals.default_rules', 'approvals', ?, NULL, NULL, NULL, ?, ?)`,
    ).bind(`${companyId}_setting_approvals_default_rules`, companyId, approvalRules, timestamp, timestamp),
  ]);

  await copyOptionalBootstrapDefaults(env, "fallback_feature_settings", [
    ...features.map(([featureKey, featureName]) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO feature_settings (
          id, company_id, feature_key, feature_name, is_enabled, status,
          applies_to_all_outlets, allowed_outlet_ids_json, allowed_role_ids_json,
          affects_payroll, affects_attendance, affects_leave, affects_roster,
          offline_enabled, audit_enabled, effective_from, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 'enabled', 1, NULL, NULL, 0, 0, 0, 0, 0, 1, NULL, ?, ?)`,
      ).bind(`${companyId}_feature_${featureKey}`, companyId, featureKey, featureName, timestamp, timestamp),
    ),
  ]);
};
