import type { AuthActor } from "../../types/api.types";
import { sanitizeSensitivePayload } from "../../utils/sanitize";
import { AppError } from "../../utils/errors";
import { BACKUP_SCHEMA_VERSION } from "./backup-recovery.constants";

const SAFE_BACKUP_TABLES = [
  "companies",
  "company_settings",
  "outlets",
  "departments",
  "positions",
  "roles",
  "role_permissions",
  "users",
  "user_roles",
  "employees",
  "employee_documents",
  "employee_contracts",
  "attendance_events",
  "attendance_daily_summary",
  "roster_shifts",
  "roster_conflicts",
  "biometric_devices",
  "leave_types",
  "leave_balances",
  "leave_balance_transactions",
  "leave_requests",
  "approval_requests",
  "long_leave_requests",
  "long_leave_payroll_impacts",
  "holidays",
  "holiday_settings",
  "payroll_runs",
  "payroll_records",
  "payslips",
  "employee_salary_history",
  "advance_payments",
  "salary_loans",
  "assets",
  "asset_assignments",
  "uniform_issues",
  "notifications",
  "notification_preferences",
  "email_notifications",
  "email_notification_preferences",
  "expiry_alerts",
  "import_jobs",
  "export_jobs",
  "report_export_jobs",
] as const;

const EXCLUDED_TABLES = [
  "sessions",
  "auth_sessions",
  "password_reset_tokens",
  "user_two_factor",
  "device_auth_tokens",
  "biometric_templates",
  "system_error_logs",
] as const;

const companyClause = (table: string) => table === "companies" ? "id = ?" : "company_id = ?";

const queryRows = async (env: Env, table: string, companyId: string, includeRows: boolean, maxRows: number) => {
  try {
    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${companyClause(table)}`).bind(companyId).first<{ total: number }>();
    const total = countRow?.total ?? 0;
    if (!includeRows) return { total, rows: [] as Record<string, unknown>[] };
    if (total > maxRows) {
      throw new AppError(`Backup table ${table} has ${total} rows, which exceeds the safe limit of ${maxRows}.`, "BACKUP_TOO_LARGE", 413);
    }
    const result = await env.DB.prepare(`SELECT * FROM ${table} WHERE ${companyClause(table)}`).bind(companyId).all<Record<string, unknown>>();
    return { total, rows: (result.results ?? []).map((row) => sanitizeSensitivePayload(row) as Record<string, unknown>) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    return { total: 0, rows: [] as Record<string, unknown>[], missing: true };
  }
};

export const calculateChecksum = async (content: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const stripManifestChecksums = (manifest: Record<string, unknown>) => {
  const { table_checksums: _tableChecksums, overall_checksum: _overallChecksum, ...withoutChecksums } = manifest;
  return withoutChecksums;
};

export const calculateBackupPackageChecksum = (backupPackage: { manifest: Record<string, unknown>; tables: Record<string, unknown> }) =>
  calculateChecksum(JSON.stringify({ manifest: stripManifestChecksums(backupPackage.manifest), tables: backupPackage.tables }));

export const calculateTableChecksums = async (tables: Record<string, { rows?: Record<string, unknown>[] }>) => {
  const tableChecksums: Record<string, string> = {};
  for (const [table, tablePayload] of Object.entries(tables)) {
    tableChecksums[table] = await calculateChecksum(JSON.stringify(tablePayload.rows ?? []));
  }
  return tableChecksums;
};

export const buildBackupSnapshot = async (env: Env, context: AuthActor, backupType: string, options: { includeAuditLogs?: boolean; includeDocumentMetadata?: boolean; includeNotificationHistory?: boolean; maxRows?: number } = {}) => {
  const includeRows = backupType !== "metadata_only" && backupType !== "metadata";
  const maxRows = Math.max(1, Number(options.maxRows ?? 5000));
  const requestedTables = SAFE_BACKUP_TABLES.filter((table) => {
    if (!options.includeDocumentMetadata && table === "employee_documents") return false;
    if (!options.includeNotificationHistory && ["notifications", "notification_preferences", "email_notifications", "email_notification_preferences"].includes(table)) return false;
    return true;
  });
  const tables: Record<string, { row_count: number; rows: Record<string, unknown>[]; missing?: boolean }> = {};
  const rowCounts: Record<string, number> = {};
  for (const table of requestedTables) {
    const result = await queryRows(env, table, context.companyId, includeRows, maxRows);
    tables[table] = { row_count: result.total, rows: result.rows, missing: result.missing };
    rowCounts[table] = result.total;
  }
  if (options.includeAuditLogs) {
    const audit = await queryRows(env, "audit_logs", context.companyId, includeRows, maxRows);
    tables.audit_logs = { row_count: audit.total, rows: audit.rows, missing: audit.missing };
    rowCounts.audit_logs = audit.total;
  }

  const tableNames = Object.keys(tables);
  const redactionSummary = {
    excluded_fields: ["password_hash", "session_token", "reset_token", "totp_secret", "backup_codes_hash_json", "device_token", "secret_encrypted", "file_key", "storage_location", "raw_payload"],
    redaction: "Sensitive keys are replaced with [REDACTED]. Raw R2 files and biometric templates are excluded.",
  };
  const manifest = {
    app: "HRM System",
    backup_schema_version: BACKUP_SCHEMA_VERSION,
    application_version: "0.1.0",
    company_id: context.companyId,
    company_name: context.companyId,
    backup_type: backupType,
    created_at: new Date().toISOString(),
    created_by: context.actorUserId,
    included_tables: tableNames,
    excluded_tables: [...EXCLUDED_TABLES],
    row_counts: rowCounts,
    redaction_summary: redactionSummary,
    compatibility_notes: ["Cloudflare Workers/D1 JSON backup package", "Document binaries are not embedded"],
  };
  const tableChecksums = await calculateTableChecksums(tables);
  const overallChecksum = await calculateBackupPackageChecksum({ manifest, tables });
  const finalManifest = { ...manifest, table_checksums: tableChecksums, overall_checksum: overallChecksum };
  return sanitizeSensitivePayload({ manifest: finalManifest, tables, redaction_summary: redactionSummary }) as {
    manifest: typeof finalManifest;
    tables: typeof tables;
    redaction_summary: typeof redactionSummary;
  };
};
