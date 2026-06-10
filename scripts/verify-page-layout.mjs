import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const listFiles = (relativeDir) => {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, "/");
    if (entry.isDirectory()) return listFiles(relativePath);
    return /\.(ts|tsx)$/.test(entry.name) ? [relativePath] : [];
  });
};

const pageHeader = read("frontend/src/components/layout/PageHeader.tsx");
const pageActionBar = read("frontend/src/components/layout/PageActionBar.tsx");
assert(!pageHeader.includes("<h1"), "PageHeader must not render a large in-page title.");
assert(!pageHeader.includes("text-xl"), "PageHeader still contains large title styling.");
assert(!pageHeader.includes("tracking-tight"), "PageHeader still contains large heading styling.");
assert(!pageHeader.includes("border-b"), "PageHeader still renders the old large bordered header block.");
assert(!/<p[^>]*>\s*\{[^}]*description/i.test(pageHeader), "PageHeader still renders the old description paragraph.");
assert(pageHeader.includes("PageActionBar"), "PageHeader should delegate actions to the shared compact PageActionBar.");
assert(pageHeader.includes("Backward-compatible wrapper only"), "PageHeader should be documented as a backward-compatible wrapper, not a new page layout primitive.");
assert(pageActionBar.includes("justify-end"), "PageActionBar actions should align compactly to the right.");
assert(pageActionBar.includes("flex-wrap"), "PageActionBar actions should wrap cleanly on smaller screens.");
assert(pageActionBar.includes("aria-label"), "PageActionBar should remain accessible.");

const normalAppPageHeaderUsages = [
  ...listFiles("frontend/src/features"),
  ...listFiles("frontend/src/components/data"),
].filter((file) => {
  const text = read(file);
  return text.includes("PageHeader") || /<PageHeader\b/.test(text);
});
assert(
  normalAppPageHeaderUsages.length === 0,
  `Normal app pages should not use PageHeader after header cleanup: ${normalAppPageHeaderUsages.join(", ")}`,
);

const topbar = read("frontend/src/components/layout/Topbar.tsx");
const breadcrumbs = read("frontend/src/components/layout/Breadcrumbs.tsx");
assert(topbar.includes("<Breadcrumbs />"), "Topbar must continue rendering breadcrumbs.");
assert(breadcrumbs.includes('aria-label="Breadcrumb"'), "Breadcrumbs must keep an accessible breadcrumb nav.");

const criticalActions = [
  ["frontend/src/features/employees/EmployeesPage.tsx", "Add Employee"],
  ["frontend/src/features/documents/DocumentsPage.tsx", "Upload document"],
  ["frontend/src/features/imports/ImportCenterPage.tsx", "Template CSV"],
  ["frontend/src/features/backup-recovery/BackupRecoveryPage.tsx", "Create backup"],
  ["frontend/src/features/backup-recovery/BackupRecoveryPage.tsx", "Create restore job"],
  ["frontend/src/features/advances/AdvancesPage.tsx", "New advance"],
  ["frontend/src/features/salary-loans/SalaryLoansPage.tsx", "New loan"],
  ["frontend/src/features/assets/AssetsPage.tsx", "Create asset"],
  ["frontend/src/features/leave/LeavePage.tsx", "New request"],
  ["frontend/src/features/imports/ImportCenterPage.tsx", "Create job"],
  ["frontend/src/features/imports/ImportCenterPage.tsx", "Apply valid rows"],
  ["frontend/src/features/import-export/ImportExportPage.tsx", "Create export"],
  ["frontend/src/features/import-export/ImportExportPage.tsx", "Upload import"],
  ["frontend/src/features/report-exports/ReportExportActions.tsx", "CSV"],
  ["frontend/src/features/report-exports/ReportExportActions.tsx", "Print"],
  ["frontend/src/features/data-retention/DataRetentionPage.tsx", "Apply archive"],
];

for (const [file, actionText] of criticalActions) {
  const text = read(file);
  assert(text.includes(actionText), `${file} is missing critical action button text "${actionText}".`);
}

const leavePage = read("frontend/src/features/leave/LeavePage.tsx");
assert(!leavePage.includes("Leave operations"), "LeavePage still contains a duplicate page-level header card.");
assert(!leavePage.includes("Backend-paginated lists with reason-based HR actions."), "LeavePage still contains duplicate page-level description text.");
assert(/<PageActionBar[\s\S]*New request/.test(leavePage), "LeavePage New request action should be in the compact PageActionBar.");

const pageActionBarFiles = [
  "frontend/src/features/backup-recovery/BackupRecoveryPage.tsx",
  "frontend/src/features/import-export/ImportExportPage.tsx",
  "frontend/src/features/report-exports/ExportHistoryPage.tsx",
  "frontend/src/features/holidays/HolidayCalendarPage.tsx",
  "frontend/src/features/rosters/RostersPage.tsx",
  "frontend/src/features/notifications/NotificationsPage.tsx",
  "frontend/src/features/imports/ImportCenterPage.tsx",
  "frontend/src/features/employees/Employee360Page.tsx",
  "frontend/src/features/attendance/AttendanceCorrectionsPage.tsx",
  "frontend/src/features/long-leave/LongLeavePage.tsx",
  "frontend/src/features/payroll/PayrollPage.tsx",
  "frontend/src/features/profile/ProfilePage.tsx",
];
for (const file of pageActionBarFiles) {
  assert(read(file).includes("PageActionBar"), `${file} should use PageActionBar for compact page-level actions.`);
}

const multiButtonActionFiles = [
  "frontend/src/features/backup-recovery/BackupRecoveryPage.tsx",
  "frontend/src/features/import-export/ImportExportPage.tsx",
  "frontend/src/features/holidays/HolidayCalendarPage.tsx",
  "frontend/src/features/rosters/RostersPage.tsx",
  "frontend/src/features/employees/Employee360Page.tsx",
];
for (const file of multiButtonActionFiles) {
  assert(
    read(file).includes("flex flex-wrap items-center justify-end gap-2"),
    `${file} page-level multi-button actions should wrap responsively.`,
  );
}

if (failures.length > 0) {
  console.error("Page layout verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Page layout verification passed.");
}
