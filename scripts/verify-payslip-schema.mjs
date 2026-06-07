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
  "snapshot_json",
  "employee_snapshot_json",
  "company_snapshot_json",
  "period_snapshot_json",
  "earnings_json",
  "deductions_json",
  "non_cash_benefits_json",
  "totals_json",
  "calculation_version",
  "finalized_at",
  "download_count",
  "last_downloaded_at",
  "printed_count",
  "last_printed_at",
];

const requiredIndexes = [
  "idx_payslips_company_item_unique",
  "idx_payslips_company_run_employee_unique",
  "idx_payslips_employee_month",
];

const requiredChecklistPhrases = [
  "pragma table_info(payslips)",
  "verify:payslip-schema",
  "finalized payslip snapshots",
  "idx_payslips_company_run_employee_unique",
  "do not expose payslip file_key",
  "payslips are generated only after payroll finalization",
  "do not generate payslips for approved-but-not-finalized payroll",
  "print/save as pdf",
];

const missingColumns = requiredColumns.filter((column) => !migration.includes(column));
const missingIndexes = requiredIndexes.filter((index) => !migration.includes(index));
const missingChecklistPhrases = requiredChecklistPhrases.filter((phrase) => !checklist.includes(phrase));

if (missingColumns.length > 0 || missingIndexes.length > 0 || missingChecklistPhrases.length > 0) {
  console.error("Payslip schema verification failed.");
  if (missingColumns.length > 0) console.error(`Missing payslip columns: ${missingColumns.join(", ")}`);
  if (missingIndexes.length > 0) console.error(`Missing payslip indexes: ${missingIndexes.join(", ")}`);
  if (missingChecklistPhrases.length > 0) console.error(`Missing deployment checklist guidance: ${missingChecklistPhrases.join(", ")}`);
  process.exit(1);
}

console.log("Payslip schema verification passed.");
