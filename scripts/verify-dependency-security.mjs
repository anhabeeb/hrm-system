import { execFileSync } from "node:child_process";

const failures = [];
const AUDIT_TIMEOUT_MS = 30_000;

let audit;
try {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm audit --json --audit-level=critical"]
    : ["audit", "--json", "--audit-level=critical"];
  const output = execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: AUDIT_TIMEOUT_MS,
    windowsHide: true,
  });
  audit = JSON.parse(output);
} catch (error) {
  if (error?.code === "ETIMEDOUT" || error?.signal === "SIGTERM") {
    failures.push(`npm audit did not finish within ${AUDIT_TIMEOUT_MS / 1000} seconds.`);
  }

  const stdout = error?.stdout?.toString?.() ?? "";
  if (stdout.trim()) {
    try {
      audit = JSON.parse(stdout);
    } catch {
      failures.push("npm audit returned non-JSON output.");
    }
  } else if (failures.length === 0) {
    failures.push(`npm audit could not be executed: ${error?.message ?? String(error)}`);
  }
}

if (audit) {
  const criticalCount = audit.metadata?.vulnerabilities?.critical ?? 0;
  if (criticalCount > 0) {
    failures.push(`npm audit reports ${criticalCount} critical vulnerabilit${criticalCount === 1 ? "y" : "ies"}.`);
  }
}

if (failures.length > 0) {
  console.error("Dependency security verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Dependency security verification passed.");
}
