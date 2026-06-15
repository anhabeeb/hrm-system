import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readText = (relativePath, baseDir = rootDir) =>
  fs.readFileSync(path.join(baseDir, relativePath), "utf8");

const exists = (relativePath, baseDir = rootDir) =>
  fs.existsSync(path.join(baseDir, relativePath));

const normalize = (text) => text.replace(/\s+/g, " ");

const assertContains = (failures, label, text, pattern, hint) => {
  const matches = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);

  if (!matches) {
    failures.push(`${label}: ${hint}`);
  }
};

export const verifyCriticalRoutes = (baseDir = rootDir) => {
  const failures = [];
  const appPath = "src/app.ts";
  const indexPath = "src/index.ts";
  const wranglerPath = "wrangler.jsonc";
  const packagePath = "package.json";

  for (const file of [appPath, indexPath, wranglerPath, packagePath]) {
    if (!exists(file, baseDir)) {
      failures.push(`${file}: required file is missing.`);
    }
  }

  for (const file of [
    "src/routes/users.routes.ts",
    "src/routes/roles.routes.ts",
    "src/routes/permissions.routes.ts",
    "src/routes/version.routes.ts",
    "src/routes/holidays.routes.ts",
    "src/routes/dashboard.routes.ts",
  ]) {
    if (!exists(file, baseDir)) {
      failures.push(`${file}: critical API route file is missing.`);
    }
  }

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  const app = normalize(readText(appPath, baseDir));
  const index = normalize(readText(indexPath, baseDir));
  const wrangler = normalize(readText(wranglerPath, baseDir));
  const packageJson = JSON.parse(readText(packagePath, baseDir));
  const scripts = packageJson.scripts ?? {};
  const buildRunner = exists("scripts/run-production-build-checks.mjs", baseDir)
    ? readText("scripts/run-production-build-checks.mjs", baseDir)
    : "";

  assertContains(
    failures,
    appPath,
    app,
    /import\s*\{\s*usersRoutes\s*\}\s*from\s*["']\.\/routes\/users\.routes["'];/,
    "missing usersRoutes import.",
  );
  assertContains(
    failures,
    appPath,
    app,
    /import\s*\{\s*rolesRoutes\s*\}\s*from\s*["']\.\/routes\/roles\.routes["'];/,
    "missing rolesRoutes import.",
  );
  assertContains(
    failures,
    appPath,
    app,
    /import\s*\{\s*permissionsRoutes\s*\}\s*from\s*["']\.\/routes\/permissions\.routes["'];/,
    "missing permissionsRoutes import.",
  );
  assertContains(
    failures,
    appPath,
    app,
    /import\s*\{\s*versionRoutes\s*\}\s*from\s*["']\.\/routes\/version\.routes["'];/,
    "missing versionRoutes import.",
  );
  assertContains(
    failures,
    appPath,
    app,
    /import\s*\{\s*holidaysRoutes\s*\}\s*from\s*["']\.\/routes\/holidays\.routes["'];/,
    "missing holidaysRoutes import.",
  );
  assertContains(
    failures,
    appPath,
    app,
    /import\s*\{\s*dashboardRoutes\s*\}\s*from\s*["']\.\/routes\/dashboard\.routes["'];/,
    "missing dashboardRoutes import.",
  );

  for (const [route, variable] of [
    ["/version", "versionRoutes"],
    ["/users", "usersRoutes"],
    ["/roles", "rolesRoutes"],
    ["/permissions", "permissionsRoutes"],
    ["/holidays", "holidaysRoutes"],
    ["/dashboard", "dashboardRoutes"],
  ]) {
    assertContains(
      failures,
      appPath,
      app,
      `apiV1.route("${route}", ${variable});`,
      `missing apiV1.route("${route}", ${variable}) registration.`,
    );
  }

  assertContains(
    failures,
    indexPath,
    index,
    /url\.pathname\.startsWith\(["']\/api\/["']\)/,
    "Worker entrypoint must route /api/* to the API app/router.",
  );
  assertContains(
    failures,
    indexPath,
    index,
    /apiApp\.fetch\(request,\s*env,\s*ctx\)/,
    "Worker entrypoint must call the API app/router for /api/*.",
  );
  assertContains(
    failures,
    indexPath,
    index,
    /env\.ASSETS\.fetch\(request\)/,
    "Worker entrypoint must send non-API routes to env.ASSETS.fetch(request).",
  );

  for (const [key, expected] of [
    ["assets.directory", '"directory": "./frontend/dist"'],
    ["assets.not_found_handling", '"not_found_handling": "single-page-application"'],
    ["assets.binding", '"binding": "ASSETS"'],
  ]) {
    assertContains(failures, wranglerPath, wrangler, expected, `missing ${key} = ${expected}.`);
  }
  assertContains(
    failures,
    wranglerPath,
    wrangler,
    /"run_worker_first"\s*:\s*true/,
    "assets.run_worker_first must be true so frontend HTML/static asset responses pass through Worker security headers.",
  );

  if (scripts.build !== "node scripts/run-production-build-checks.mjs") {
    failures.push('package.json: "build" must use scripts/run-production-build-checks.mjs.');
  }
  const frontendBuildScript = scripts["build:frontend"] ?? "";
  const frontendInstallIndex = frontendBuildScript.indexOf("npm --prefix frontend ci --include=dev --no-audit --no-fund");
  const frontendBuildIndex = frontendBuildScript.indexOf("npm --prefix frontend run build");
  const usesFrontendBuild = frontendInstallIndex >= 0 && frontendBuildIndex > frontendInstallIndex;
  if (!usesFrontendBuild) {
    failures.push(
      'package.json: "build:frontend" must install frontend dependencies with npm ci before building frontend/dist.',
    );
  }
  const frontendPackage = JSON.parse(readText("frontend/package.json", baseDir));
  const frontendPackageBuild = frontendPackage.scripts?.build ?? "";
  if (
    !frontendPackageBuild.includes("npm run typecheck") ||
    !frontendPackageBuild.includes("vite build") ||
    !frontendPackageBuild.includes("vite.config.mjs") ||
    !frontendPackageBuild.includes("--configLoader native")
  ) {
    failures.push('frontend/package.json: "build" must run typecheck and the Vite native production build directly.');
  }
  if (scripts["build:all"] !== "node scripts/run-production-build-checks.mjs") {
    failures.push('package.json: "build:all" must use scripts/run-production-build-checks.mjs.');
  }
  if (!buildRunner.includes('"build:api"')) {
    failures.push("scripts/run-production-build-checks.mjs must include API typecheck/build.");
  }
  if (!buildRunner.includes('"build:frontend"')) {
    failures.push("scripts/run-production-build-checks.mjs must include frontend build.");
  }
  if (!buildRunner.includes('"verify:frontend-assets"')) {
    failures.push("scripts/run-production-build-checks.mjs must verify frontend assets.");
  }
  if (!buildRunner.includes('"verify:critical-routes"')) {
    failures.push("scripts/run-production-build-checks.mjs must run verify:critical-routes.");
  }
  if (!buildRunner.includes("timeout")) {
    failures.push("scripts/run-production-build-checks.mjs must apply deterministic per-command timeouts.");
  }
  if (!scripts.deploy?.includes("wrangler deploy")) {
    failures.push('package.json: "deploy" must deploy the Worker script with wrangler deploy.');
  }

  return { ok: failures.length === 0, failures };
};

export const printVerificationResult = (result) => {
  if (result.ok) {
    console.log("Critical route verification passed.");
    return;
  }

  console.error("Critical route verification failed:");
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyCriticalRoutes();
  printVerificationResult(result);

  if (!result.ok) {
    process.exitCode = 1;
  }
}
