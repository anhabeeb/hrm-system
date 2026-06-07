import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const migration = readFileSync(resolve(root, "migrations/0032_employee_contracts.sql"), "utf8").toLowerCase();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const settingsValidators = readFileSync(resolve(root, "src/modules/settings/settings.validators.ts"), "utf8");

const requiredTokens = [
  "create table if not exists employee_contracts",
  "contract_number",
  "contract_type",
  "contract_status",
  "start_date",
  "end_date",
  "signed_date",
  "probation_end_date",
  "renewal_of_contract_id",
  "version_number",
  "document_id",
  "salary_snapshot_amount",
  "idx_employee_contracts_company_employee_start",
  "idx_employee_contracts_company_employee_end",
  "idx_employee_contracts_company_status",
  "idx_employee_contracts_company_end",
  "idx_employee_contracts_company_document",
  "documents.contract_rules",
  "employment_contract",
  "contract_renewal",
  "contract_amendment",
];

for (const token of requiredTokens) {
  if (!migration.includes(token)) {
    throw new Error(`Contract schema verification failed: missing ${token}`);
  }
}

if (!settingsValidators.includes('"documents.contract_rules"')) {
  throw new Error("Contract schema verification failed: documents.contract_rules is not allowed by settings validation.");
}

if (!packageJson.scripts?.["verify:contract-schema"]) {
  throw new Error("Contract schema verification failed: missing verify:contract-schema package script.");
}

console.log("Contract schema verification passed.");
