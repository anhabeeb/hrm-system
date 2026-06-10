import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { BACKUP_SCHEMA_VERSION, RESTORE_CONFIRMATION_PHRASE } from "../src/modules/backup-recovery/backup-recovery.constants";
import { calculateBackupPackageChecksum } from "../src/modules/backup-recovery/backup-snapshot.service";
import { validateBackupCreate, validateBackupRestoreSettings, validateReason, validateRestoreApply, validateRestoreJobCreate } from "../src/modules/backup-recovery/backup-recovery.validators";
import * as service from "../src/modules/backup-recovery/backup-recovery.service";
import type { AuthActor } from "../src/types/api.types";
import { ValidationError } from "../src/utils/errors";

const permissions = [
  "backup_recovery.view",
  "backup_recovery.backup.create",
  "backup_recovery.backup.generate",
  "backup_recovery.backup.download",
  "backup_recovery.backup.cancel",
  "backup_recovery.restore.create",
  "backup_recovery.restore.preview",
  "backup_recovery.restore.apply",
  "backup_recovery.restore.cancel",
  "backup_recovery.settings.manage",
  "backup_recovery.audit.view",
  "backup.view",
  "backup.view_history",
  "backup.create",
  "backup.download",
  "backup.restore_request",
  "backup.restore_approve",
  "backup.manage_settings",
];

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_admin",
  fullName: "Admin",
  email: "admin@example.test",
  roles: ["Super Admin"],
  roleKeys: ["super_admin"],
  permissions,
  outletIds: [],
  isAdmin: true,
  isSuperAdmin: true,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

type Call = { sql: string; values: unknown[]; method: "first" | "all" | "run" | "batch" };

