import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const typecheckScript = fileURLToPath(new URL("./typecheck.mjs", import.meta.url));
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));

const run = (label, command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: frontendRoot,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with ${code}`));
      }
    });
  });

await run("frontend typecheck", process.execPath, [typecheckScript]);
await run("vite build", process.execPath, [viteCli, "build"]);
