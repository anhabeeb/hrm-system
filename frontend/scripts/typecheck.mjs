import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const tscCli = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));

if (!existsSync(tscCli)) {
  console.error("TypeScript CLI was not found. Run npm install in the frontend workspace first.");
  process.exit(1);
}

const child = spawn(process.execPath, [tscCli, "--noEmit", "--project", "tsconfig.json", "--pretty", "false"], {
  cwd: frontendRoot,
  stdio: "inherit",
  shell: false,
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Frontend typecheck terminated by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
