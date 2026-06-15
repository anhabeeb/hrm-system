import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const fileExists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readIfExists = (file) => (fileExists(file) ? read(file) : "");
const fail = (message) => failures.push(message);

const requireFile = (file) => {
  if (!fileExists(file)) fail(`${file} is missing.`);
};

const requireIncludes = (label, content, needles) => {
  for (const needle of needles) {
    if (!content.includes(needle)) fail(`${label} is missing marker: ${needle}`);
  }
};

const requireAny = (label, content, needles) => {
  if (!needles.some((needle) => content.includes(needle))) {
    fail(`${label} is missing one of: ${needles.join(", ")}`);
  }
};

const listFiles = (dir, predicate = () => true) => {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(absolute, entry.name);
    const relative = path.relative(root, full).replace(/\\/g, "/");
    if (entry.isDirectory() && !["node_modules", "dist", "build", ".git"].includes(entry.name)) {
      files.push(...listFiles(relative, predicate));
    }
    if (entry.isFile() && predicate(relative)) files.push(relative);
  }
  return files;
};

const criticalFiles = [
  "src/modules/approvals/approval-workflow-engine.service.ts",
  "src/modules/leave/leave.service.ts",
  "src/modules/attendance/attendance.service.ts",
  "src/modules/rosters/rosters.service.ts",
  "src/modules/operation-ownership/operation-ownership.service.ts",
  "src/modules/payroll/payroll-adjustments.service.ts",
  "src/modules/advances/advance-salary.service.ts",
  "src/modules/documents/document-kyc-approval.service.ts",
  "src/modules/employee-structure/employee-structure-change.service.ts",
  "src/modules/employee-lifecycle/employee-exit.service.ts",
  "src/modules/employee-discipline/employee-discipline.service.ts",
  "frontend/src/app/router.tsx",
  "frontend/src/lib/default-landing.ts",
  "frontend/src/lib/navigation.ts",
  "scripts/run-production-build-checks.mjs",
  "scripts/verify-dependency-security.mjs",
  "wrangler.jsonc",
];

criticalFiles.forEach(requireFile);

const migrations = listFiles("migrations", (file) => /^\d{4}_.+\.sql$/.test(path.basename(file))).sort();
const migrationText = migrations.map(read).join("\n");
const packageJson = readIfExists("package.json");
const frontendPackageJson = readIfExists("frontend/package.json");
const vitestConfig = readIfExists("vitest.config.mjs") || readIfExists("vitest.config.ts");
const productionBuildRunner = readIfExists("scripts/run-production-build-checks.mjs");
const dependencySecurityVerifier = readIfExists("scripts/verify-dependency-security.mjs");
const approvalEngine = readIfExists("src/modules/approvals/approval-workflow-engine.service.ts");
const operationOwnership = `${readIfExists("migrations/0065_operation_ownership_responsibility_matrix.sql")}\n${readIfExists("migrations/0066_operation_ownership_matrix_completion.sql")}\n${readIfExists("src/modules/operation-ownership/operation-ownership.service.ts")}\n${readIfExists("src/modules/operation-ownership/operation-ownership.types.ts")}`;
const router = readIfExists("frontend/src/app/router.tsx");
const navigation = readIfExists("frontend/src/lib/navigation.ts");
const wrangler = readIfExists("wrangler.jsonc");

for (let index = 0; index < migrations.length; index += 1) {
  const expected = String(index + 1).padStart(4, "0");
  const actual = path.basename(migrations[index]).slice(0, 4);
  if (actual !== expected) {
    fail(`Migration ordering is not sequential near ${migrations[index]}; expected ${expected}.`);
    break;
  }
}

[
  "0061_general_approval_workflow_engine.sql",
  "0064_roster_change_approval_engine.sql",
  "0065_operation_ownership_responsibility_matrix.sql",
  "0066_operation_ownership_matrix_completion.sql",
  "0067_payroll_adjustment_approval_engine.sql",
  "0068_advance_salary_approval_engine.sql",
  "0069_employee_document_kyc_approval_engine.sql",
  "0071_document_kyc_staging_hardening.sql",
  "0072_employee_structure_change_approval_engine.sql",
  "0073_employee_lifecycle_approval_engine.sql",
  "0075_employee_disciplinary_action_approval_engine.sql",
  "0076_disciplinary_action_lifecycle_hardening.sql",
].forEach((file) => {
  if (!migrations.includes(`migrations/${file}`)) fail(`Critical migration is missing: ${file}.`);
});

requireIncludes("package scripts", packageJson, [
  '"build": "node scripts/run-production-build-checks.mjs"',
  '"build:all": "node scripts/run-production-build-checks.mjs"',
  "build:api",
  "build:frontend",
  "verify:no-todo-tests",
  "verify:disciplinary-action-approval-engine",
  "verify:employee-lifecycle-approval-engine",
  "verify:employee-structure-change-approval-engine",
  "verify:document-kyc-approval-engine",
  "verify:advance-salary-approval-engine",
  "verify:payroll-adjustment-approval-engine",
  "verify:operation-ownership",
  "verify:approval-workflow-engine",
]);

