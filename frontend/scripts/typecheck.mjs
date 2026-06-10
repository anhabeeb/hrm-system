import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const tscCli = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const npmCommand = process.platform === "win32"
  ? { command: "cmd.exe", args: ["/d", "/s", "/c", "npm"] }
  : { command: "npm", args: [] };
const TYPECHECK_TIMEOUT_MS = 120_000;

const run = (label, command, args) => {
  const result = spawnSync(command, args, {
    cwd: frontendRoot,
    stdio: "inherit",
    shell: false,
    timeout: TYPECHECK_TIMEOUT_MS,
  });

  if (result.error) {
    console.error(`${label} failed:`, result.error);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`${label} terminated by ${result.signal}.`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} exited with ${result.status ?? "unknown status"}.`);
    process.exit(result.status ?? 1);
  }
};

if (!existsSync(tscCli)) {
  run("frontend npm ci", npmCommand.command, [...npmCommand.args, "ci", "--include=dev", "--no-audit", "--fund=false"]);
}

if (!existsSync(tscCli)) {
  console.error("TypeScript CLI was not found after installing frontend dependencies.");
  process.exit(1);
}

run("frontend typecheck", process.execPath, [tscCli, "--noEmit", "--project", "tsconfig.json", "--pretty", "false"]);
process.exit(0);
