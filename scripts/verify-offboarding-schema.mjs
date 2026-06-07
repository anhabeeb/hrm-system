import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migration = readFileSync(resolve(root, "migrations/0031_employee_offboarding.sql"), "utf8").toLowerCase();

const requiredTables = [
  "create table if not exists employee_offboarding_cases",
  "create table if not exists employee_offboarding_tasks",
  "create table if not exists employee_final_settlement_drafts",
];

const requiredColumns = [
  "effective_exit_date",
  "final_settlement_status",
  "final_settlement_payroll_run_id",
  "offboarding_case_id",
  "task_type",
  "source_type",
  "source_id",
  "basic_salary_due",
  "advances_outstanding",
  "loans_outstanding",
  "estimated_net_settlement",
  "calculation_metadata_json",
];

const requiredIndexes = [
  "idx_offboarding_cases_company_employee_status",
  "idx_offboarding_cases_company_status_exit",
  "idx_offboarding_tasks_case_status",
  "idx_offboarding_tasks_employee_type",
  "idx_final_settlement_drafts_case",
];

for (const token of [...requiredTables, ...requiredColumns, ...requiredIndexes]) {
  if (!migration.includes(token)) {
    throw new Error(`Offboarding schema verification failed: missing ${token}`);
  }
}

console.log("Offboarding schema verification passed.");