requireIncludes("production build runner", productionBuildRunner, [
  "spawnSync",
  "timeout",
  "verify:security-hardening",
  "verify:no-todo-tests",
  "verify:performance-d1",
  "Production build checks passed.",
]);

requireIncludes("dependency security verifier timeout", dependencySecurityVerifier, [
  "execFileSync",
  "AUDIT_TIMEOUT_MS",
  "timeout: AUDIT_TIMEOUT_MS",
  "--audit-level=critical",
  "did not finish within",
]);

requireIncludes("frontend package scripts", frontendPackageJson, [
  "npm run typecheck && vite build --config vite.config.mjs --configLoader native",
  "tsc --noEmit --project tsconfig.json --pretty false",
]);

requireIncludes("vitest stability config", vitestConfig, [
  "testTimeout",
  "hookTimeout",
  "15_000",
]);

requireIncludes("wrangler deployment config", wrangler, [
  '"main": "src/index.ts"',
  '"directory": "./frontend/dist"',
  '"binding": "ASSETS"',
  '"binding": "DB"',
  '"migrations_dir": "migrations"',
  '"binding": "DOCUMENTS_BUCKET"',
  '"compatibility_date"',
]);

requireIncludes("operation ownership catalog", operationOwnership, [
  "LEAVE_REQUEST",
  "ATTENDANCE_CORRECTION",
  "ROSTER_CHANGE",
  "PAYROLL_ADJUSTMENT",
  "ADVANCE_SALARY_REQUEST",
  "ADVANCE_SALARY_PAYMENT",
  "DOCUMENT_KYC_UPDATE",
  "DOCUMENT_APPROVAL",
  "EMPLOYEE_TRANSFER",
  "EMPLOYEE_STRUCTURE_CHANGE",
  "RESIGNATION",
  "OFFBOARDING",
  "DISCIPLINARY_ACTION",
  "OWNER",
  "FINAL_APPROVAL",
  "EXECUTION",
  "AUDIT_VIEW",
  "ESCALATION",
  "USE_SUPER_ADMIN",
  "HOLD_FOR_MANUAL_ASSIGNMENT",
  "BLOCK_OPERATION",
]);

requireIncludes("generic approval route protection", approvalEngine, [
  "LEAVE_REQUEST",
  "ATTENDANCE_CORRECTION",
  "ROSTER_CHANGE",
  "PAYROLL_ADJUSTMENT",
  "ADVANCE_SALARY_REQUEST",
  "DOCUMENT_KYC_UPDATE",
  "EMPLOYEE_TRANSFER",
  "EMPLOYEE_STRUCTURE_CHANGE",
  "RESIGNATION",
  "OFFBOARDING",
  "DISCIPLINARY_ACTION",
  "allowModuleBoundAction",
]);

requireIncludes("approval self-approval hardening", approvalEngine, [
  "allow_self_approval",
  "actorIsRequesterEmployee",
  "assignedEmployeeIsRequester",
  "assignedUserIsRequesterEmployee",
  "canSubmitApprovalRequest",
  "cancelAny",
]);

const rowLevelChecks = [
  ["leave row-level visibility", "src/modules/leave/leave.service.ts", ["buildLeaveRequestVisibilityFilter", "canViewLeaveRequest"]],
  ["attendance correction row-level visibility", "src/modules/attendance/attendance.service.ts", ["buildAttendanceCorrectionVisibilityFilter", "canViewAttendanceCorrection"]],
  ["roster change row-level visibility", "src/modules/rosters/rosters.service.ts", ["buildRosterChangeVisibilityFilter", "assertCanViewRosterChange"]],
  ["payroll adjustment row-level visibility", "src/modules/payroll/payroll-adjustments.service.ts", ["buildPayrollAdjustmentVisibilityFilter", "canViewPayrollAdjustment"]],
  ["advance salary row-level visibility", "src/modules/advances/advance-salary.service.ts", ["buildAdvanceSalaryVisibilityFilter", "canViewAdvanceSalaryRequest"]],
  ["document KYC row-level visibility", "src/modules/documents/document-kyc-approval.service.ts", ["buildDocumentKycVisibilityFilter", "canViewDocumentKycRequest"]],
  ["employee structure change row-level visibility", "src/modules/employee-structure/employee-structure-change.service.ts", ["buildEmployeeStructureChangeVisibilityFilter", "canViewEmployeeStructureChangeRequest"]],
  ["employee lifecycle row-level visibility", "src/modules/employee-lifecycle/employee-exit.service.ts", ["buildEmployeeExitVisibilityFilter", "canViewEmployeeExitRequest", "buildOffboardingTaskVisibilityFilter"]],
  ["disciplinary row-level visibility", "src/modules/employee-discipline/employee-discipline.service.ts", ["buildDisciplinaryActionVisibilityFilter", "buildDisciplinaryRecordVisibilityFilter", "canViewDisciplinaryAction"]],
  ["approval request row-level visibility", "src/modules/approvals/approval-workflow-engine.service.ts", ["buildApprovalRequestVisibilityFilter", "canViewApprovalRequest"]],
];

