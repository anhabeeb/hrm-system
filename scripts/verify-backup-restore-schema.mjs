import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const fail = (message) => {
  throw new Error(`verify:backup-restore-schema failed: ${message}`);
};
const mustInclude = (source, tokens, label) => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`${label} missing ${token}`);
  }
};

const app = read("src/app.ts");
const routes = read("src/routes/backup-recovery.routes.ts");
const service = read("src/modules/backup-recovery/backup-recovery.service.ts");
const snapshot = read("src/modules/backup-recovery/backup-snapshot.service.ts");
const repository = read("src/modules/backup-recovery/backup-recovery.repository.ts");
const validators = read("src/modules/backup-recovery/backup-recovery.validators.ts");
const migration = `${read("migrations/0051_backup_restore_hardening.sql")}\n${read("migrations/0052_backup_restore_stable_inline_content.sql")}`;
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const page = read("frontend/src/features/backup-recovery/BackupRecoveryPage.tsx");
const api = read("frontend/src/features/backup-recovery/backup-recovery.api.ts");
const tests = read("tests/backup-recovery.test.ts");
const packageJson = read("package.json");

if (!app.includes("backupRecoveryRoutes") || !app.includes('"/backup-recovery"')) fail("backup/restore routes are not registered");
mustInclude(routes, [
  '"/backups"',
  '"/backups/:id/generate"',
  '"/backups/:id/download"',
  '"/backups/:id/cancel"',
  '"/restores"',
  '"/restores/:id/validate"',
  '"/restores/:id/preview"',
  '"/restores/:id/apply"',
  '"/restores/:id/cancel"',
  '"/settings"',
  "requireAnyPermission",
], "backup/restore routes");

mustInclude(migration, [
  "ALTER TABLE backup_jobs ADD COLUMN checksum_sha256",
  "ALTER TABLE backup_jobs ADD COLUMN manifest_json",
  "ALTER TABLE backup_jobs ADD COLUMN content_json",
  "CREATE TABLE IF NOT EXISTS restore_jobs",
  "CREATE TABLE IF NOT EXISTS restore_job_rows",
  "idx_backup_jobs_company_status_requested",
  "idx_restore_jobs_company_status_requested",
  "idx_restore_job_rows_company_job_status",
], "backup/restore migration");

mustInclude(snapshot, [
  "BACKUP_SCHEMA_VERSION",
  "manifest",
  "included_tables",
  "excluded_tables",
  "row_counts",
  "overall_checksum",
  "calculateBackupPackageChecksum",
  "calculateTableChecksums",
  "calculateChecksum",
  "sanitizeSensitivePayload",
  "password_hash",
  "session_token",
  "totp_secret",
  "backup_codes_hash_json",
  "device_token",
  "raw_payload",
], "backup manifest/redaction");
if (/MAX_ROWS_PER_TABLE/.test(snapshot) || /LIMIT \?/.test(snapshot)) fail("backup snapshot must not silently truncate rows with a hidden limit");
if (!/total > maxRows/.test(snapshot) || !/BACKUP_TOO_LARGE/.test(snapshot)) fail("backup snapshot must fail safely when a table exceeds maxRows");

mustInclude(repository, [
  "createBackupJob",
  "claimBackupProcessing",
  "completeBackupJob",
  "failBackupJob",
  "cancelBackupJob",
  "createRestoreJob",
  "replaceRestoreRows",
  "markRestoreValidated",
  "claimRestoreApplying",
  "completeRestoreJob",
  "cancelRestoreJob",
], "backup/restore repository");

