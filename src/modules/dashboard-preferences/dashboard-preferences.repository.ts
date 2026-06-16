import type { DashboardPreferenceRecord, DashboardType } from "./dashboard-preferences.types";

export const findPreference = async (
  env: Env,
  companyId: string,
  userId: string,
  dashboardType: DashboardType,
) =>
  env.DB.prepare(
    `SELECT id, company_id, user_id, dashboard_type, layout_json, version, density, created_at, updated_at
       FROM dashboard_user_preferences
      WHERE company_id = ? AND user_id = ? AND dashboard_type = ?
      LIMIT 1`,
  ).bind(companyId, userId, dashboardType).first<DashboardPreferenceRecord>();

export const upsertPreference = async (
  env: Env,
  input: {
    id: string;
    companyId: string;
    userId: string;
    dashboardType: DashboardType;
    layoutJson: string;
    version: number;
    density: string | null;
  },
) => {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO dashboard_user_preferences (
        id, company_id, user_id, dashboard_type, layout_json, version, density, created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, user_id, dashboard_type) DO UPDATE SET
        layout_json = excluded.layout_json,
        version = excluded.version,
        density = excluded.density,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by`,
  ).bind(
    input.id,
    input.companyId,
    input.userId,
    input.dashboardType,
    input.layoutJson,
    input.version,
    input.density,
    now,
    now,
    input.userId,
    input.userId,
  ).run();

  return findPreference(env, input.companyId, input.userId, input.dashboardType);
};

export const deletePreference = async (
  env: Env,
  companyId: string,
  userId: string,
  dashboardType: DashboardType,
) =>
  env.DB.prepare(
    `DELETE FROM dashboard_user_preferences
      WHERE company_id = ? AND user_id = ? AND dashboard_type = ?`,
  ).bind(companyId, userId, dashboardType).run();

export const findLinkedEmployeeId = async (env: Env, companyId: string, userId: string) =>
  env.DB.prepare(
    `SELECT e.id
       FROM users u
       JOIN employees e ON e.company_id = u.company_id AND e.id = u.employee_id
      WHERE u.company_id = ? AND u.id = ?
        AND u.deleted_at IS NULL
        AND e.deleted_at IS NULL
        AND e.archived_at IS NULL
      LIMIT 1`,
  ).bind(companyId, userId).first<{ id: string }>();
