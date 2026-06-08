import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const fail = (message) => {
  throw new Error(`verify:imports-schema failed: ${message}`);
};
const mustInclude = (source, tokens, label) => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`${label} missing ${token}`);
  }
};
const between = (source, start, end) => {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
};
const countPlaceholders = (source) => (source.match(/\?/g) ?? []).length;
const countTopLevelItems = (source) => {
  let count = 0;
  let depth = 0;
  let quote = "";
  let escaped = false;
  let sawToken = false;
  for (const char of source) {
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      sawToken = true;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      sawToken = true;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      sawToken = true;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      sawToken = true;
      continue;
    }
    if (char === "," && depth === 0) {
      if (sawToken) count += 1;
      sawToken = false;
      continue;
    }
    if (!/\s/.test(char)) sawToken = true;
  }
  return sawToken ? count + 1 : count;
};
const extractHolidayInsert = (label, startNeedle, sqlEndNeedle, valuesEndNeedle) => {
  const startIndex = repository.indexOf(startNeedle);
  if (startIndex === -1) fail(`${label} holiday insert block is missing`);
  const sqlStart = repository.indexOf("`", startIndex) + 1;
  const sqlEnd = repository.indexOf(sqlEndNeedle, sqlStart);
  if (sqlStart === 0 || sqlEnd === -1) fail(`${label} holiday insert SQL could not be parsed`);
  const valuesStart = sqlEnd + sqlEndNeedle.length;
  const valuesEnd = repository.indexOf(valuesEndNeedle, valuesStart);
  if (valuesEnd === -1) fail(`${label} holiday insert values could not be parsed`);
  return {
    sql: repository.slice(sqlStart, sqlEnd),
    values: repository.slice(valuesStart, valuesEnd),
  };
};

const app = read("src/app.ts");
const routes = read("src/routes/imports.routes.ts");
const service = read("src/modules/imports/imports.service.ts");
const repository = read("src/modules/imports/imports.repository.ts");
const parser = read("src/modules/imports/imports.parser.ts");
const templates = read("src/modules/imports/imports.templates.ts");
const migration = read("migrations/0050_import_hardening.sql");
const permissions = read("seeds/permissions.seed.sql");
const roles = read("seeds/roles.seed.sql");
const router = read("frontend/src/app/router.tsx");
const nav = read("frontend/src/lib/navigation.ts");
const page = read("frontend/src/features/imports/ImportCenterPage.tsx");
const tests = read("tests/imports.test.ts");
const packageJson = read("package.json");

if (!app.includes("importsRoutes") || !app.includes('"/imports"')) fail("import routes are not registered under /api/v1/imports");
mustInclude(routes, [
  '"/templates"',
  '"/templates/:importType"',
  '"/templates/:importType/csv"',
  '"/jobs"',
  '"/jobs/:id/validate"',
  '"/jobs/:id/apply"',
  '"/jobs/:id/cancel"',
  '"/jobs/:id/rows"',
  '"/jobs/:id/errors"',
  '"/preview"',
], "import routes");

mustInclude(migration, [
  "CREATE TABLE IF NOT EXISTS import_jobs",
  "CREATE TABLE IF NOT EXISTS import_job_rows",
  "idempotency_key",
  "idx_import_jobs_company_type_status",
  "idx_import_jobs_company_requested",
  "idx_import_jobs_company_idempotency",
  "idx_import_job_rows_company_job_status",
  "idx_import_job_rows_company_idempotency",
], "import migration");

mustInclude(templates, [
  'import_type: "employee_master"',
  'import_type: "employee_documents"',
  'import_type: "leave_balances"',
  'import_type: "salary_compensation"',
  'import_type: "attendance"',
  'import_type: "holidays"',
  'import_type: "assets_uniforms"',
  'import_type: "advances_loans"',
  "adjustment_reason",
  "sensitive: true",
], "import templates");

