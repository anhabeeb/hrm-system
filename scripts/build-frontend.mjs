import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.join(root, "frontend");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeCommand = process.execPath;

const commands = [
  {
    label: "Install frontend dependencies",
    command: npmCommand,
    args: ["--prefix", "frontend", "ci", "--include=dev", "--no-audit", "--no-fund"],
    cwd: root,
    timeout: 180_000,
  },
  {
    label: "Typecheck frontend",
    command: npmCommand,
    args: ["--prefix", "frontend", "run", "typecheck"],
    cwd: root,
    timeout: 120_000,
  },
  {
    label: "Build frontend with Vite",
    command: nodeCommand,
    args: ["./node_modules/vite/bin/vite.js", "build", "--config", "vite.config.mjs", "--configLoader", "native"],
    cwd: frontend,
    timeout: 180_000,
  },
];

const quote = (value) => (/\s/.test(value) ? `"${value}"` : value);

const spawnCommand = (step) => {
  if (process.platform === "win32" && step.command === npmCommand) {
    return spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [step.command, ...step.args].map(quote).join(" ")], {
      cwd: step.cwd,
      stdio: "inherit",
      timeout: step.timeout,
      windowsHide: true,
      killSignal: "SIGTERM",
    });
  }

  return spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: "inherit",
    timeout: step.timeout,
    windowsHide: true,
    killSignal: "SIGTERM",
  });
};

for (const step of commands) {
  console.log(`\n> ${step.label}`);
  console.log(`$ ${[step.command, ...step.args].map(quote).join(" ")}`);

  const result = spawnCommand(step);

  if (result.error) {
    const timedOut = result.error.code === "ETIMEDOUT";
    console.error(
      timedOut
        ? `${step.label} timed out after ${step.timeout / 1000}s.`
        : `${step.label} could not run: ${result.error.message}`,
    );
    process.exit(1);
  }

  if (result.signal) {
    console.error(`${step.label} was terminated by ${result.signal}.`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${step.label} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nFrontend build completed.");
