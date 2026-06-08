import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const warnings = [];
const unsupportedVitestFlag = `--pool${"Options"}`;

const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(rootDir, relativePath));
const listFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  });
};

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const heavyFeatureModules = [
  "users/UsersAccessPage",
  "outlets/OutletsPage",
  "departments/DepartmentsPage",
  "positions/PositionsPage",
  "employees/EmployeesPage",
  "employees/Employee360Page",
  "contracts/ContractsPage",
  "offboarding/OffboardingPage",
  "attendance/AttendancePage",
  "attendance/AttendanceCorrectionsPage",
  "attendance/AttendanceReportsPage",
  "rosters/RostersPage",
  "devices/KioskDevicesPage",
  "sync/SyncStatusPage",
  "biometric/BiometricPage",
  "leave/LeavePage",
  "holidays/HolidayCalendarPage",
  "long-leave/LongLeavePage",
  "payroll/PayrollPage",
  "payslips/PayslipsPage",
  "advances/AdvancesPage",
  "salary-loans/SalaryLoansPage",
  "assets/AssetsPage",
  "uniforms/UniformsPage",
  "documents/DocumentsPage",
  "approvals/ApprovalsPage",
  "reports/ReportsPage",
  "hr-reports/HrReportsPage",
  "payroll-reports/PayrollReportsPage",
  "report-exports/ExportHistoryPage",
  "report-exports/ReportPrintPage",
  "import-export/ImportExportPage",
  "imports/ImportCenterPage",
  "backup-recovery/BackupRecoveryPage",
  "data-retention/DataRetentionPage",
  "settings/SettingsPage",
  "settings/company/CompanyInformationPage",
  "settings/security/SecuritySettingsPage",
  "settings/attendance/AttendanceSettingsPage",
  "settings/leave/LeaveSettingsPage",
  "settings/payroll/PayrollSettingsPage",
  "settings/documents/DocumentsSettingsPage",
  "settings/backup/BackupSettingsPage",
  "settings/notifications/NotificationsSettingsPage",
  "settings/reports/ReportsSettingsPage",
  "settings/import-export/ImportExportSettingsPage",
  "settings/devices-sync/DevicesSyncSettingsPage",
  "audit/AuditLogsPage",
  "profile-update-requests/ProfileUpdateRequestsPage",
  "notifications/NotificationsPage",
  "expiry-alerts/ExpiryAlertsPage",
];

assert(exists("docs/performance-d1-audit.md"), "docs/performance-d1-audit.md is missing.");
if (exists("docs/performance-d1-audit.md")) {
  const doc = read("docs/performance-d1-audit.md");
  for (const marker of [
    "High-Traffic Endpoints Reviewed",
    "Indexes Added",
    "Frontend Lazy Loading",
    "Cloudflare D1 / Workers Considerations",
    "Known Future Optimizations",
  ]) {
    assert(doc.includes(marker), `docs/performance-d1-audit.md missing section marker "${marker}".`);
  }
}

const packageJson = read("package.json");
assert(packageJson.includes('"verify:performance-d1"'), "package.json is missing verify:performance-d1 script.");

for (const file of [
  ...listFiles(path.join(rootDir, "docs")),
  ...listFiles(path.join(rootDir, "scripts")),
  path.join(rootDir, "package.json"),
]) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(unsupportedVitestFlag)) {
    failures.push(`${path.relative(rootDir, file).replace(/\\/g, "/")}: unsupported Vitest 3 poolOptions syntax remains.`);
  }
}

const router = read("frontend/src/app/router.tsx");
for (const marker of ["lazyNamed", "<Suspense fallback={routeFallback}>"]) {
  assert(router.includes(marker), `frontend router missing lazy-loading marker ${marker}.`);
}
for (const routeModule of heavyFeatureModules) {
  const exportName = routeModule.split("/").at(-1);
  assert(router.includes(`import("@/features/${routeModule}")`), `heavy route ${routeModule} is not lazy-loaded.`);
  assert(
    !new RegExp(`import\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}\\s*from\\s*["']@/features/${routeModule}["']`).test(router),
    `heavy route ${routeModule} is still eagerly imported.`,
  );
}