mustInclude(parser, [
  "parseCsv",
  'char === \'"\'',
  'char === ","',
  "replace(/^\\uFEFF/",
  "validateHeaders",
  "sanitizeImportValue",
  "formulaPrefix",
  "MAX_IMPORT_FILE_BYTES",
  "MAX_IMPORT_ROWS",
  "IMPORT_TOO_MANY_ROWS",
  "IMPORT_INVALID_HEADERS",
], "CSV parser");

mustInclude(service, [
  "previewImport",
  "createImportJob",
  "applyImportJob",
  "claimApplying",
  "IMPORT_APPLY_BLOCKED",
  "IMPORT_DUPLICATE_ROW",
  "IMPORT_DUPLICATE_RECORD",
  "IMPORT_SENSITIVE_PERMISSION_REQUIRED",
  "ensureOutletScope",
  "createAuditLog",
  "findDocumentCategory",
  "applies_to_foreign_employee",
  "applies_to_local_employee",
  "requires_expiry_date",
  "pending_file",
  "Document metadata imported, file upload still required.",
  "findAttendanceImportBlock",
  "findPayrollRunByMonth",
  "markAttendanceSummaryPendingImportRecalculation",
  "findSalaryByEmployeeEffective",
  "stableTargetId",
  "insertAttendanceImport",
  "insertHolidayImport",
  "maskSensitiveData",
], "import service");
const previewBody = between(service, "export const previewImport", "export const createImportJob");
if (/upsertEmployee|upsertLeaveBalance|insertAttendanceImport|insertHolidayImport|insertSalaryHistory/.test(previewBody)) {
  fail("previewImport appears to mutate business data");
}
if (!/job\.status === "completed"[\s\S]*already_applied/.test(service)) {
  fail("applyImportJob must be idempotent for completed jobs");
}
if (!/job\.status === "partially_completed"[\s\S]*rows\.length === 0[\s\S]*partial_retry_exhausted/.test(service)) {
  fail("applyImportJob must safely handle partially completed jobs without unapplied valid rows");
}
if (/password_hash|totp_secret|device_token|raw_payload/.test(page)) fail("Import Center UI must not display unsafe raw secret fields");
if (/backup|restore|retention/i.test(`${routes}\n${service}\n${page}`)) fail("Phase 12A imports code appears to start backup/restore/retention work");

mustInclude(repository, [
  "INSERT INTO import_jobs",
  "INSERT INTO import_job_rows",
  "env.DB.batch",
  "WHERE company_id = ? AND id = ?",
  "status = 'applying'",
  "status IN ('preview_ready', 'partially_completed')",
  "INSERT OR IGNORE INTO leave_balance_transactions",
  "document_categories",
  "employee_documents",
  "metadata/import",
  "pending_recalculation",
  "attendance_daily_summary",
  "payroll_runs",
  "employee_salary_history",
  "INSERT OR IGNORE INTO employee_salary_history",
  "UPDATE holidays SET",
  "applies_to_local_employees",
  "applies_to_foreign_employees",
  "affects_leave_duration",
  "affects_attendance_absence",
  "affects_long_leave_payroll",
  "'import'",
  "attendance_events",
], "import repository");
const outletHolidayInsert = extractHolidayInsert("outlet-specific", "env.DB.prepare(`INSERT INTO holidays (", "`).bind(", "),\n      env.DB.prepare(\"INSERT OR IGNORE INTO holiday_outlets");
const nonOutletHolidayInsert = extractHolidayInsert("non-outlet", ": execute(env, `INSERT INTO holidays (", "`, [", "]);");
if (countPlaceholders(outletHolidayInsert.sql) !== countTopLevelItems(outletHolidayInsert.values)) {
  fail("outlet-specific holiday INSERT placeholder count does not match bound values");
}
if (countPlaceholders(nonOutletHolidayInsert.sql) !== countTopLevelItems(nonOutletHolidayInsert.values)) {
  fail("non-outlet holiday INSERT placeholder count does not match bound values");
}
mustInclude(nonOutletHolidayInsert.values, [
  "input.paid,\n      input.paid,\n      input.recurring,\n      input.recurring,\n      input.recurring ? \"yearly\" : null",
  "Number(input.startDate.slice(8, 10)),\n      input.appliesLocal,\n      input.appliesForeign,\n      input.affectsLeave,\n      input.affectsLeave,\n      input.affectsLongLeave,\n      input.affectsLongLeave,\n      input.affectsAttendance,\n      input.affectsAttendance",
], "non-outlet holiday bind order");
mustInclude(outletHolidayInsert.values, [
  "input.paid,\n        input.paid,\n        input.recurring,\n        input.recurring,\n        input.recurring ? \"yearly\" : null",
  "input.outletId,\n        input.appliesLocal,\n        input.appliesForeign,\n        input.affectsLeave,\n        input.affectsLeave,\n        input.affectsLongLeave,\n        input.affectsLongLeave,\n        input.affectsAttendance,\n        input.affectsAttendance",
], "outlet holiday bind order");

