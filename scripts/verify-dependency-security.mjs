import { execSync } from "node:child_process";

const failures = [];

let audit;
try {
  const command = process.platform === "win32"
    ? "cmd /c npm audit --json --audit-level=critical"
    : "npm audit --json --audit-level=critical";
  const output = execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  audit = JSON.parse(output);
} catch (error) {
  const stdout = error?.stdout?.toString?.() ?? "";
  if (stdout.trim()) {
    try {
      audit = JSON.parse(stdout);
    } catch {
      failures.push("npm audit returned non-JSON output.");
    }
  } else {
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
