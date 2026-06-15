import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const checks = [
  ["build:api", 120_000],
  ["build:frontend", 300_000],
  ["verify:frontend-assets", 30_000],
  ["verify:critical-routes", 30_000],
  ["verify:document-schema", 30_000],
  ["verify:salary-schema", 30_000],
  ["verify:approval-schema", 30_000],
  ["verify:compensation-schema", 30_000],
  ["verify:payroll-schema", 30_000],
  ["verify:payslip-schema", 30_000],
  ["verify:employee-lifecycle-schema", 30_000],
  ["verify:offboarding-schema", 30_000],
  ["verify:contract-schema", 30_000],
  ["verify:roster-schema", 30_000],
  ["verify:attendance-schema", 30_000],
  ["verify:biometric-schema", 30_000],
  ["verify:attendance-reports-schema", 30_000],
  ["verify:leave-balance-schema", 30_000],
  ["verify:leave-approval-schema", 30_000],
  ["verify:long-leave-schema", 30_000],
  ["verify:holiday-schema", 30_000],
  ["verify:notifications-schema", 30_000],
  ["verify:email-notifications-schema", 30_000],
  ["verify:expiry-alerts-schema", 30_000],
  ["verify:dashboard-schema", 30_000],
  ["verify:hr-reports-schema", 30_000],
  ["verify:payroll-reports-schema", 30_000],
  ["verify:export-print-schema", 30_000],
  ["verify:imports-schema", 30_000],
  ["verify:backup-restore-schema", 30_000],
  ["verify:data-retention-schema", 30_000],
  ["verify:permission-audit", 60_000],
  ["verify:security-hardening", 120_000],
  ["verify:no-todo-tests", 60_000],
  ["verify:performance-d1", 30_000],
];

const formatCommand = (script) => `npm run ${script}`;

const runNpmScript = (script, timeout) => {
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", formatCommand(script)], {
      stdio: "inherit",
      timeout,
      windowsHide: true,
    });
  }

  return spawnSync(npmCommand, ["run", script], {
    stdio: "inherit",
    timeout,
  });
};

for (const [script, timeout] of checks) {
  console.log(`\n> ${formatCommand(script)}`);
  const result = runNpmScript(script, timeout);

  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT";
    console.error(
      timedOut
        ? `Production build check timed out after ${timeout / 1000}s: ${formatCommand(script)}`
        : `Production build check could not run: ${formatCommand(script)} (${result.error.message})`,
    );
    process.exit(1);
  }

  if (result.signal) {
    console.error(`Production build check was terminated by ${result.signal}: ${formatCommand(script)}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`Production build check failed with exit code ${result.status}: ${formatCommand(script)}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nProduction build checks passed.");
