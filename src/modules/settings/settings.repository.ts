import type {
  ApprovalThresholdFilters,
  ApprovalThresholdRecord,
  CompanySettingRecord,
  FeatureSettingRecord,
  SettingsChangeLogFilters,
  SettingsChangeLogRecord,
  UpdateApprovalThresholdInput,
} from "./settings.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const queryOne = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T | null> => bind(env.DB.prepare(sql), values).first<T>();

const queryMany = async <T>(
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await bind(env.DB.prepare(sql), values).all<T>();
  return result.results ?? [];
};

const execute = async (
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
) => bind(env.DB.prepare(sql), values).run();

const appendFilters = (
  baseSql: string,
  filters: Record<string, string | number | undefined>,
  mapping: Record<string, string>,
) => {
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") {
      continue;
    }

    clauses.push(mapping[key]);
    values.push(value);
  }

  return {
    sql: clauses.length > 0 ? `${baseSql} AND ${clauses.join(" AND ")}` : baseSql,
    values,
  };
};

export const getFeatureSetting = (
  env: Env,
  companyId: string,
  featureKey: string,
): Promise<FeatureSettingRecord | null> =>
  queryOne<FeatureSettingRecord>(
    env,
    "SELECT * FROM feature_settings WHERE company_id = ? AND feature_key = ? LIMIT 1",
    [companyId, featureKey],
  );

export const listFeatureSettings = (
  env: Env,
  companyId: string,
): Promise<FeatureSettingRecord[]> =>
  queryMany<FeatureSettingRecord>(
    env,
    "SELECT * FROM feature_settings WHERE company_id = ? ORDER BY feature_name",
    [companyId],
  );

export const getSetting = (
  env: Env,
  companyId: string,
  settingKey: string,
): Promise<CompanySettingRecord | null> =>
  queryOne<CompanySettingRecord>(
    env,
    "SELECT * FROM company_settings WHERE company_id = ? AND setting_key = ? LIMIT 1",
    [companyId, settingKey],
  );

export const listSettings = (
  env: Env,
  companyId: string,
): Promise<CompanySettingRecord[]> =>
  queryMany<CompanySettingRecord>(
    env,
    "SELECT * FROM company_settings WHERE company_id = ? ORDER BY setting_group, setting_key",
    [companyId],
  );

export const getSettingsGroup = (
  env: Env,
  companyId: string,
  settingGroup: string,
): Promise<CompanySettingRecord[]> =>
  queryMany<CompanySettingRecord>(
    env,
    "SELECT * FROM company_settings WHERE company_id = ? AND setting_group = ? ORDER BY setting_key",
    [companyId, settingGroup],
  );

export const getSettingByGroupAndKey = (
  env: Env,
  companyId: string,
  settingGroup: string,
  settingKey: string,
): Promise<CompanySettingRecord | null> =>
  queryOne<CompanySettingRecord>(
    env,
    "SELECT * FROM company_settings WHERE company_id = ? AND setting_group = ? AND setting_key = ? LIMIT 1",
    [companyId, settingGroup, settingKey],
  );

