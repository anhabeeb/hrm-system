import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));

const run = (commandLine) =>
  new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      cwd: frontendRoot,
      stdio: "inherit",
      shell: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${commandLine} exited with ${code}`));
      }
    });
  });

await run("tsc --noEmit");
await run("vite build");
