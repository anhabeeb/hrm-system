import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(rootDir, relativePath));
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const file of [
  "docs/production-acceptance-checklist.md",
  "docs/acceptance-test-matrix.md",
  "docs/deployment-checklist.md",
  "scripts/smoke-production.mjs",
  "scripts/acceptance-staging.mjs",
  "scripts/verify-production-readiness.mjs",
  "scripts/verify-production-acceptance.mjs",
  "tests/production-acceptance.test.ts",
]) {
  assert(exists(file), `${file} is missing.`);
}

const packageJson = JSON.parse(read("package.json"));
for (const scriptName of ["smoke:production", "acceptance:staging", "verify:production-readiness", "verify:production-acceptance"]) {
  assert(Boolean(packageJson.scripts?.[scriptName]), `package.json missing ${scriptName} script.`);
}

if (exists("scripts/smoke-production.mjs")) {
  const smoke = read("scripts/smoke-production.mjs");
  for (const marker of [
    "protectedApiPaths",
    "cors-preflight",
    "security-headers",
    "SMOKE_BASE_URL",
    "SMOKE_API_BASE_URL",
    "SMOKE_ALLOWED_ORIGIN",
    "method: check.method ?? \"GET\"",
  ]) {
    assert(smoke.includes(marker), `smoke-production.mjs missing marker ${marker}.`);
  }
  assert(!/POST|PUT|PATCH|DELETE/.test(smoke.replace('"POST"', "")), "smoke-production.mjs must not allow unsafe mutations by default.");
}

if (exists("scripts/acceptance-staging.mjs")) {
  const acceptance = read("scripts/acceptance-staging.mjs");
  for (const marker of [
    "Staging-only acceptance script",
    "ACCEPTANCE_BASE_URL",
    "ACCEPTANCE_USERNAME",
    "ACCEPTANCE_PASSWORD",
    "ACCEPTANCE_ENABLE_MUTATIONS",
    "Mutation acceptance tests are intentionally disabled",
  ]) {
    assert(acceptance.includes(marker), `acceptance-staging.mjs missing marker ${marker}.`);
  }
  assert(!/console\.log\(.*PASSWORD|console\.log\(.*USERNAME|logger\.log\(.*PASSWORD|logger\.log\(.*USERNAME/i.test(acceptance), "acceptance-staging.mjs must not print credentials.");
}

if (exists("docs/production-acceptance-checklist.md")) {
  const checklist = read("docs/production-acceptance-checklist.md");
  for (const marker of [
    "Environment Readiness",
    "Required Secrets",
    "Required Non-Secret Environment Variables",
    "Cloudflare Resources",
    "Database Readiness",
    "Frontend Readiness",
    "Security Readiness",
    "Module Acceptance",
    "Rollback Readiness",
    "hrm.cafeasiana.com.mv",
    "Do not deploy from stale ZIP folders",
  ]) {
    assert(checklist.includes(marker), `production acceptance checklist missing ${marker}.`);
  }
}

if (exists("docs/acceptance-test-matrix.md")) {
  const matrix = read("docs/acceptance-test-matrix.md");
  for (const marker of ["Role/User", "Precondition", "Steps", "Expected Result", "Pass/Fail", "Employee 360", "Backup create/download", "Data retention preview"]) {
    assert(matrix.includes(marker), `acceptance matrix missing ${marker}.`);
  }
}

if (exists("docs/deployment-checklist.md")) {
  const deployment = read("docs/deployment-checklist.md");
  for (const marker of [
    "Production Acceptance",
    "npm run verify:production-readiness",
    "npm run verify:production-acceptance",
    "npm run smoke:production",
    "Do not deploy from stale ZIP folders",
    "Make sure `/api/*` routes go to Worker API",
    "D1 migrations may not be reversible",
  ]) {
    assert(deployment.includes(marker), `deployment checklist missing production acceptance marker ${marker}.`);
  }
}

if (failures.length > 0) {
  console.error("Production acceptance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Production acceptance verification passed.");
}

export const verifyProductionAcceptance = () => ({
  ok: failures.length === 0,
  failures,
});
