import { readFileSync } from "node:fs";

const hardeningMigrationPaths = [
  "migrations/0022_approval_finalization_hardening.sql",
  "migrations/0023_approval_applying_recovery.sql",
];
const checklistPath = "docs/deployment-checklist.md";

const migration = hardeningMigrationPaths
  .map((migrationPath) => readFileSync(migrationPath, "utf8"))
  .join("\n")
  .toLowerCase();
const checklist = readFileSync(checklistPath, "utf8").toLowerCase();

const requiredColumns = [
  "applied_at",
  "failure_code",
  "failure_message",
  "retry_count",
  "last_retry_at",
  "applying_started_at",
];

const requiredMigrationPhrases = [
  "idx_approval_actions_unique_final_apply",
  "where action = 'applied'",
];

const missingColumns = requiredColumns.filter((column) => !migration.includes(`add column ${column}`));
const missingMigrationPhrases = requiredMigrationPhrases.filter((phrase) => !migration.includes(phrase));
const missingChecklistColumns = requiredColumns.filter((column) => !checklist.includes(column));
const requiredChecklistPhrases = [
  "pragma table_info(approval_requests)",
  "idx_approval_actions_unique_final_apply",
  "do not blindly rerun",
];
const missingChecklistPhrases = requiredChecklistPhrases.filter((phrase) => !checklist.includes(phrase));

if (missingColumns.length > 0 || missingMigrationPhrases.length > 0 || missingChecklistColumns.length > 0 || missingChecklistPhrases.length > 0) {
  console.error("Approval schema verification failed.");
  if (missingColumns.length > 0) {
    console.error(`Missing approval hardening columns from approval migrations: ${missingColumns.join(", ")}`);
  }
  if (missingMigrationPhrases.length > 0) {
    console.error(`Missing approval migration guardrails: ${missingMigrationPhrases.join(", ")}`);
  }
  if (missingChecklistColumns.length > 0) {
    console.error(`Missing approval columns from ${checklistPath}: ${missingChecklistColumns.join(", ")}`);
  }
  if (missingChecklistPhrases.length > 0) {
    console.error(`Missing approval deployment checklist guidance: ${missingChecklistPhrases.join(", ")}`);
  }
  process.exit(1);
}

console.log("Approval schema verification passed.");