for (const [label, file, needles] of rowLevelChecks) {
  requireIncludes(label, readIfExists(file), needles);
}

const createForOthersChecks = [
  ["leave create-for-others", "src/modules/leave/leave.service.ts", ["canCreateLeaveForEmployee", "leave.requests.create_for_employee"]],
  ["roster create-for-others", "src/modules/rosters/rosters.service.ts", ["roster.changes.createForOthers"]],
  ["payroll create-for-others", "src/modules/payroll/payroll-adjustments.service.ts", ["canCreatePayrollAdjustmentForEmployee", "payroll.adjustments.createForOthers"]],
  ["advance create-for-others", "src/modules/advances/advance-salary.service.ts", ["canCreateAdvanceSalaryForEmployee", "advanceSalary.requests.createForOthers"]],
  ["document KYC create-for-others", "src/modules/documents/document-kyc-approval.service.ts", ["canCreateDocumentKycForEmployee", "documentKyc.requests.createForOthers"]],
  ["structure change create-for-others", "src/modules/employee-structure/employee-structure-change.service.ts", ["canCreateForEmployee", "employees.structureRequests.createForOthers"]],
  ["lifecycle create-for-others", "src/modules/employee-lifecycle/employee-exit.service.ts", ["canCreateForEmployee", "createForOthers"]],
  ["disciplinary create-for-others", "src/modules/employee-discipline/employee-discipline.service.ts", ["canCreateForEmployee", "employeeDiscipline.actions.createForOthers"]],
];

for (const [label, file, needles] of createForOthersChecks) {
  requireIncludes(label, readIfExists(file), needles);
}

const sensitivePayloadModules = [
  "src/modules/payroll/payroll-adjustments.validators.ts",
  "src/modules/advances/advance-salary.validators.ts",
  "src/modules/documents/document-kyc.validators.ts",
  "src/modules/employee-structure/employee-structure-change.validators.ts",
  "src/modules/employee-lifecycle/employee-exit.validators.ts",
  "src/modules/employee-discipline/employee-discipline.validators.ts",
];

for (const file of sensitivePayloadModules) {
  requireIncludes(`${file} sensitive payload validation`, readIfExists(file), [
    "password",
    "password_hash",
    "token",
    "session_token",
    "reset_token",
    "totp_secret",
    "secret",
    "api_key",
    "device_secret",
  ]);
}

requireIncludes("frontend routes", router, [
  "/self/dashboard",
  "/self/requests",
  "/approvals",
  "/leave",
  "/attendance/corrections",
  "/rosters",
  "/payroll",
  "/advances",
  "/self/documents",
  "/organization/structure-change-requests",
  "/offboarding",
  "/disciplinary-actions",
  "getDefaultLandingPath",
]);

requireIncludes("frontend navigation", navigation, [
  "dashboard.view",
  "self.dashboard.view",
  "operationOwnership.view",
  "employeeDiscipline.actions",
]);

const frontendApiFiles = [
  "frontend/src/features/approvals/approvals.api.ts",
  "frontend/src/features/leave/leave.api.ts",
  "frontend/src/features/attendance/attendance.api.ts",
  "frontend/src/features/rosters/rosters.api.ts",
  "frontend/src/features/payroll/payroll.api.ts",
  "frontend/src/features/advances/advances.api.ts",
  "frontend/src/features/documents/documents.api.ts",
  "frontend/src/features/employee-structure-change/employeeStructureChange.api.ts",
  "frontend/src/features/offboarding/employeeExit.api.ts",
  "frontend/src/features/discipline/discipline.api.ts",
];
frontendApiFiles.forEach(requireFile);

const frontendSource = listFiles("frontend/src", (file) => /\.(ts|tsx)$/.test(file))
  .map((file) => `// ${file}\n${read(file)}`)
  .join("\n");
if (/\b(?:window\.)?alert\s*\(/.test(frontendSource)) fail("Browser alert() usage exists in frontend/src.");
if (/\b(?:window\.)?confirm\s*\(/.test(frontendSource)) fail("Browser confirm() usage exists in frontend/src.");
if (/\bdarkMode\b/.test(frontendSource) || /\bdark:[\w-]/.test(frontendSource)) fail("Dark mode implementation marker exists in frontend/src.");

const testsSource = listFiles("tests", (file) => /\.test\.ts$/.test(file)).map(read).join("\n");
if (/expect\s*\(\s*true\s*\)\.toBe\s*\(\s*true\s*\)/.test(testsSource)) fail("Placeholder expect(true).toBe(true) test remains.");
if (/\b(?:it|test|describe)\.(?:skip|todo)\b/.test(testsSource)) fail("Skipped or todo Vitest test remains.");

const docs = [
  "docs/production-stabilization-checklist.md",
  "docs/api-smoke-test-checklist.md",
  "docs/final-production-stabilization-report.md",
];
docs.forEach(requireFile);

if (!migrationText.includes("CREATE TABLE IF NOT EXISTS employee_disciplinary_records")) {
  fail("Latest disciplinary official records migration marker is missing.");
}

if (failures.length > 0) {
  console.error("Final production stabilization verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Final production stabilization verification passed.");
}
