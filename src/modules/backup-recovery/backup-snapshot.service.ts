import type { AuthActor } from "../../types/api.types";
import { sanitizeSensitivePayload } from "../../utils/sanitize";

const count = async (env: Env, table: string, companyId: string) => {
  try {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE company_id = ?`).bind(companyId).first<{ total: number }>();
    return row?.total ?? 0;
  } catch {
    return 0;
  }
};

export const buildBackupSnapshot = async (env: Env, context: AuthActor, backupType: string) => {
  const tables = [
    "employees",
    "outlets",
    "attendance_daily_summary",
    "leave_requests",
    "payroll_runs",
    "assets",
    "employee_documents",
    "approval_requests",
    "export_jobs",
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) counts[table] = await count(env, table, context.companyId);

  return sanitizeSensitivePayload({
    backup_type: backupType,
    company_id: context.companyId,
    created_at: new Date().toISOString(),
    snapshot_type: "metadata_foundation",
    counts,
    note: "This backup stores safe metadata foundation only and excludes secrets, password hashes, token hashes, TOTP secrets, and raw document files.",
  });
};