mustInclude(service, [
  "createBackup",
  "generateBackup",
  "downloadBackup",
  "backupBodyForJob",
  "createRestoreJob",
  "validateRestoreJob",
  "previewRestoreJob",
  "applyRestoreJob",
  "RESTORE_CONFIRMATION_PHRASE",
  "RESTORE_COMPANY_MISMATCH",
  "RESTORE_SCHEMA_INCOMPATIBLE",
  "RESTORE_CONFIRMATION_REQUIRED",
  "RESTORE_CHECKSUM_MISMATCH",
  "BACKUP_CONTENT_NOT_AVAILABLE",
  "SUPPORTED_RESTORE_TABLES",
  "RESTORE_TABLE_UNSUPPORTED",
  "SUPPORTED_APPLY_MODES",
  "content_json",
  "backup_generated",
  "backup_downloaded",
  "restore_applied",
  "storage_location",
  "safeJob",
], "backup/restore service");
if (!/input\.confirmation !== RESTORE_CONFIRMATION_PHRASE/.test(service)) fail("restore apply lacks typed confirmation check");
if (!/manifest\?\.company_id !== context\.companyId/.test(service)) fail("restore validation lacks company mismatch check");
if (/const snapshot = await buildBackupSnapshot[\s\S]*return JSON\.stringify\(snapshot/.test(service)) fail("backupBodyForJob must not regenerate live data for completed backups without stable content");
if (!/job\.content_json/.test(service)) fail("completed backups need stable inline content support when R2 is unavailable");
if (/checksumVerified:\s*manifest\?\.overall_checksum\s*\?\s*1\s*:\s*0/.test(service)) fail("restore validation treats checksum presence as verification");
if (!/calculateBackupPackageChecksum/.test(service) || !/expectedTableChecksums\[table\] !== actualTableChecksums\[table\]/.test(service)) fail("restore validation must compare overall and table checksums");
if (!/status:\s*"skipped"[\s\S]*RESTORE_TABLE_UNSUPPORTED/.test(service)) fail("restore preview must mark unsupported tables as skipped/unsupported");
if (!/SUPPORTED_RESTORE_TABLES\.has\(tableName\)/.test(service)) fail("restore apply must only restore explicitly supported tables");
if (/retention_archive|archive_deleted|purge_expired|data_retention/i.test(`${service}\n${routes}\n${page}`)) fail("Phase 12C retention/archive work appears to be started");

mustInclude(validators, [
  "validateBackupCreate",
  "validateRestoreJobCreate",
  "validateRestoreApply",
  "validateBackupRestoreSettings",
  "RESTORE_MODES",
], "backup/restore validators");

mustInclude(permissions, [
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
], "backup/restore permission seeds");
if (!roles.includes("rp_backup_recovery_admin_")) fail("backup/restore permissions are not assigned to admin roles");

mustInclude(page, [
  "Backup & Restore",
  "Backup Jobs",
  "Restore Jobs",
  "Validate/Preview",
  "RESTORE COMPANY DATA",
  "Destructive restore warning",
  "Settings",
  "backup_recovery.restore.apply",
  "backup_recovery.settings.manage",
], "Backup & Restore page");
mustInclude(api, [
  "generateBackup",
  "cancelBackup",
  "listRestoreJobs",
  "createRestoreJob",
  "validateRestoreJob",
  "previewRestoreJob",
  "applyRestoreJob",
  "getSettings",
  "updateSettings",
], "Backup & Restore frontend API");
if (/dark:/.test(page)) fail("Backup & Restore UI must not add dark mode");
if (/metadata_json|storage_location|file_storage_key/.test(page)) fail("Backup & Restore UI exposes unsafe raw metadata/storage fields");

if (/it\.todo|describe\.todo/.test(tests)) fail("Phase 12B backup/restore tests contain TODO placeholders");
mustInclude(tests, [
  "creates and generates a company-scoped backup manifest with checksum and redaction",
  "fails backup generation instead of silently truncating tables over max row limit",
  "completed full-data backup row counts match stored rows while metadata_only keeps counts without rows",
  "no R2 uses stable inline content or fails safely when inline size is not allowed",
  "completed R2 backup downloads stored content and missing stored body is blocked",
  "cancelled backup cannot generate and failed or expired download is blocked",
  "normal user cannot access backup or restore actions",
  "backup settings can disable generation",
  "creates restore job and validates manifest read-only",
  "restore validation rejects company mismatch",
  "restore validation verifies overall and table checksums before marking checksum_verified",
  "restore validation detects table checksum mismatch even when overall checksum is recalculated",
  "restore validation fails safely when backup checksum is missing",
  "restore apply requires permission, Super Admin, typed confirmation, and is idempotently status-gated",
  "dry-run and unsupported restore modes cannot apply or validate as supported",
], "backup/restore tests");

if (!packageJson.includes("verify:backup-restore-schema")) fail("package.json missing verify:backup-restore-schema");
if (!packageJson.includes("npm run verify:backup-restore-schema")) fail("build:all must run verify:backup-restore-schema");

console.log("verify:backup-restore-schema passed");
