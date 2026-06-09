import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = "migrations";
const checklistPath = "docs/deployment-checklist.md";
const read = (path) => readFileSync(path, "utf8").toLowerCase();

const migration = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8").toLowerCase())
  .join("\n");
const checklist = read(checklistPath);

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
const emergencyContactChecks = [
  ["migration", migration, "emergency_contact_relation"],
  ["employee backend types", read("src/modules/employees/employees.types.ts"), "emergency_contact_relation"],
  ["employee validators", read("src/modules/employees/employees.validators.ts"), "emergency_contact_relation"],
  ["employee repository", read("src/modules/employees/employees.repository.ts"), "emergency_contact_relation"],
  ["employee service", read("src/modules/employees/employees.service.ts"), "emergency_contact_relation"],
  ["employee import template", read("src/modules/imports/imports.templates.ts"), "emergency_contact_relation"],
  ["employee import repository", read("src/modules/imports/imports.repository.ts"), "emergency_contact_relation"],
  ["employee form", read("frontend/src/features/employees/EmployeeForm.tsx"), "emergency_contact_relation"],
  ["employee detail drawer", read("frontend/src/features/employees/EmployeeDetailDrawer.tsx"), "emergency_contact_relation"],
  ["employee 360 page", read("frontend/src/features/employees/Employee360Page.tsx"), "emergency contact"],
];
const missingEmergencyContactChecks = emergencyContactChecks
  .filter(([, content, phrase]) => !content.includes(phrase))
  .map(([label]) => label);

if (missingColumns.length > 0 || missingIndexes.length > 0 || missingChecklistPhrases.length > 0 || missingEmergencyContactChecks.length > 0) {
  console.error("Employee lifecycle schema verification failed.");
  if (missingColumns.length > 0) console.error(`Missing columns/table references: ${missingColumns.join(", ")}`);
  if (missingIndexes.length > 0) console.error(`Missing indexes: ${missingIndexes.join(", ")}`);
  if (missingChecklistPhrases.length > 0) console.error(`Missing deployment checklist guidance: ${missingChecklistPhrases.join(", ")}`);
  if (missingEmergencyContactChecks.length > 0) console.error(`Missing emergency contact relation wiring: ${missingEmergencyContactChecks.join(", ")}`);
  process.exit(1);
}

console.log("Employee lifecycle schema verification passed.");