const makeEnv = (options: { companyId?: string; backupCompanyId?: string; noBucket?: boolean; backupStatus?: string; settings?: Record<string, unknown>; tableRows?: Record<string, any[]> } = {}) => {
  const calls: Call[] = [];
  const objects = new Map<string, string>();
  let backupJob: any | null = null;
  let restoreJob: any | null = null;
  let restoreRows: any[] = [];
  const companyId = options.companyId ?? "company_1";
  const tableRows: Record<string, any[]> = {
    companies: [{ id: companyId, name: "Cafe", password_hash: "secret" }],
    company_settings: [{ id: "setting_1", company_id: companyId, setting_key: "timezone", setting_value_json: "{\"tz\":\"MVT\"}", secret_token: "hidden" }],
    employees: [{ id: "emp_1", company_id: companyId, employee_code: "EMP-001", full_name: "Aisha", passport_number: "P123" }],
    users: [{ id: "user_1", company_id: companyId, email: "user@example.test", password_hash: "hash", session_token_hash: "session" }],
    employee_documents: [{ id: "doc_1", company_id: companyId, employee_id: "emp_1", file_key: "r2/raw", document_type: "passport" }],
    ...(options.tableRows ?? {}),
  };

  const firstFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "first" });
    if (sql.includes("FROM company_settings") && sql.includes("setting_key")) return options.settings ? { setting_value_json: JSON.stringify(options.settings) } : null;
    if (sql.includes("COUNT(*) AS total FROM")) {
      const table = sql.match(/FROM\s+([a-zA-Z0-9_]+)/)?.[1] ?? "";
      return { total: tableRows[table]?.length ?? 0 };
    }
    if (sql.includes("FROM backup_jobs") && sql.includes("idempotency_key")) return backupJob?.idempotency_key === values[1] ? backupJob : null;
    if (sql.includes("FROM backup_jobs") && sql.includes("id = ?")) return backupJob?.company_id === values[0] && backupJob.id === values[1] ? backupJob : null;
    if (sql.includes("FROM restore_jobs") && sql.includes("id = ?")) return restoreJob?.company_id === values[0] && restoreJob.id === values[1] ? restoreJob : null;
    if (sql.includes("latest_backup_at")) return backupJob ? { latest_backup_at: backupJob.completed_at, latest_backup_status: backupJob.status } : null;
    if (sql.includes("COUNT(*) AS total") && sql.includes("status = 'failed'")) return { total: backupJob?.status === "failed" ? 1 : 0 };
    return null;
  };

  const allFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "all" });
    if (sql.includes("FROM backup_jobs")) return { results: backupJob ? [backupJob] : [] };
    if (sql.includes("FROM restore_jobs")) return { results: restoreJob ? [restoreJob] : [] };
    if (sql.includes("SELECT * FROM")) {
      const table = sql.match(/FROM\s+([a-zA-Z0-9_]+)/)?.[1] ?? "";
      const wantedCompany = String(values[0]);
      return { results: (tableRows[table] ?? []).filter((row) => table === "companies" ? row.id === wantedCompany : row.company_id === wantedCompany) };
    }
    return { results: [] };
  };

  const runFor = async (sql: string, values: unknown[]) => {
    calls.push({ sql, values, method: "run" });
    let changes = 1;
    if (sql.includes("INSERT INTO backup_jobs")) {
      backupJob = {
        id: values[0],
        company_id: values[1],
        backup_type: values[2],
        status: options.backupStatus ?? values[3],
        storage_location: values[4],
        file_name: values[5],
        file_size: values[6],
        started_by: values[7],
        requested_by: values[10],
        requested_at: values[11],
        manifest_json: values[12],
        idempotency_key: values[13],
        metadata_json: values[14],
        created_at: values[9],
        updated_at: values[15],
      };
    } else if (sql.includes("SET status = 'processing'")) {
      changes = ["pending", "failed"].includes(String(backupJob?.status)) ? 1 : 0;
      if (changes) backupJob.status = "processing";
    } else if (sql.includes("SET status = 'completed'")) {
      changes = backupJob?.status === "processing" ? 1 : 0;
      if (changes) {
        backupJob.status = "completed";
        backupJob.storage_location = values[0];
        backupJob.file_name = values[1];
        backupJob.file_size = values[2];
        backupJob.checksum_sha256 = values[3];
        backupJob.manifest_json = values[4];
        backupJob.table_count = values[5];
        backupJob.row_count = values[6];
        backupJob.included_tables_json = values[7];
        backupJob.excluded_tables_json = values[8];
        backupJob.redaction_summary_json = values[9];
        backupJob.completed_at = values[10];
        backupJob.expires_at = values[11];
        backupJob.content_json = values[12];
      }
    } else if (sql.includes("SET status = 'failed'") && sql.includes("backup_jobs")) {
      if (backupJob) {
        backupJob.status = "failed";
        backupJob.failed_at = values[0];
        backupJob.failure_code = values[1];
        backupJob.failure_message = values[2];
        backupJob.error_message = values[3];
      }
    } else if (sql.includes("SET status = 'cancelled'") && sql.includes("backup_jobs")) {
      backupJob.status = "cancelled";
    } else if (sql.includes("INSERT INTO restore_jobs")) {
      restoreJob = {
        id: values[0],
        company_id: values[1],
        backup_job_id: values[2],
        source_file_name: values[3],
        status: "uploaded",
        restore_mode: values[4],
        requested_by: values[5],
        requested_at: values[6],
        metadata_json: values[7],
      };
    } else if (sql.includes("UPDATE restore_jobs SET status = ?") && sql.includes("restored_rows")) {
      if (restoreJob) {
        restoreJob.status = values[0];
        restoreJob.restored_at = values[1];
        restoreJob.restored_rows = values[2];
        restoreJob.skipped_rows = values[3];
        restoreJob.failed_rows = values[4];
        restoreJob.failure_code = values[5];
      }
    } else if (sql.includes("UPDATE restore_jobs SET status = ?")) {
      if (restoreJob) {
        restoreJob.status = values[0];
        restoreJob.validated_at = values[1];
        restoreJob.total_tables = values[2];
        restoreJob.total_rows = values[3];
        restoreJob.valid_rows = values[4];
        restoreJob.invalid_rows = values[5];
        restoreJob.conflict_rows = values[6];
        restoreJob.checksum_verified = values[7];
        restoreJob.manifest_verified = values[8];
        restoreJob.failure_code = values[9];
      }
    } else if (sql.includes("SET status = 'restoring'")) {
      changes = restoreJob?.status === "preview_ready" ? 1 : 0;
      if (changes) restoreJob.status = "restoring";
    } else if (sql.includes("INSERT OR IGNORE INTO company_settings") || sql.includes("INSERT OR REPLACE INTO company_settings")) {
      // business restore write captured by calls
    }
    return { success: true, meta: { changes } };
  };

  const statement = (sql: string) => ({
    bind: (...values: unknown[]) => ({ first: () => firstFor(sql, values), all: () => allFor(sql, values), run: () => runFor(sql, values), sql, values }),
  });

  const env = {
    DB: {
      prepare: statement,
      batch: async (statements: Array<{ sql: string; values: unknown[] }>) => {
        for (const item of statements) {
          calls.push({ sql: item.sql, values: item.values, method: "batch" });
          if (item.sql.includes("DELETE FROM restore_job_rows")) restoreRows = [];
          if (item.sql.includes("INSERT INTO restore_job_rows")) restoreRows.push({ id: item.values[0], table_name: item.values[3], status: item.values[7], action: item.values[8], error_code: item.values[9] });
        }
        return statements.map(() => ({ success: true, meta: { changes: 1 } }));
      },
    },
    BACKUP_BUCKET: options.noBucket ? undefined : {
      put: async (key: string, body: string) => objects.set(key, body),
      get: async (key: string) => objects.has(key) ? { body: objects.get(key), text: async () => objects.get(key) ?? "" } : null,
    },
    __calls: calls,
    __state: () => ({ backupJob, restoreJob, restoreRows, objects, tableRows }),
  };
  return env as unknown as Env & { __calls: Call[]; __state: () => { backupJob: any; restoreJob: any; restoreRows: any[]; objects: Map<string, string>; tableRows: Record<string, any[]> } };
};