export const upsertSetting = (
  env: Env,
  payload: {
    id: string;
    companyId: string;
    settingKey: string;
    settingGroup: string;
    valueJson: string;
    effectiveFrom?: string;
    actorUserId: string;
  },
) =>
  execute(
    env,
    `INSERT INTO company_settings (
      id, company_id, setting_key, setting_group, setting_value_json,
      effective_from, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, setting_key) DO UPDATE SET
      setting_group = excluded.setting_group,
      setting_value_json = excluded.setting_value_json,
      effective_from = excluded.effective_from,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at`,
    [
      payload.id,
      payload.companyId,
      payload.settingKey,
      payload.settingGroup,
      payload.valueJson,
      payload.effectiveFrom ?? null,
      payload.actorUserId,
      payload.actorUserId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );

export const updateSetting = (
  env: Env,
  companyId: string,
  settingKey: string,
  valueJson: string,
  actorUserId: string,
) =>
  execute(
    env,
    "UPDATE company_settings SET setting_value_json = ?, updated_by = ?, updated_at = ? WHERE company_id = ? AND setting_key = ?",
    [valueJson, actorUserId, new Date().toISOString(), companyId, settingKey],
  );

export const createSettingsChangeLog = (
  env: Env,
  payload: {
    id: string;
    companyId: string;
    settingGroup: string;
    settingKey: string;
    oldValueJson: string | null;
    newValueJson: string | null;
    changedBy: string;
    reason: string;
    effectiveDate?: string;
    version: number;
  },
) =>
  execute(
    env,
    `INSERT INTO settings_change_log (
      id, company_id, setting_group, setting_key, old_value_json,
      new_value_json, changed_by, reason, effective_date, version, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id,
      payload.companyId,
      payload.settingGroup,
      payload.settingKey,
      payload.oldValueJson,
      payload.newValueJson,
      payload.changedBy,
      payload.reason,
      payload.effectiveDate ?? null,
      payload.version,
      new Date().toISOString(),
    ],
  );

export const listSettingsChangeLog = (
  env: Env,
  companyId: string,
  filters: SettingsChangeLogFilters,
): Promise<SettingsChangeLogRecord[]> => {
  const query = appendFilters(
    "SELECT * FROM settings_change_log WHERE company_id = ?",
    {
      date_from: filters.date_from,
      date_to: filters.date_to,
      setting_group: filters.setting_group,
      setting_key: filters.setting_key,
      changed_by: filters.changed_by,
      effective_date: filters.effective_date,
    },
    {
      date_from: "created_at >= ?",
      date_to: "created_at <= ?",
      setting_group: "setting_group = ?",
      setting_key: "setting_key = ?",
      changed_by: "changed_by = ?",
      effective_date: "effective_date = ?",
    },
  );

  return queryMany<SettingsChangeLogRecord>(
    env,
    `${query.sql} ORDER BY created_at DESC LIMIT 100`,
    [companyId, ...query.values],
  );
};

export const updateFeatureSetting = (
  env: Env,
  payload: {
    companyId: string;
    featureKey: string;
    isEnabled?: boolean;
    status?: string;
    appliesToAllOutlets?: boolean;
    allowedOutletIdsJson?: string | null;
    allowedRoleIdsJson?: string | null;
    effectiveFrom?: string;
  },
) =>
  execute(
    env,
    `UPDATE feature_settings
     SET is_enabled = COALESCE(?, is_enabled),
         status = COALESCE(?, status),
         applies_to_all_outlets = COALESCE(?, applies_to_all_outlets),
         allowed_outlet_ids_json = ?,
         allowed_role_ids_json = ?,
         effective_from = COALESCE(?, effective_from),
         updated_at = ?
     WHERE company_id = ? AND feature_key = ?`,
    [
      payload.isEnabled === undefined ? null : payload.isEnabled ? 1 : 0,
      payload.status ?? null,
      payload.appliesToAllOutlets === undefined
        ? null
        : payload.appliesToAllOutlets
          ? 1
          : 0,
      payload.allowedOutletIdsJson ?? null,
      payload.allowedRoleIdsJson ?? null,
      payload.effectiveFrom ?? null,
      new Date().toISOString(),
      payload.companyId,
      payload.featureKey,
    ],
  );

export const listApprovalThresholds = (
  env: Env,
  companyId: string,
  filters: ApprovalThresholdFilters,
): Promise<ApprovalThresholdRecord[]> => {
  const query = appendFilters(
    "SELECT * FROM approval_thresholds WHERE company_id = ?",
    {
      workflow_key: filters.workflow_key,
      threshold_type: filters.threshold_type,
      is_active: filters.is_active === undefined ? undefined : filters.is_active ? 1 : 0,
    },
    {
      workflow_key: "workflow_key = ?",
      threshold_type: "threshold_type = ?",
      is_active: "is_active = ?",
    },
  );

  return queryMany<ApprovalThresholdRecord>(
    env,
    `${query.sql} ORDER BY workflow_key, threshold_name`,
    [companyId, ...query.values],
  );
};

export const getApprovalThresholdById = (
  env: Env,
  companyId: string,
  id: string,
): Promise<ApprovalThresholdRecord | null> =>
  queryOne<ApprovalThresholdRecord>(
    env,
    "SELECT * FROM approval_thresholds WHERE company_id = ? AND id = ? LIMIT 1",
    [companyId, id],
  );

export const updateApprovalThreshold = (
  env: Env,
  companyId: string,
  thresholdId: string,
  input: UpdateApprovalThresholdInput,
) =>
  execute(
    env,
    `UPDATE approval_thresholds
     SET threshold_name = COALESCE(?, threshold_name),
         threshold_type = COALESCE(?, threshold_type),
         amount_min = ?,
         amount_max = ?,
         percentage_min = ?,
         percentage_max = ?,
         currency = COALESCE(?, currency),
         required_roles_json = ?,
         required_permissions_json = ?,
         is_active = COALESCE(?, is_active),
         effective_from = COALESCE(?, effective_from),
         updated_at = ?
     WHERE company_id = ? AND id = ?`,
    [
      input.threshold_name ?? null,
      input.threshold_type ?? null,
      input.amount_min ?? null,
      input.amount_max ?? null,
      input.percentage_min ?? null,
      input.percentage_max ?? null,
      input.currency ?? null,
      input.required_roles_json ? JSON.stringify(input.required_roles_json) : null,
      input.required_permissions_json
        ? JSON.stringify(input.required_permissions_json)
        : null,
      input.is_active === undefined ? null : input.is_active ? 1 : 0,
      input.effective_from ?? null,
      new Date().toISOString(),
      companyId,
      thresholdId,
    ],
  );

export const createApprovalThresholdHistory = (
  env: Env,
  payload: {
    id: string;
    companyId: string;
    thresholdId: string;
    oldValueJson: string;
    newValueJson: string;
    changedBy: string;
    approvedBy?: string;
    changeReason: string;
    status?: string;
    effectiveFrom?: string;
  },
) =>
  execute(
    env,
    `INSERT INTO approval_threshold_history (
      id, company_id, threshold_id, old_value_json, new_value_json,
      changed_by, approved_by, change_reason, status, effective_from, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.id,
      payload.companyId,
      payload.thresholdId,
      payload.oldValueJson,
      payload.newValueJson,
      payload.changedBy,
      payload.approvedBy ?? null,
      payload.changeReason,
      payload.status ?? "active",
      payload.effectiveFrom ?? null,
      new Date().toISOString(),
    ],
  );
