import type {
  SetupGuideActivityRecord,
  SetupGuideProgressRecord,
} from "./setup-guide.types";

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

export const ensureProgress = async (env: Env, companyId: string) => {
  const now = new Date().toISOString();
  await execute(
    env,
    `INSERT OR IGNORE INTO setup_guide_progress (
      id, company_id, setup_wizard_completed, setup_wizard_progress_percent,
      setup_wizard_required_steps_count, setup_wizard_completed_steps_count,
      created_at, updated_at
    ) VALUES (?, ?, 0, 0, 0, 0, ?, ?)`,
    [`${companyId}_setup_guide_progress`, companyId, now, now],
  );
};

export const getProgress = (env: Env, companyId: string) =>
  queryOne<SetupGuideProgressRecord>(
    env,
    "SELECT * FROM setup_guide_progress WHERE company_id = ? LIMIT 1",
    [companyId],
  );

export const updateProgress = (
  env: Env,
  companyId: string,
  payload: {
    completed?: boolean;
    completedAt?: string | null;
    completedBy?: string | null;
    skippedAt?: string | null;
    lastStep?: string | null;
    progressPercent: number;
    requiredCount: number;
    completedCount: number;
  },
) =>
  execute(
    env,
    `UPDATE setup_guide_progress
     SET setup_wizard_completed = COALESCE(?, setup_wizard_completed),
         setup_wizard_completed_at = COALESCE(?, setup_wizard_completed_at),
         setup_wizard_completed_by = COALESCE(?, setup_wizard_completed_by),
         setup_wizard_skipped_at = COALESCE(?, setup_wizard_skipped_at),
         setup_wizard_last_step = COALESCE(?, setup_wizard_last_step),
         setup_wizard_progress_percent = ?,
         setup_wizard_required_steps_count = ?,
         setup_wizard_completed_steps_count = ?,
         updated_at = ?
     WHERE company_id = ?`,
    [
      payload.completed === undefined ? null : payload.completed ? 1 : 0,
      payload.completedAt ?? null,
      payload.completedBy ?? null,
      payload.skippedAt ?? null,
      payload.lastStep ?? null,
      payload.progressPercent,
      payload.requiredCount,
      payload.completedCount,
      new Date().toISOString(),
      companyId,
    ],
  );

export const ensureActivity = (
  env: Env,
  payload: {
    companyId: string;
    activityKey: string;
    moduleKey: string | null;
    label: string;
    required: boolean;
    targetRoute: string;
    targetHighlightKey: string;
  },
) => {
  const now = new Date().toISOString();
  return execute(
    env,
    `INSERT OR IGNORE INTO setup_guide_activities (
      id, company_id, activity_key, module_key, activity_label, activity_status,
      activity_required, target_route, target_highlight_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?, ?)`,
    [
      `${payload.companyId}_setup_${payload.activityKey}`,
      payload.companyId,
      payload.activityKey,
      payload.moduleKey,
      payload.label,
      payload.required ? 1 : 0,
      payload.targetRoute,
      payload.targetHighlightKey,
      now,
      now,
    ],
  );
};

export const listActivities = (env: Env, companyId: string) =>
  queryMany<SetupGuideActivityRecord>(
    env,
    "SELECT * FROM setup_guide_activities WHERE company_id = ? ORDER BY created_at, activity_key",
    [companyId],
  );

export const getActivity = (
  env: Env,
  companyId: string,
  activityKey: string,
) =>
  queryOne<SetupGuideActivityRecord>(
    env,
    "SELECT * FROM setup_guide_activities WHERE company_id = ? AND activity_key = ? LIMIT 1",
    [companyId, activityKey],
  );

export const updateActivityStatus = (
  env: Env,
  companyId: string,
  activityKey: string,
  payload: {
    status: string;
    completedAt?: string | null;
    completedBy?: string | null;
    skippedAt?: string | null;
    skipReason?: string | null;
    completionSource?: string | null;
  },
) =>
  execute(
    env,
    `UPDATE setup_guide_activities
     SET activity_status = ?,
         activity_completed_at = COALESCE(?, activity_completed_at),
         activity_completed_by = COALESCE(?, activity_completed_by),
         activity_skipped_at = COALESCE(?, activity_skipped_at),
         activity_skip_reason = COALESCE(?, activity_skip_reason),
         completion_source = COALESCE(?, completion_source),
         updated_at = ?
     WHERE company_id = ? AND activity_key = ?`,
    [
      payload.status,
      payload.completedAt ?? null,
      payload.completedBy ?? null,
      payload.skippedAt ?? null,
      payload.skipReason ?? null,
      payload.completionSource ?? null,
      new Date().toISOString(),
      companyId,
      activityKey,
    ],
  );

export const listEnabledFeatureKeys = async (env: Env, companyId: string) => {
  const rows = await queryMany<{ feature_key: string }>(
    env,
    "SELECT feature_key FROM feature_settings WHERE company_id = ? AND is_enabled = 1 AND status IN ('active', 'enabled')",
    [companyId],
  );
  return new Set(rows.map((row) => row.feature_key));
};

export const countRows = async (
  env: Env,
  sql: string,
  values: readonly unknown[] = [],
): Promise<number> => {
  try {
    const row = await queryOne<{ count: number }>(env, sql, values);
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
};
