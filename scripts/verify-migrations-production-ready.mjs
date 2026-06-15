import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "migrations");
const failures = [];

const fail = (message) => failures.push(message);
const read = (file) => fs.readFileSync(path.join(migrationsDir, file), "utf8");

if (!fs.existsSync(migrationsDir)) {
  fail("migrations directory is missing.");
}

const migrationFiles = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()
  : [];

if (migrationFiles.length === 0) {
  fail("No numbered SQL migrations were found.");
}

for (let index = 0; index < migrationFiles.length; index += 1) {
  const expected = String(index + 1).padStart(4, "0");
  const actual = migrationFiles[index].slice(0, 4);
  if (actual !== expected) {
    fail(`Migration numbering gap or duplicate near ${migrationFiles[index]}: expected prefix ${expected}.`);
    break;
  }
}

const combined = migrationFiles.map((file) => `-- ${file}\n${read(file)}`).join("\n\n");
const normalized = combined.toLowerCase();

const forbiddenSql = [
  { pattern: /\bdrop\s+table\b/i, label: "DROP TABLE" },
  { pattern: /\bdrop\s+column\b/i, label: "DROP COLUMN" },
  { pattern: /\btruncate\s+table\b/i, label: "TRUNCATE TABLE" },
  { pattern: /\bdelete\s+from\s+(users|employees)\b/i, label: "DELETE FROM users/employees" },
  { pattern: /\bupdate\s+users\s+set\s+(?:[^;]*\b)?status\b/i, label: "automatic user status update" },
  { pattern: /\bupdate\s+employees\s+set\s+(?:[^;]*\b)?(?:status|employment_status)\b/i, label: "automatic employee status update" },
];

for (const { pattern, label } of forbiddenSql) {
  if (pattern.test(combined) && !combined.includes("allow-production-data-change")) {
    fail(`${label} appears in migrations without an allow-production-data-change comment.`);
  }
}

const expectedTables = [
  "access_levels",
  "level_role_templates",
  "employee_structure_history",
  "approval_workflows",
  "approval_steps",
  "approval_requests",
  "approval_request_steps",
  "approval_actions",
  "leave_requests",
  "attendance_corrections",
  "roster_change_requests",
  "operation_responsibility_matrix",
  "business_functions",
  "business_function_department_assignments",
  "operation_catalog",
  "payroll_adjustment_requests",
  "payroll_adjustment_applied_ledger",
  "advance_salary_requests",
  "advance_salary_payment_ledger",
  "advance_salary_deduction_schedule",
  "employee_kyc_update_requests",
  "document_upload_staging",
  "employee_structure_change_requests",
  "employee_structure_change_request_items",
  "employee_exit_requests",
  "employee_offboarding_tasks",
  "employee_exit_status_history",
  "employee_disciplinary_action_requests",
  "employee_disciplinary_records",
  "employee_disciplinary_follow_up_tasks",
];

for (const table of expectedTables) {
  if (!normalized.includes(table.toLowerCase())) {
    fail(`Expected production table/schema marker is missing: ${table}.`);
  }
}

const expectedIndexMarkers = [
  "idx_approval_requests_company_status",
  "idx_approval_actions_company_request",
  "idx_roster_change_requests_status",
  "idx_operation_responsibility_operation",
  "idx_payroll_adjustments_status",
  "idx_advance_salary_requests_status",
  "idx_employee_kyc_requests_status",
  "idx_document_upload_staging_file_key",
  "idx_employee_structure_change_requests_status",
  "idx_employee_exit_requests_status",
  "idx_employee_discipline_requests_status",
];

for (const marker of expectedIndexMarkers) {
  if (!normalized.includes(marker.toLowerCase())) {
    fail(`Expected key production index marker is missing: ${marker}.`);
  }
}

const latestExpected = [
  "0072_employee_structure_change_approval_engine.sql",
  "0073_employee_lifecycle_approval_engine.sql",
  "0074_employee_lifecycle_safety_hardening.sql",
  "0075_employee_disciplinary_action_approval_engine.sql",
  "0076_disciplinary_action_lifecycle_hardening.sql",
];

for (const file of latestExpected) {
  if (!migrationFiles.includes(file)) fail(`Latest expected migration is missing: ${file}.`);
}

const wranglerPath = path.join(root, "wrangler.jsonc");
if (!fs.existsSync(wranglerPath)) {
  fail("wrangler.jsonc is missing; D1 migration deployment path cannot be verified.");
} else {
  const wrangler = fs.readFileSync(wranglerPath, "utf8");
  for (const marker of ['"binding": "DB"', '"migrations_dir": "migrations"', '"directory": "./frontend/dist"']) {
    if (!wrangler.includes(marker)) fail(`wrangler.jsonc is missing deployment marker ${marker}.`);
  }
}

if (failures.length > 0) {
  console.error("Migration production readiness verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Migration production readiness verification passed (${migrationFiles.length} ordered migrations checked).`);
}