mustInclude(permissions, [
  "imports.view",
  "imports.templates.view",
  "imports.upload",
  "imports.preview",
  "imports.apply",
  "imports.cancel",
  "imports.history.view",
  "imports.errors.view",
  "imports.employee.manage",
  "imports.documents.manage",
  "imports.leave_balances.manage",
  "imports.salary.manage",
  "imports.attendance.manage",
  "imports.holidays.manage",
  "imports.assets.manage",
  "imports.advances_loans.manage",
  "imports.sensitive.manage",
], "import permission seeds");
if (!roles.includes("rp_imports_admin_") || !roles.includes("rp_imports_hr_")) fail("import permissions are not assigned to default roles");

mustInclude(router, ["ImportCenterPage", '"/imports"'], "frontend import route");
mustInclude(nav, ["Import Center", '"/imports"', "imports.templates.view"], "frontend import navigation");
mustInclude(page, [
  "Import Center",
  "Import History",
  "Template CSV",
  "Preview only",
  "row-level errors",
  "Apply is disabled until blocking row errors are fixed",
  "imports.apply",
  "imports.sensitive.manage",
], "Import Center page");
if (/dark:/.test(page)) fail("Import Center UI must not add dark mode");
if (/metadata_json/.test(page)) fail("Import Center UI must not expose raw metadata_json");

if (/it\.todo|describe\.todo/.test(tests)) fail("Phase 12A import tests contain TODO placeholders");
mustInclude(tests, [
  "templates list includes supported import types",
  "employee template has required fields",
  "leave balance template has reason field",
  "salary template marked sensitive",
  "unsupported template returns error",
  "CSV parser handles quoted commas and BOM",
  "CSV parser blocks too many rows",
  "preview creates no business records",
  "row-level validation errors returned",
  "cross-company references rejected",
  "duplicate employee_code blocked in create_only",
  "outlet-scoped user cannot import employee into unauthorized outlet",
  "leave balance import creates opening ledger transaction and repeated apply is idempotent",
  "salary import requires sensitive permission",
  "attendance import creates source import event",
  "valid holiday imported",
  "cancel blocks later apply",
  "Import Center page exists",
  "invalid document category rejected",
  "inactive category rejected",
  "foreign-only category rejected for local employee",
  "local-only category rejected for foreign employee",
  "expiry required category rejects missing expiry",
  "metadata-only import does not falsely satisfy required uploaded document compliance",
  "holiday import persists Phase 9D fields from CSV",
  "non-outlet holiday import maps paid recurring applicability and affects values exactly",
  "outlet-specific holiday import keeps placeholder count and Phase 9D field mapping",
  "finalized/locked attendance date blocks import",
  "manual-corrected date blocks import without override permission",
  "successful import triggers summary rebuild or marks pending recalculation",
  "finalized payroll period blocks salary import",
  "repeated apply does not duplicate employee attendance holiday or salary history",
  "partially completed job behavior is safe and documented",
  "job creation row insertion failure marks job failed safely",
], "import tests");

if (!packageJson.includes("verify:imports-schema")) fail("package.json is missing verify:imports-schema");
if (!packageJson.includes("npm run verify:imports-schema")) fail("build:all must run verify:imports-schema");

console.log("verify:imports-schema passed");
