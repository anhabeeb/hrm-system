import type { CompanyRecord } from "./company.types";

const bind = (statement: D1PreparedStatement, values: readonly unknown[]) =>
  statement.bind(...(values as Parameters<D1PreparedStatement["bind"]>));

const one = <T>(env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).first<T>();

const run = (env: Env, sql: string, values: readonly unknown[] = []) =>
  bind(env.DB.prepare(sql), values).run();

export const findCompany = (env: Env, companyId: string) =>
  one<CompanyRecord>(
    env,
    "SELECT * FROM companies WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [companyId],
  );

export const getCompanyProfileSetting = (env: Env, companyId: string) =>
  one<{ setting_value_json: string | null }>(
    env,
    "SELECT setting_value_json FROM company_settings WHERE company_id = ? AND setting_key = 'company.profile' LIMIT 1",
    [companyId],
  );

export const updateCompanyCore = (
  env: Env,
  companyId: string,
  input: {
    name?: string;
    legalName?: string | null;
    logoUrl?: string | null;
    currency?: string;
    timezone?: string;
  },
) =>
  run(
    env,
    `UPDATE companies
     SET name = COALESCE(?, name),
         legal_name = COALESCE(?, legal_name),
         logo_url = COALESCE(?, logo_url),
         currency = COALESCE(?, currency),
         timezone = COALESCE(?, timezone),
         updated_at = ?
     WHERE id = ?`,
    [
      input.name ?? null,
      input.legalName ?? null,
      input.logoUrl ?? null,
      input.currency ?? null,
      input.timezone ?? null,
      new Date().toISOString(),
      companyId,
    ],
  );

export const upsertCompanyProfileSetting = (
  env: Env,
  companyId: string,
  valueJson: string,
  actorUserId: string,
) =>
  run(
    env,
    `INSERT INTO company_settings (
      id, company_id, setting_key, setting_group, setting_value_json,
      effective_from, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, 'company.profile', 'company', ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(company_id, setting_key) DO UPDATE SET
      setting_group = excluded.setting_group,
      setting_value_json = excluded.setting_value_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at`,
    [
      `setting_${companyId}_company_profile`,
      companyId,
      valueJson,
      actorUserId,
      actorUserId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
