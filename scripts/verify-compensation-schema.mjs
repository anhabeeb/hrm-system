import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = "migrations";
const checklistPath = "docs/deployment-checklist.md";

const migration = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8").toLowerCase())
  .join("\n");
const checklist = readFileSync(checklistPath, "utf8").toLowerCase();

const requiredTables = [
  "compensation_component_definitions",
  "employee_compensation_components",
  "compensation_approval_applications",
];

const requiredColumns = [
  "component_type",
  "component_code",
  "component_name",
  "amount",
  "currency",
  "calculation_type",
  "affects_gross_pay",
  "affects_net_pay",
  "effective_from",
  "effective_to",
  "status",
  "revision",
  "reason",
  "approval_request_id",
  "created_by",
  "updated_by",
  "updated_at",
];

const requiredApplicationColumns = [
  "approval_request_id",
  "employee_id",
  "component_id",
  "action_type",
  "applied_at",
  "created_at",
];

const requiredIndexes = [
  "idx_employee_comp_components_employee_status",
  "idx_employee_comp_components_effective_range",
  "idx_employee_comp_components_definition",
  "idx_employee_comp_components_approval_request_unique",
  "idx_employee_comp_components_timeline_guard_definition",
  "idx_employee_comp_components_timeline_guard_code",
  "idx_employee_comp_components_timeline_guard_name",
  "idx_compensation_approval_applications_request_unique",
  "idx_compensation_approval_applications_component",
  "idx_compensation_approval_applications_employee",
  "idx_compensation_definitions_company_code",
];

const missingTables = requiredTables.filter((table) => !migration.includes(`create table if not exists ${table}`));
const missingColumns = requiredColumns.filter((column) => !migration.includes(column));
const missingApplicationColumns = requiredApplicationColumns.filter((column) => !migration.includes(column));
const missingIndexes = requiredIndexes.filter((index) => !migration.includes(index));

const requiredChecklistPhrases = [
  "pragma table_info(employee_compensation_components)",
  "pragma table_info(compensation_approval_applications)",
  "sqlite_master where type='index' and tbl_name='employee_compensation_components'",
  "sqlite_master where type='index' and tbl_name='compensation_approval_applications'",
  "idx_employee_comp_components_approval_request_unique",
  "idx_compensation_approval_applications_request_unique",
  "employee_compensation_components",
  "compensation_approval_applications",
  "do not drop existing salary history",
  "verify:compensation-schema",
];

const missingChecklistPhrases = requiredChecklistPhrases.filter((phrase) => !checklist.includes(phrase));

if (
  missingTables.length > 0 ||
  missingColumns.length > 0 ||
  missingApplicationColumns.length > 0 ||
  missingIndexes.length > 0 ||
  missingChecklistPhrases.length > 0
) {
  console.error("Compensation schema verification failed.");
  if (missingTables.length > 0) console.error(`Missing tables: ${missingTables.join(", ")}`);
  if (missingColumns.length > 0) console.error(`Missing columns: ${missingColumns.join(", ")}`);
  if (missingApplicationColumns.length > 0) console.error(`Missing approval application columns: ${missingApplicationColumns.join(", ")}`);
  if (missingIndexes.length > 0) console.error(`Missing indexes: ${missingIndexes.join(", ")}`);
  if (missingChecklistPhrases.length > 0) console.error(`Missing deployment checklist guidance: ${missingChecklistPhrases.join(", ")}`);
  process.exit(1);
}

console.log("Compensation schema verification passed.");