const boundedFiles = {
  "src/modules/attendance/attendance-reports.validators.ts": [/max\(100\)/, /requires a bounded date range/],
  "src/modules/hr-reports/hr-reports.validators.ts": [/MAX_PAGE_SIZE = 100/, /SORT_ALLOWLIST/, /sortBy\(input\.sort_by\)/],
  "src/modules/payroll-reports/payroll-reports.validators.ts": [/MAX_PAGE_SIZE = 100/, /SORT_ALLOWLIST/, /sortBy\(input\.sort_by\)/],
  "src/modules/imports/imports.validators.ts": [/max\(100\)/, /page_size/],
  "src/modules/backup-recovery/backup-recovery.validators.ts": [/page_size.*100/s],
  "src/modules/data-retention/data-retention.validators.ts": [/max\(100\)/, /page_size/],
  "src/modules/notifications/notifications.validators.ts": [/max\(100\)/, /page_size/],
  "src/modules/expiry-alerts/expiry-alerts.validators.ts": [/max\(100\)/, /page_size/],
};
for (const [file, patterns] of Object.entries(boundedFiles)) {
  const text = read(file);
  for (const pattern of patterns) {
    assert(pattern.test(text), `${file} missing bounded pagination/sort/date marker ${pattern}.`);
  }
}

const repositories = [
  "src/modules/dashboard/dashboard.repository.ts",
  "src/modules/attendance/attendance-reports.repository.ts",
  "src/modules/hr-reports/hr-reports.repository.ts",
  "src/modules/payroll-reports/payroll-reports.repository.ts",
  "src/modules/imports/imports.repository.ts",
  "src/modules/backup-recovery/backup-recovery.repository.ts",
  "src/modules/data-retention/data-retention.repository.ts",
  "src/modules/expiry-alerts/expiry-alerts.repository.ts",
];
for (const file of repositories) {
  const text = read(file);
  assert(/company_id\s*=/.test(text), `${file} does not show company_id query scoping.`);
  if (/list|Report|Rows|Jobs|Alerts/i.test(file)) {
    if (!/LIMIT \? OFFSET \?|LIMIT \?`|LIMIT 500|LIMIT 5000/.test(text)) {
      warnings.push(`${file}: no bounded LIMIT marker found; review manually if this module intentionally uses aggregate-only queries.`);
    }
  }
}

const migrationFiles = listFiles(path.join(rootDir, "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const tableColumns = new Map();

const ensureTable = (table) => {
  if (!tableColumns.has(table)) tableColumns.set(table, new Set(["id"]));
  return tableColumns.get(table);
};

for (const file of migrationFiles) {
  const sql = fs.readFileSync(file, "utf8");
  for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/g)) {
    const columns = ensureTable(match[1]);
    for (const line of match[2].split(/\r?\n/)) {
      const trimmed = line.trim().replace(/,$/, "");
      const column = trimmed.match(/^([A-Za-z_]\w*)\s+/)?.[1];
      if (column && !["PRIMARY", "UNIQUE", "FOREIGN", "CHECK", "CONSTRAINT"].includes(column.toUpperCase())) {
        columns.add(column);
      }
    }
  }
  for (const match of sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+([A-Za-z_]\w*)/g)) {
    ensureTable(match[1]).add(match[2]);
  }
}

assert(exists("migrations/0054_performance_d1_indexes.sql"), "Phase 13D performance index migration is missing.");
if (exists("migrations/0054_performance_d1_indexes.sql")) {
  const migration = read("migrations/0054_performance_d1_indexes.sql");
  const seenDefinitions = new Set();
  for (const match of migration.matchAll(/CREATE INDEX IF NOT EXISTS\s+(\w+)\s+ON\s+(\w+)\(([^)]+)\)/g)) {
    const [, indexName, table, columnsRaw] = match;
    const columns = columnsRaw.split(",").map((column) => column.trim().split(/\s+/)[0]);
    const definitionKey = `${table}(${columns.join(",")})`;
    assert(!seenDefinitions.has(definitionKey), `Duplicate Phase 13D index definition for ${definitionKey}.`);
    seenDefinitions.add(definitionKey);
    const knownColumns = tableColumns.get(table);
    assert(Boolean(knownColumns), `${indexName} references unknown table ${table}.`);
    if (knownColumns) {
      for (const column of columns) {
        assert(knownColumns.has(column), `${indexName} references unknown column ${table}.${column}.`);
      }
    }
  }
  assert(seenDefinitions.size >= 5, "Phase 13D migration should add the expected focused performance indexes.");
}

if (warnings.length > 0) {
  console.warn("Performance verifier warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (failures.length > 0) {
  console.error("Performance / D1 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Performance / D1 verification passed.");
}
