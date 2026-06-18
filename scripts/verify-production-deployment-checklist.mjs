import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const checklistPath = "docs/production-deployment-checklist.md";
assert(exists(checklistPath), `${checklistPath} is missing.`);

const checklist = exists(checklistPath) ? read(checklistPath) : "";
const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};

assert(
  scripts["verify:production-deployment-checklist"] === "node scripts/verify-production-deployment-checklist.mjs",
  "package.json missing verify:production-deployment-checklist script.",
);

for (const command of [
  "npm ci --no-audit --no-fund",
  "npm --prefix frontend ci --include=dev --no-audit --no-fund",
  "npm run typecheck",
  "npm --prefix frontend run typecheck",
  "npm --prefix frontend run build",
  "npm run build:frontend",
  "npm run verify:final-hrm-acceptance",
  "npm run verify:leave-policy-rules",
  "npm run verify:self-service-approval-chain",
  "npm run verify:setup-guide",
  "npm run verify:settings-module-lifecycle",
  "npm run verify:module-toggles",
  "npm run verify:module-aware-approvals",
  "npm run verify:module-aware-alerts",
  "npm run verify:module-aware-surfaces",
  "npm run verify:admin-utility-pages-completion",
  "npm run verify:production-readiness",
  "npm run verify:migrations-production-ready",
  "npm run verify:permission-audit",
  "npm run verify:dashboard-personalization",
  "npm run verify:hr-reports-schema",
  "npm run verify:payroll-reports-schema",
  "npm run verify:imports-schema",
  "npm run verify:export-print-schema",
  "npm run verify:attendance-calendar",
  "npm run verify:payroll-schema",
  "npm run verify:payslip-schema",
  "npm run verify:performance-d1",
  "npm test -- leave-policy-rules.test.ts self-service-approval-chain.test.ts",
  "npm test -- module-toggles.test.ts settings.test.ts admin-settings-pages.test.ts setup-guide.test.ts",
  "npm test -- approval-workflow-engine.test.ts approvals.test.ts notifications.test.ts employee-self-service-dashboard.test.ts",
  "npm test -- hr-reports.test.ts payroll-reports.test.ts imports.test.ts export-print.test.ts",
  "npm test -- attendance-calendar.test.ts payroll.test.ts payslips.test.ts advances.test.ts salary-loans.test.ts",
]) {
  assert(checklist.includes(command), `Checklist missing required command: ${command}`);
}

const rootInstallIndex = checklist.indexOf("npm ci --no-audit --no-fund");
const frontendInstallIndex = checklist.indexOf("npm --prefix frontend ci --include=dev --no-audit --no-fund");
const frontendTypecheckIndex = checklist.indexOf("npm --prefix frontend run typecheck");
const frontendBuildIndex = checklist.indexOf("npm --prefix frontend run build");
assert(rootInstallIndex >= 0, "Checklist must include root npm ci before build commands.");
assert(frontendInstallIndex >= 0, "Checklist must install frontend dependencies before frontend typecheck/build.");
assert(frontendTypecheckIndex >= 0, "Checklist must include frontend typecheck.");
assert(frontendBuildIndex >= 0, "Checklist must include frontend build.");
assert(
  rootInstallIndex < frontendInstallIndex &&
    frontendInstallIndex < frontendTypecheckIndex &&
    frontendInstallIndex < frontendBuildIndex,
  "Checklist command order must install frontend dependencies before frontend typecheck/build.",
);

for (const section of [
  "Pre-Deployment Checks",
  "Required Build Commands",
  "Required Verifiers",
  "Required Tests",
  "Cloudflare Worker Deployment Readiness",
  "D1 Database Migration Checklist",
  "R2 Bucket Checklist",
  "Cloudflare Pages Frontend Checklist",
  "Bootstrap and Setup Guide Manual QA",
  "Module Toggle Manual QA",
  "Leave Policy Manual QA",
  "Self-Service Approval Chain Manual QA",
  "Attendance and Roster Manual QA",
  "Payroll Manual QA",
  "Reports and Import/Export Manual QA",
  "Backup and Restore Manual QA",
  "Security, Permission, and Audit Manual QA",
  "Post-Deployment Smoke Tests",
  "Rollback Checklist",
  "Troubleshooting Notes",
]) {
  assert(checklist.includes(section), `Checklist missing section: ${section}`);
}

for (const marker of [
  "Worker name:",
  "D1 binding: `DB`",
  "Documents R2 binding: `DOCUMENTS_BUCKET`",
  "Backups R2 binding: `BACKUP_BUCKET`",
  "VITE_API_BASE_URL=<https://api.example.com>",
  "disabled_by_choice",
  "needs_setup_after_enable",
  "FRL",
  "Sick Leave",
  "Attendance Allowance",
  "View Progress",
  "Department Senior to Manager to Director to HR Senior Staff to HR Manager",
  "CSV, Print, HTML, and `print_html` are not exposed",
  "typed destructive confirmation",
  "Employee cannot access another employee's approval chain",
  "Do not roll back D1 casually",
]) {
  assert(checklist.includes(marker), `Checklist missing deployment/QA marker: ${marker}`);
}

const forbiddenSecretPatterns = [
  /SESSION_SECRET\s*=\s*(?!<)[^\s`]+/i,
  /PASSWORD_PEPPER\s*=\s*(?!<)[^\s`]+/i,
  /TOTP_ENCRYPTION_KEY\s*=\s*(?!<)[^\s`]+/i,
  /DEVICE_TOKEN_SECRET\s*=\s*(?!<)[^\s`]+/i,
  /JWT[_A-Z]*SECRET\s*=\s*(?!<)[^\s`]+/i,
  /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /sk_(live|test)_[A-Za-z0-9]{16,}/i,
  /eyJ[A-Za-z0-9_-]{20,}/,
];

for (const pattern of forbiddenSecretPatterns) {
  assert(!pattern.test(checklist), `Checklist appears to contain a real secret matching ${pattern}.`);
}

assert(checklist.includes("<") && checklist.includes(">"), "Checklist should use placeholder values for deployment-specific settings.");

if (failures.length > 0) {
  console.error("Production deployment checklist verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Production deployment checklist verification passed.");
}
