import { readFileSync } from "node:fs";

const baseSchemaPath = "migrations/0004_employees.sql";
const migrationPath = "migrations/0018_salary_history_change_type.sql";
const checklistPath = "docs/deployment-checklist.md";

const baseSchema = readFileSync(baseSchemaPath, "utf8").toLowerCase();
const migration = readFileSync(migrationPath, "utf8").toLowerCase();
const checklist = readFileSync(checklistPath, "utf8").toLowerCase();

const requiredColumns = [
  "employee_id",
  "monthly_salary_amount",
  "currency",
  "effective_from",
  "effective_to",
  "reason",
  "approval_request_id",
  "created_by",
  "created_at",
  "change_type",
  "updated_at",
];

const columnExistsInSource = (column) =>
  baseSchema.includes(column) ||
  migration.includes(`add column ${column}`) ||
  migration.includes(column);

const missingFromSource = requiredColumns.filter((column) => !columnExistsInSource(column));
const missingFromChecklist = requiredColumns.filter((column) => !checklist.includes(column));

const requiredChecklistPhrases = [
  "pragma table_info(employee_salary_history)",
  "confirm change_type and updated_at exist",
  "do not blindly rerun",
];

const missingChecklistPhrases = requiredChecklistPhrases.filter((phrase) => !checklist.includes(phrase));

if (missingFromSource.length > 0 || missingFromChecklist.length > 0 || missingChecklistPhrases.length > 0) {
  console.error("Salary schema verification failed.");
  if (missingFromSource.length > 0) {
    console.error(`Missing salary columns from source migrations: ${missingFromSource.join(", ")}`);
  }
  if (missingFromChecklist.length > 0) {
    console.error(`Missing salary columns from ${checklistPath}: ${missingFromChecklist.join(", ")}`);
  }
  if (missingChecklistPhrases.length > 0) {
    console.error(`Missing deployment checklist guidance: ${missingChecklistPhrases.join(", ")}`);
  }
  process.exit(1);
}

console.log("Salary schema verification passed.");
