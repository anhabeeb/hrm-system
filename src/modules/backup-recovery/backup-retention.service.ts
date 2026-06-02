import * as repository from "./backup-recovery.repository";
import type { RetentionPolicyInput } from "./backup-recovery.types";

const fallback = {
  retention_days: 90,
  keep_monthly_count: 12,
  keep_yearly_count: 3,
  auto_delete_enabled: false,
};

export const getRetentionPolicy = async (env: Env, companyId: string) => {
  const row = await repository.getSetting(env, companyId, "backup.retention_policy");
  if (!row?.setting_value_json) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.setting_value_json) };
  } catch {
    return fallback;
  }
};

export const updateRetentionPolicy = async (env: Env, companyId: string, input: RetentionPolicyInput) => {
  const current = await getRetentionPolicy(env, companyId);
  const updated = {
    ...current,
    ...(input.retention_days !== undefined ? { retention_days: input.retention_days } : {}),
    ...(input.keep_monthly_count !== undefined ? { keep_monthly_count: input.keep_monthly_count } : {}),
    ...(input.keep_yearly_count !== undefined ? { keep_yearly_count: input.keep_yearly_count } : {}),
    ...(input.auto_delete_enabled !== undefined ? { auto_delete_enabled: input.auto_delete_enabled } : {}),
  };
  await repository.upsertSetting(env, companyId, "backup.retention_policy", "backup", JSON.stringify(updated));
  return updated;
};
