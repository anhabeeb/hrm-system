import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const indexPath = resolve(root, "frontend", "dist", "index.html");
const assetsPath = resolve(root, "frontend", "dist", "assets");

const fail = (message) => {
  console.error(message);
  console.error("Run `npm run build:frontend` before deploying.");
  process.exit(1);
};

if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
  fail("Frontend deploy guard failed: frontend/dist/index.html is missing.");
}

if (!existsSync(assetsPath) || !statSync(assetsPath).isDirectory()) {
  fail("Frontend deploy guard failed: frontend/dist/assets is missing.");
}

console.log("Frontend assets verified.");