describe("Phase 12B Backup / Restore hardening", () => {
  it("validates backup creation, restore jobs, typed confirmation, and settings", () => {
    expect(validateBackupCreate({ backup_type: "company_data", reason: "Manual backup" }).backup_type).toBe("company_data");
    expect(validateRestoreJobCreate({ backup_job_id: "backup_1", restore_mode: "dry_run", reason: "Preview" }).restore_mode).toBe("dry_run");
    expect(validateRestoreApply({ confirmation: RESTORE_CONFIRMATION_PHRASE, reason: "Restore approved" }).confirmation).toBe(RESTORE_CONFIRMATION_PHRASE);
    expect(validateBackupRestoreSettings({ backup_enabled: true, reason: "Settings review" }).backup_enabled).toBe(true);
    expect(() => validateReason({ reason: "" })).toThrow(ValidationError);
  });

  it("creates and generates a company-scoped backup manifest with checksum and redaction", async () => {
    const env = makeEnv();
    const result = await service.createBackup(env, actor(), { backup_type: "company_data", include_document_metadata: true, reason: "Manual backup" });
    expect(result.backup_job.status).toBe("completed");
    const stored = [...env.__state().objects.values()][0];
    const parsed = JSON.parse(stored);
    expect(parsed.manifest.backup_schema_version).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.manifest.company_id).toBe("company_1");
    expect(parsed.manifest.overall_checksum).toBeTruthy();
    expect(parsed.tables.users.rows[0].password_hash).toBe("[REDACTED]");
    expect(parsed.tables.users.rows[0].session_token_hash).toBe("[REDACTED]");
    expect(parsed.tables.employee_documents.rows[0].file_key).toBe("[REDACTED]");
    expect(JSON.stringify(parsed)).not.toContain('"password_hash":"hash"');
    expect(JSON.stringify(parsed)).not.toContain('"session_token_hash":"session"');
    expect(JSON.stringify(parsed)).not.toContain("r2/raw");
    expect(env.__calls.some((call) => call.sql.includes("INSERT INTO audit_logs"))).toBe(true);
  });

  it("fails backup generation instead of silently truncating tables over max row limit", async () => {
    const env = makeEnv({
      settings: { max_backup_rows: 2 },
      tableRows: {
        employees: [
          { id: "emp_1", company_id: "company_1", employee_code: "EMP-001" },
          { id: "emp_2", company_id: "company_1", employee_code: "EMP-002" },
          { id: "emp_3", company_id: "company_1", employee_code: "EMP-003" },
        ],
      },
    });
    await expect(service.createBackup(env, actor(), { backup_type: "company_data", reason: "Too large" })).rejects.toMatchObject({ code: "BACKUP_TOO_LARGE" });
    expect(env.__state().backupJob.status).toBe("failed");
    expect(env.__state().backupJob.failure_code).toBe("BACKUP_TOO_LARGE");
  });

  it("completed full-data backup row counts match stored rows while metadata_only keeps counts without rows", async () => {
    const fullEnv = makeEnv();
    await service.createBackup(fullEnv, actor(), { backup_type: "company_data", include_document_metadata: true, reason: "Full integrity" });
    const fullBody = [...fullEnv.__state().objects.values()][0];
    const fullParsed = JSON.parse(fullBody);
    for (const [table, payload] of Object.entries<any>(fullParsed.tables)) {
      expect(payload.row_count).toBe(payload.rows.length);
      expect(fullParsed.manifest.row_counts[table]).toBe(payload.rows.length);
    }

    const metaEnv = makeEnv();
    await service.createBackup(metaEnv, actor(), { backup_type: "metadata_only", include_document_metadata: true, reason: "Metadata backup" });
    const metaParsed = JSON.parse([...metaEnv.__state().objects.values()][0]);
    expect(metaParsed.manifest.row_counts.employees).toBe(1);
    expect(metaParsed.tables.employees.rows).toEqual([]);
  });

  it("no R2 uses stable inline content or fails safely when inline size is not allowed", async () => {
    const env = makeEnv({ noBucket: true });
    const created = await service.createBackup(env, actor(), { backup_type: "company_data", reason: "No bucket backup" });
    expect(created.backup_job.status).toBe("completed");
    expect(env.__state().backupJob.content_json).toContain("\"manifest\"");
    env.__state().tableRows.company_settings[0].setting_value_json = "{\"tz\":\"CHANGED\"}";
    const response = await service.downloadBackup(env, actor(), created.backup_job.id);
    const downloaded = await response.text();
    expect(downloaded).toContain("\"manifest\"");
    expect(downloaded).toContain("MVT");
    expect(downloaded).not.toContain("CHANGED");
    expect(env.__state().backupJob.storage_location).toBeNull();

    const tooLargeEnv = makeEnv({ noBucket: true, settings: { max_backup_size: 10 } });
    await expect(service.createBackup(tooLargeEnv, actor(), { backup_type: "company_data", reason: "No inline room" })).rejects.toMatchObject({ code: "BACKUP_TOO_LARGE" });
    expect(tooLargeEnv.__state().backupJob.status).toBe("failed");
  });

  it("completed R2 backup downloads stored content and missing stored body is blocked", async () => {
    const env = makeEnv();
    const created = await service.createBackup(env, actor(), { backup_type: "company_data", reason: "Stored backup" });
    const stored = [...env.__state().objects.values()][0];
    env.__state().tableRows.company_settings[0].setting_value_json = "{\"tz\":\"CHANGED\"}";
    expect(await (await service.downloadBackup(env, actor(), created.backup_job.id)).text()).toBe(stored);
    env.__state().objects.clear();
    await expect(service.downloadBackup(env, actor(), created.backup_job.id)).rejects.toMatchObject({ code: "BACKUP_CONTENT_NOT_AVAILABLE" });
  });

  it("cancelled backup cannot generate and failed or expired download is blocked", async () => {
    const env = makeEnv();
    const created = await service.createBackup(env, actor(), { backup_type: "metadata_only", reason: "Cancel check" });
    await service.cancelBackupJob(env, actor(), created.backup_job.id, "Stop job");
    await expect(service.generateBackup(env, actor(), created.backup_job.id, "Retry")).rejects.toMatchObject({ code: "BACKUP_INVALID_STATUS" });
    env.__state().backupJob.status = "failed";
    await expect(service.downloadBackup(env, actor(), created.backup_job.id)).rejects.toMatchObject({ code: "BACKUP_INVALID_STATUS" });
    env.__state().backupJob.status = "completed";
    env.__state().backupJob.expires_at = "2000-01-01T00:00:00.000Z";
    await expect(service.downloadBackup(env, actor(), created.backup_job.id)).rejects.toMatchObject({ code: "BACKUP_DOWNLOAD_EXPIRED" });
  });

  it("normal user cannot access backup or restore actions", async () => {
    const env = makeEnv();
    const normal = actor({ isAdmin: false, isSuperAdmin: false, roleKeys: ["employee"], permissions: [] });
    await expect(service.createBackup(env, normal, { backup_type: "company_data", reason: "Nope" })).rejects.toMatchObject({ code: "BACKUP_PERMISSION_DENIED" });
  });

  it("backup settings can disable generation", async () => {
    const env = makeEnv({ settings: { backup_enabled: false } });
    await expect(service.createBackup(env, actor(), { backup_type: "company_data", reason: "Disabled" })).rejects.toMatchObject({ code: "BACKUP_DISABLED" });
  });

  it("creates restore job and validates manifest read-only", async () => {
    const env = makeEnv();
    const backup = await service.createBackup(env, actor(), { backup_type: "company_data", reason: "Backup for restore" });
    const restore = await service.createRestoreJob(env, actor(), { backup_job_id: backup.backup_job.id, restore_mode: "dry_run", reason: "Preview restore" });
    const preview = await service.previewRestoreJob(env, actor(), restore.restore_job.id);
    expect(preview.restore_job.status).toBe("preview_ready");
    expect(preview.summary.tables).toBeGreaterThan(0);
    expect(preview.summary.skipped_unsupported_rows).toBeGreaterThan(0);
    expect(env.__state().restoreRows.some((row) => row.table_name === "employees" && row.status === "skipped" && row.error_code === "RESTORE_TABLE_UNSUPPORTED")).toBe(true);
    expect(env.__state().restoreRows.some((row) => row.table_name === "company_settings" && row.status === "valid" && row.action === "skip")).toBe(true);
    expect(env.__calls.some((call) => /INSERT OR (IGNORE|REPLACE) INTO company_settings/.test(call.sql))).toBe(false);
  });

  it("restore validation rejects company mismatch", async () => {
    const env = makeEnv({ backupCompanyId: "other_company" });
    const backup = await service.createBackup(env, actor({ companyId: "other_company" }), { backup_type: "company_data", reason: "Other company backup" });
    env.__state().backupJob.company_id = "company_1";
    const restore = await service.createRestoreJob(env, actor(), { backup_job_id: backup.backup_job.id, restore_mode: "dry_run", reason: "Mismatch preview" });
    const preview = await service.previewRestoreJob(env, actor(), restore.restore_job.id);
    expect(preview.restore_job.status).toBe("validation_failed");
    expect(preview.errors[0].code).toBe("RESTORE_COMPANY_MISMATCH");
  });

  it("restore validation verifies overall and table checksums before marking checksum_verified", async () => {
    const env = makeEnv();
    const backup = await service.createBackup(env, actor(), { backup_type: "company_data", reason: "Checksum backup" });
    const restore = await service.createRestoreJob(env, actor(), { backup_job_id: backup.backup_job.id, restore_mode: "dry_run", reason: "Valid checksum" });
    const valid = await service.validateRestoreJob(env, actor(), restore.restore_job.id);
    expect(valid.restore_job.checksum_verified).toBe(1);

    const key = env.__state().backupJob.storage_location;
    const parsed = JSON.parse(env.__state().objects.get(key) ?? "");
    parsed.tables.company_settings.rows[0].setting_value_json = "{\"tz\":\"TAMPERED\"}";
    env.__state().objects.set(key, JSON.stringify(parsed, null, 2));
    env.__state().restoreJob.status = "uploaded";
    const tampered = await service.validateRestoreJob(env, actor(), restore.restore_job.id);
    expect(tampered.restore_job.status).toBe("validation_failed");
    expect(tampered.errors.some((error) => error.code === "RESTORE_CHECKSUM_MISMATCH")).toBe(true);
    expect(tampered.restore_job.checksum_verified).toBe(0);
  });

  it("restore validation detects table checksum mismatch even when overall checksum is recalculated", async () => {
    const env = makeEnv();
    const backup = await service.createBackup(env, actor(), { backup_type: "company_data", reason: "Table checksum backup" });
    const restore = await service.createRestoreJob(env, actor(), { backup_job_id: backup.backup_job.id, restore_mode: "dry_run", reason: "Table checksum preview" });
    const key = env.__state().backupJob.storage_location;
    const parsed = JSON.parse(env.__state().objects.get(key) ?? "");
    parsed.tables.company_settings.rows[0].setting_value_json = "{\"tz\":\"TABLE_ONLY_TAMPER\"}";
    parsed.manifest.overall_checksum = await calculateBackupPackageChecksum({ manifest: parsed.manifest, tables: parsed.tables });
    env.__state().objects.set(key, JSON.stringify(parsed, null, 2));
    const preview = await service.validateRestoreJob(env, actor(), restore.restore_job.id);
    expect(preview.restore_job.status).toBe("validation_failed");
    expect(preview.errors.some((error) => error.message.includes("company_settings"))).toBe(true);
  });

  it("restore validation fails safely when backup checksum is missing", async () => {
    const env = makeEnv();
    const backup = await service.createBackup(env, actor(), { backup_type: "company_data", reason: "Missing checksum backup" });
    const restore = await service.createRestoreJob(env, actor(), { backup_job_id: backup.backup_job.id, restore_mode: "dry_run", reason: "Missing checksum preview" });
    const key = env.__state().backupJob.storage_location;
    const parsed = JSON.parse(env.__state().objects.get(key) ?? "");
    delete parsed.manifest.overall_checksum;
    env.__state().objects.set(key, JSON.stringify(parsed, null, 2));
    const preview = await service.validateRestoreJob(env, actor(), restore.restore_job.id);
    expect(preview.restore_job.status).toBe("validation_failed");
    expect(preview.errors.some((error) => error.code === "RESTORE_MANIFEST_INVALID")).toBe(true);
  });

  it("restore apply requires permission, Super Admin, typed confirmation, and is idempotently status-gated", async () => {
    const env = makeEnv();
    const backup = await service.createBackup(env, actor(), { backup_type: "company_data", reason: "Apply backup" });
    const restore = await service.createRestoreJob(env, actor(), { backup_job_id: backup.backup_job.id, restore_mode: "insert_missing", reason: "Apply restore" });
    await service.validateRestoreJob(env, actor(), restore.restore_job.id);
    await expect(service.applyRestoreJob(env, actor(), restore.restore_job.id, { confirmation: "WRONG", reason: "Apply" })).rejects.toMatchObject({ code: "RESTORE_CONFIRMATION_REQUIRED" });
    const limited = actor({ isSuperAdmin: false, isAdmin: false, roleKeys: ["hr_admin"], permissions: ["backup_recovery.restore.apply"] });
    await expect(service.applyRestoreJob(env, limited, restore.restore_job.id, { confirmation: RESTORE_CONFIRMATION_PHRASE, reason: "Apply" })).rejects.toMatchObject({ code: "RESTORE_PERMISSION_DENIED" });
    const applied = await service.applyRestoreJob(env, actor(), restore.restore_job.id, { confirmation: RESTORE_CONFIRMATION_PHRASE, reason: "Apply" });
    expect(applied.summary.restored_rows).toBeGreaterThan(0);
    expect(applied.summary.skipped_rows).toBeGreaterThan(0);
    expect(env.__calls.some((call) => /INSERT OR (IGNORE|REPLACE) INTO company_settings/.test(call.sql))).toBe(true);
    expect(env.__calls.some((call) => /INSERT OR (IGNORE|REPLACE) INTO employees/.test(call.sql))).toBe(false);
    await expect(service.applyRestoreJob(env, actor(), restore.restore_job.id, { confirmation: RESTORE_CONFIRMATION_PHRASE, reason: "Again" })).rejects.toMatchObject({ code: "RESTORE_INVALID_STATUS" });
  });

  it("dry-run and unsupported restore modes cannot apply or validate as supported", async () => {
    const dryRunEnv = makeEnv();
    const backup = await service.createBackup(dryRunEnv, actor(), { backup_type: "company_data", reason: "Dry backup" });
    const dryRun = await service.createRestoreJob(dryRunEnv, actor(), { backup_job_id: backup.backup_job.id, restore_mode: "dry_run", reason: "Dry preview" });
    await service.validateRestoreJob(dryRunEnv, actor(), dryRun.restore_job.id);
    await expect(service.applyRestoreJob(dryRunEnv, actor(), dryRun.restore_job.id, { confirmation: RESTORE_CONFIRMATION_PHRASE, reason: "Dry apply" })).rejects.toMatchObject({ code: "RESTORE_MODE_NOT_ALLOWED" });

    const replaceEnv = makeEnv();
    const replaceBackup = await service.createBackup(replaceEnv, actor(), { backup_type: "company_data", reason: "Replace backup" });
    const replace = await service.createRestoreJob(replaceEnv, actor(), { backup_job_id: replaceBackup.backup_job.id, restore_mode: "replace_company_data", reason: "Replace preview" });
    const preview = await service.validateRestoreJob(replaceEnv, actor(), replace.restore_job.id);
    expect(preview.restore_job.status).toBe("validation_failed");
    expect(preview.errors.some((error) => error.code === "RESTORE_MODE_NOT_ALLOWED")).toBe(true);
    await expect(service.applyRestoreJob(replaceEnv, actor(), replace.restore_job.id, { confirmation: RESTORE_CONFIRMATION_PHRASE, reason: "Replace apply" })).rejects.toMatchObject({ code: "RESTORE_MODE_NOT_ALLOWED" });
  });

  it("Backup & Restore frontend/static wiring exists without unsafe raw display", () => {
    const page = readFileSync("frontend/src/features/backup-recovery/BackupRecoveryPage.tsx", "utf8");
    expect(page).toContain("PageActionBar");
    expect(page).toContain("Backup and restore page actions");
    expect(page).toContain("Create backup");
    expect(page).toContain("Create restore job");
    expect(page).toContain("Backup Jobs");
    expect(page).toContain("Restore Jobs");
    expect(page).toContain("Validate/Preview");
    expect(page).toContain("RESTORE COMPANY DATA");
    expect(page).toContain("Settings");
    expect(page).not.toContain("dark:");
    expect(page).not.toContain("storage_location");
  });
});
