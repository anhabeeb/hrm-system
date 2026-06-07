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

const requiredTables = [
  "payroll_runs",
  "payroll_items",
  "payroll_earnings",
  "payroll_deductions",
  "payroll_exceptions",
  "payroll_repayment_applications",
];

const requiredRunColumns = [
  "payroll_year",
  "payroll_month_number",
  "period_start",
  "period_end",
  "currency",
  "calculation_status",
  "calculation_version",
  "calculation_started_at",
  "calculated_at",
  "calculation_settings_json",
  "approval_request_id",
  "submitted_for_approval_by",
  "submitted_for_approval_at",
  "finalization_started_at",
  "finalization_failed_reason",
  "finalized_by",
  "finalized_at",
];

const requiredTraceColumns = [
  "source_type",
  "source_id",
  "source_reference",
  "calculation_code",
  "calculation_description",
  "calculation_metadata_json",
  "generated_by_calculation",
  "calculation_version",
];

const requiredIndexes = [
  "idx_payroll_runs_company_year_month",
  "idx_payroll_items_run_generated",
  "idx_payroll_repayment_applications_run",
  "idx_payroll_repayment_applications_employee",
  "idx_payslips_company_item_unique",
  "idx_payroll_runs_finalization",
];

const requiredRepaymentColumns = [
  "source_type",
  "source_id",
  "applied_amount",
  "applied_at",
  "unique(company_id, payroll_run_id, source_type, source_id)",
  "repaid_amount",
  "repaid_at",
  "paid_amount",
  "paid_at",
  "snapshot_json",
  "finalized_at",
];

const requiredChecklistPhrases = [
  "pragma table_info(payroll_runs)",
  "pragma table_info(payroll_items)",
  "pragma table_info(payroll_earnings)",
  "pragma table_info(payroll_deductions)",
  "pragma table_info(payroll_repayment_applications)",
  "pragma table_info(payslips)",
  "pragma table_info(advance_payments)",
  "pragma table_info(salary_loan_installments)",
  "verify:payroll-schema",
  "do not drop existing payroll",
  "payroll_repayment_applications",
  "finalized payroll",
  "old lock endpoint",
  "safe reversal workflow",
];

const missingTables = requiredTables.filter((table) => !migration.includes(`create table if not exists ${table}`));
const missingRunColumns = requiredRunColumns.filter((column) => !migration.includes(column));
const missingTraceColumns = requiredTraceColumns.filter((column) => !migration.includes(column));
const missingIndexes = requiredIndexes.filter((index) => !migration.includes(index));
const missingRepaymentColumns = requiredRepaymentColumns.filter((column) => !migration.includes(column));
const missingChecklistPhrases = requiredChecklistPhrases.filter((phrase) => !checklist.includes(phrase));

if (
  missingTables.length > 0 ||
  missingRunColumns.length > 0 ||
  missingTraceColumns.length > 0 ||
  missingIndexes.length > 0 ||
  missingRepaymentColumns.length > 0 ||
  missingChecklistPhrases.length > 0
) {
  console.error("Payroll schema verification failed.");
  if (missingTables.length > 0) console.error(`Missing tables: ${missingTables.join(", ")}`);
  if (missingRunColumns.length > 0) console.error(`Missing payroll run columns: ${missingRunColumns.join(", ")}`);
  if (missingTraceColumns.length > 0) console.error(`Missing traceability columns: ${missingTraceColumns.join(", ")}`);
  if (missingIndexes.length > 0) console.error(`Missing indexes: ${missingIndexes.join(", ")}`);
  if (missingRepaymentColumns.length > 0) console.error(`Missing finalization/repayment columns: ${missingRepaymentColumns.join(", ")}`);
  if (missingChecklistPhrases.length > 0) console.error(`Missing deployment checklist guidance: ${missingChecklistPhrases.join(", ")}`);
  process.exit(1);
}

console.log("Payroll schema verification passed.");
