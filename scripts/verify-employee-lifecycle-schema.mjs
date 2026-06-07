import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = "migrations";
const checklistPath = "docs/deployment-checklist.md";

const migration = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8").toLowerCase())
  .join("\n");
const checklist = readFileSync(checklistPath, "utf8").toLowerCase();

const requiredColumns = [
  "employee_status_history",
  "old_status",
  "new_status",
  "effective_from",
  "effective_to",
  "reason",
  "notes",
  "approval_request_id",
  "approved_by",
  "created_by",
  "changed_by",
  "changed_at",
  "updated_at",
];

const requiredIndexes = [
  "idx_employee_status_history_employee_effective",
  "idx_employee_status_history_employee_status",
  "idx_employee_status_history_company_effective",
];

const requiredChecklistPhrases = [
  "pragma table_info(employee_status_history)",
  "verify:employee-lifecycle-schema",
  "employee lifecycle",
  "finalized payroll period",
];

const missingColumns = requiredColumns.filter((column) => !migration.includes(column));
const missingIndexes = requiredIndexes.filter((index) => !migration.includes(index));
const missingChecklistPhrases = requiredChecklistPhrases.filter((phrase) => !checklist.includes(phrase));

if (missingColumns.length > 0 || missingIndexes.length > 0 || missingChecklistPhrases.length > 0) {
  console.error("Employee lifecycle schema verification failed.");
  if (missingColumns.length > 0) console.error(`Missing columns/table references: ${missingColumns.join(", ")}`);
  if (missingIndexes.length > 0) console.error(`Missing indexes: ${missingIndexes.join(", ")}`);
  if (missingChecklistPhrases.length > 0) console.error(`Missing deployment checklist guidance: ${missingChecklistPhrases.join(", ")}`);
  process.exit(1);
}

console.log("Employee lifecycle schema verification passed.");
