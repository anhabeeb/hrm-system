import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const fail = (message) => {
  console.error(`verify:data-retention-schema failed: ${message}`);
  process.exit(1);
};
const assert = (condition, message) => { if (!condition) fail(message); };

const migration = read("migrations/0053_data_retention_archiving.sql");
const service = read("src/modules/data-retention/data-retention.service.ts");
const repository = read("src/modules/data-retention/data-retention.repository.ts");
const routes = read("src/routes/data-retention.routes.ts");
const app = read("src/app.ts");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const frontend = read("frontend/src/features/data-retention/DataRetentionPage.tsx");
const router = read("frontend/src/app/router.tsx");
const nav = read("frontend/src/lib/navigation.ts");
const tests = existsSync(join(root, "tests/data-retention.test.ts")) ? read("tests/data-retention.test.ts") : "";

assert(/CREATE TABLE IF NOT EXISTS archive_jobs/i.test(migration), "archive job table/model is missing.");
assert(/CREATE TABLE IF NOT EXISTS archive_job_items/i.test(migration), "archive job items table/model is missing.");
assert(/idx_archive_jobs_company_status_requested/.test(migration), "archive job indexes are missing.");
assert(/idx_archive_job_items_company_job_status/.test(migration), "archive job item indexes are missing.");
assert(/dataRetentionRoutes\.post\("\/archive-jobs\/preview"/.test(routes), "archive preview route is missing.");
assert(/dataRetentionRoutes\.post\("\/archive-jobs\/:id\/apply"/.test(routes), "archive apply route is missing.");
assert(/dataRetentionRoutes\.post\("\/items\/:sourceType\/:sourceId\/restore"/.test(routes), "archive restore route is missing.");
assert(/apiV1\.route\("\/data-retention", dataRetentionRoutes\)/.test(app), "data retention route is not registered.");

for (const key of [
  "data_retention.view",
  "data_retention.settings.manage",
  "data_retention.preview",
  "data_retention.archive",
  "data_retention.restore",
  "data_retention.cancel_job",
  "data_retention.audit.view",
  "data_retention.purge",
]) {
  assert(permissions.includes(key), `permission ${key} is not seeded.`);
  assert(roles.includes(key), `permission ${key} is not assigned in role seeds.`);
}

assert(/previewArchive/.test(service) && /preview_read_only:\s*true/.test(service), "archive preview read-only behavior is not explicit.");
assert(/ARCHIVE_CONFIRMATION_PHRASE/.test(service) && /input\.confirmation !== ARCHIVE_CONFIRMATION_PHRASE/.test(service), "archive apply does not require typed confirmation.");
assert(/ARCHIVE_REASON_REQUIRED/.test(service) && /input\.reason/.test(service), "archive apply/restore reason guard is missing.");
assert(/ARCHIVE_PURGE_DISABLED/.test(service) || /ARCHIVE_PURGE_DISABLED/.test(read("src/modules/data-retention/data-retention.validators.ts")), "purge disabled guard is missing.");
assert(/ensureBackupRequirement/.test(service) && /findRecentValidBackup/.test(repository) && /ARCHIVE_BACKUP_REQUIRED/.test(service), "require_backup_before_archive is not enforced in archive apply/direct archive.");
assert(/applyArchiveJob[\s\S]*ensureBackupRequirement/.test(service) && /archiveItem[\s\S]*ensureBackupRequirement/.test(service), "backup-required guard must protect both archive apply and direct item archive.");
assert(/getAttendanceArchiveBlocker/.test(repository) && /payroll_status NOT IN/.test(repository) && /attendance_corrections/.test(repository) && /attendance_conflicts/.test(repository), "attendance archive eligibility does not check payroll/review/manual correction safety.");
assert(/getBiometricArchiveBlocker/.test(repository) && /unmatched_employee/.test(service) && /ambiguous_employee/.test(service) && /invalid_timestamp/.test(service), "biometric log archive eligibility does not block unresolved review statuses.");
assert(/getEmployeeArchiveBlocker/.test(repository) && /leave_requests/.test(repository) && /expiry_alerts/.test(repository) && /asset_assignments/.test(repository) && /payroll_items/.test(repository), "employee archive eligibility does not check open dependencies.");
assert(/findEmployeeForRestore/.test(repository) && /parent employee no longer exists/.test(service), "restore does not validate parent/source compatibility.");
assert(/employment_status/.test(repository) && !/employment_status\s*=\s*'active'/.test(service + repository), "restore can change employee status unsafely.");
assert(!/payroll_runs SET status/.test(service + repository), "restore can change payroll processing status unsafely.");
assert(/limited_preview/.test(service) && /preview_limit/.test(service) && /total_estimate/.test(service), "archive preview count metadata is missing.");
assert(/audit_logs/.test(repository) && /archive-view-only/.test(repository), "audit logs must remain archive-view-only.");
assert(/revalidateItemForArchive/.test(service) && /Employee became active after preview/.test(service), "apply does not revalidate eligibility after preview.");
assert(/source_type === "audit_logs"/.test(service), "audit log archive/restore should be blocked.");

assert(/DataRetentionPage/.test(frontend), "frontend Data Retention page is missing.");
assert(/Archive Preview/.test(frontend), "archive preview UI is missing.");
assert(/Archive Jobs/.test(frontend), "archive jobs table UI is missing.");
assert(/ARCHIVE DATA/.test(frontend), "typed confirmation UI is missing.");
assert(/Purge is disabled/.test(frontend), "purge disabled notice is missing.");
assert(/restoreItem/.test(frontend), "restore action UI is missing.");
assert(/path="\/data-retention"/.test(router), "frontend data retention route is missing.");
assert(/Data Retention/.test(nav), "navigation item is missing.");
assert(!/dark:/.test(frontend), "frontend added dark mode classes.");
assert(!/metadata_json/.test(frontend), "frontend exposes unsafe metadata fields.");

assert(tests, "tests/data-retention.test.ts is missing.");
assert(!/it\.todo|describe\.todo/.test(tests), "Phase 12C-critical tests contain todo placeholders.");
for (const token of [
  "settings update requires reason",
  "preview is read-only",
  "active employee blocked",
  "apply requires confirmation",
  "repeated apply is idempotent",
  "restore archived item succeeds",
  "purge disabled by default",
  "archive apply blocked when require_backup_before_archive is true",
  "direct item archive also respects backup requirement",
  "unfinalized payroll attendance date blocked",
  "manual correction record blocked",
  "unmatched ambiguous biometric log blocked",
  "terminated employee with open leave blocked",
  "terminated employee with unresolved expiry alert blocked",
  "terminated employee with active asset uniform assignment blocked",
  "terminated employee with unfinalized payroll blocked",
  "restore archived employee does not change terminated resigned status to active",
  "restore blocked when parent employee no longer exists",
  "limited preview messaging includes limit metadata",
]) {
  assert(tests.includes(token), `tests do not cover ${token}.`);
}

const disallowedPhase13 = /full permission audit|security hardening|performance \/ d1|production acceptance|phase 13/i;
assert(!disallowedPhase13.test(service + repository + frontend), "Phase 13 audit/security/performance work appears to have started.");

console.log("verify:data-retention-schema passed");
