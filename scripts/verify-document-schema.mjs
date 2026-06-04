import { readFileSync } from "node:fs";
import { requiredEmployeeDocumentColumns } from "./document-schema-columns.mjs";

const migrationPath = "migrations/0017_foreign_employee_document_history.sql";
const checklistPath = "docs/deployment-checklist.md";

const migration = readFileSync(migrationPath, "utf8").toLowerCase();
const checklist = readFileSync(checklistPath, "utf8").toLowerCase();

const missingFromMigration = requiredEmployeeDocumentColumns.filter((column) => {
  if (column === "updated_at") {
    return !migration.includes("updated_at") && !checklist.includes("updated_at");
  }

  return !migration.includes(`add column ${column}`);
});

const missingFromChecklist = requiredEmployeeDocumentColumns.filter((column) => !checklist.includes(column));

const requiredChecklistPhrases = [
  "pragma table_info(employee_documents)",
  "do not re-run this migration blindly",
  "do not blindly rerun",
];

const hasRecoveryWarning = requiredChecklistPhrases.some((phrase) => checklist.includes(phrase));

if (missingFromMigration.length > 0 || missingFromChecklist.length > 0 || !hasRecoveryWarning) {
  console.error("Document schema verification failed.");
  if (missingFromMigration.length > 0) {
    console.error(`Missing from ${migrationPath}: ${missingFromMigration.join(", ")}`);
  }
  if (missingFromChecklist.length > 0) {
    console.error(`Missing from ${checklistPath}: ${missingFromChecklist.join(", ")}`);
  }
  if (!hasRecoveryWarning) {
    console.error("Deployment checklist must warn not to blindly rerun partially applied migration 0017.");
  }
  process.exit(1);
}

console.log("Document schema verification passed.");
