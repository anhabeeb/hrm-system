import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const pageHeader = read("frontend/src/components/layout/PageHeader.tsx");
assert(!pageHeader.includes("<h1"), "PageHeader must not render a large in-page title.");
assert(!pageHeader.includes("text-xl"), "PageHeader still contains large title styling.");
assert(!pageHeader.includes("tracking-tight"), "PageHeader still contains large heading styling.");
assert(!pageHeader.includes("border-b"), "PageHeader still renders the old large bordered header block.");
assert(!/<p[^>]*>\s*\{[^}]*description/i.test(pageHeader), "PageHeader still renders the old description paragraph.");
assert(pageHeader.includes("justify-end"), "PageHeader actions should align compactly to the right.");
assert(pageHeader.includes("flex-wrap"), "PageHeader actions should wrap cleanly on smaller screens.");
assert(pageHeader.includes("aria-label"), "PageHeader action bar should remain accessible.");

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
];

for (const [file, actionText] of criticalActions) {
  const text = read(file);
  assert(text.includes("PageHeader"), `${file} no longer uses the shared compact page action bar.`);
  assert(text.includes(actionText), `${file} is missing critical action button text "${actionText}".`);
}

if (failures.length > 0) {
  console.error("Page layout verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Page layout verification passed.");
}
