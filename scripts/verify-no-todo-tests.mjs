import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanRoots = ["tests", "frontend/src/tests"];
const ignoredDirs = new Set(["node_modules", "dist", "build", ".git"]);
const unsupportedVitestFlag = `--pool${"Options"}`;
const failures = [];

const listFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    if (entry.isFile()) files.push(full);
  }
  return files;
};

const testFiles = scanRoots.flatMap((scanRoot) => listFiles(path.join(rootDir, scanRoot)));
const forbiddenTestPatterns = [
  { pattern: /\b(?:it|test|describe)\.todo\b/, label: "Vitest todo declaration" },
  { pattern: /\b(?:it|test|describe)\.skip\b/, label: "Vitest skip declaration" },
  { pattern: /\.(?:todo|skip)\(/, label: "todo/skip call" },
  { pattern: /TODO/i, label: "test-near TODO comment" },
];

for (const file of testFiles) {
  const relative = path.relative(rootDir, file).replace(/\\/g, "/");
  if (/(^|\/)[^/]*\.todo(?:\.|$)/i.test(relative)) {
    failures.push(`${relative}: todo-named test file is not allowlisted.`);
  }
  const text = fs.readFileSync(file, "utf8");
  for (const { pattern, label } of forbiddenTestPatterns) {
    if (pattern.test(text)) failures.push(`${relative}: ${label} remains.`);
  }
}

const guidanceFiles = [
  ...listFiles(path.join(rootDir, "docs")),
  ...listFiles(path.join(rootDir, "scripts")),
  path.join(rootDir, "package.json"),
].filter((file) => fs.existsSync(file));

for (const file of guidanceFiles) {
  const relative = path.relative(rootDir, file).replace(/\\/g, "/");
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(unsupportedVitestFlag)) {
    failures.push(`${relative}: unsupported Vitest 3 poolOptions syntax remains in guidance.`);
  }
}

const coverageAudit = path.join(rootDir, "docs/test-coverage-audit.md");
if (!fs.existsSync(coverageAudit)) {
  failures.push("docs/test-coverage-audit.md: coverage audit document is missing.");
} else {
  const text = fs.readFileSync(coverageAudit, "utf8");
  for (const marker of [
    "Before",
    "After",
    "Vitest 4",
    "Remaining intentionally skipped tests",
    "outlet-access-hardening",
    "no completed critical phase behavior remains hidden",
  ]) {
    if (!text.includes(marker)) failures.push(`docs/test-coverage-audit.md: missing marker "${marker}".`);
  }
}

const outletHardening = path.join(rootDir, "tests/outlet-access-hardening.test.ts");
if (!fs.existsSync(outletHardening)) {
  failures.push("tests/outlet-access-hardening.test.ts: outlet access hardening behavior tests are missing.");
} else {
  const text = fs.readFileSync(outletHardening, "utf8");
  for (const marker of [
    "outlet-limited user sees only their outlet employees",
    "outlet-limited payroll item lists and totals",
    "company-level approval records are visible only to eligible actors",
    "payroll locks block attendance leave long leave advances loans asset deductions and payroll-impacting imports",
  ]) {
    if (!text.includes(marker)) failures.push(`tests/outlet-access-hardening.test.ts: missing behavior coverage marker "${marker}".`);
  }
}

const frontendHardening = path.join(rootDir, "tests/frontend-ui-hardening.test.ts");
if (!fs.existsSync(frontendHardening)) {
  failures.push("tests/frontend-ui-hardening.test.ts: frontend UI hardening tests are missing.");
} else {
  const text = fs.readFileSync(frontendHardening, "utf8");
  for (const marker of [
    "error diagnostics use friendly sanitized messages",
    "selectors use the permission-aware lookup endpoints",
    "router and navigation guard leave payroll documents approvals reports imports exports and backup pages",
    "hidden unauthorized tabs do not enable protected API queries",
    "sensitive raw metadata keys are sanitized before display",
    "does not add dark mode or a theme switcher",
  ]) {
    if (!text.includes(marker)) failures.push(`tests/frontend-ui-hardening.test.ts: missing frontend coverage marker "${marker}".`);
  }
}

if (failures.length > 0) {
  console.error("No-placeholder test verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("No-placeholder test verification passed.");
}
