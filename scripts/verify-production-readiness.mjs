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

const listFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && [".git", "node_modules", "dist", ".wrangler"].includes(entry.name)) return [];
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  });
};

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const scripts = packageJson.scripts ?? {};

assert(packageLock.name === packageJson.name, "package-lock.json package name does not match package.json.");
assert(packageLock.version === packageJson.version, "package-lock.json package version does not match package.json.");
for (const [name, range] of Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
  const locked = packageLock.packages?.[""]?.dependencies?.[name] ?? packageLock.packages?.[""]?.devDependencies?.[name];
  assert(locked === range, `package-lock.json root dependency ${name} is not synchronized with package.json.`);
}

for (const scriptName of [
  "build",
  "typecheck",
  "test",
  "smoke:production",
  "acceptance:staging",
  "verify:production-readiness",
  "verify:production-acceptance",
]) {
  assert(Boolean(scripts[scriptName]), `package.json missing ${scriptName} script.`);
}

const wranglerPath = exists("wrangler.jsonc") ? "wrangler.jsonc" : exists("wrangler.toml") ? "wrangler.toml" : null;
assert(Boolean(wranglerPath), "wrangler.jsonc or wrangler.toml is missing.");
if (wranglerPath) {
  const wrangler = read(wranglerPath);
  for (const marker of [
    '"name": "hrm-system"',
    '"main": "src/index.ts"',
    '"binding": "DB"',
    '"binding": "DOCUMENTS_BUCKET"',
    '"binding": "BACKUP_BUCKET"',
    '"name": "REALTIME_ROOM"',
    '"directory": "./frontend/dist"',
    '"run_worker_first": true',
  ]) {
    assert(wrangler.includes(marker), `${wranglerPath} missing production marker ${marker}.`);
  }
  for (const secretName of ["SESSION_SECRET", "PASSWORD_PEPPER", "TOTP_ENCRYPTION_KEY", "RESEND_API_KEY", "DEVICE_TOKEN_SECRET"]) {
    assert(!new RegExp(`"${secretName}"\\s*:`).test(wrangler), `${secretName} must not be stored in ${wranglerPath}.`);
  }
}

for (const requiredFile of [
  "docs/deployment-checklist.md",
  "docs/production-acceptance-checklist.md",
  "docs/acceptance-test-matrix.md",
  "scripts/smoke-production.mjs",
  "scripts/acceptance-staging.mjs",
  "scripts/verify-production-readiness.mjs",
  "scripts/verify-production-acceptance.mjs",
  "scripts/verify-critical-routes.mjs",
  "scripts/verify-security-hardening.mjs",
  "scripts/verify-permission-audit.mjs",
  "scripts/verify-performance-d1.mjs",
]) {
  assert(exists(requiredFile), `${requiredFile} is missing.`);
}

const app = read("src/app.ts");
for (const routeMarker of [
  'apiV1.route("/users", usersRoutes)',
  'apiV1.route("/roles", rolesRoutes)',
  'apiV1.route("/permissions", permissionsRoutes)',
  'apiV1.route("/dashboard", dashboardRoutes)',
  'apiV1.route("/backup-recovery", backupRecoveryRoutes)',
  'apiV1.route("/data-retention", dataRetentionRoutes)',
]) {
  assert(app.includes(routeMarker), `src/app.ts missing critical route marker ${routeMarker}.`);
}

const allTextFiles = [
  ...listFiles(path.join(rootDir, "docs")),
  ...listFiles(path.join(rootDir, "scripts")),
  path.join(rootDir, "package.json"),
].filter((file) => /\.(md|mjs|json)$/.test(file));
for (const file of allTextFiles) {
  const text = fs.readFileSync(file, "utf8");
  assert(!text.includes(`--pool${"Options"}`), `${path.relative(rootDir, file)} contains unsupported Vitest poolOptions syntax.`);
}

const envLikeFiles = listFiles(rootDir)
  .map((file) => path.relative(rootDir, file).replace(/\\/g, "/"))
  .filter((file) => /(^|\/)\.env($|\.|\/)|(^|\/)\.dev\.vars$/.test(file))
  .filter((file) => !file.endsWith(".example"));
assert(envLikeFiles.length === 0, `Potential secret env files are present: ${envLikeFiles.join(", ")}.`);

const authToken = exists("frontend/src/lib/auth-token.ts") ? read("frontend/src/lib/auth-token.ts") : "";
assert(!/localStorage|sessionStorage|hrm\.auth\.token/.test(authToken), "frontend auth token storage still references persistent browser storage.");

if (failures.length > 0) {
  console.error("Production readiness verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Production readiness verification passed.");
}

export const verifyProductionReadiness = () => ({
  ok: failures.length === 0,
  failures,
});
