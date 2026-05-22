import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "src/index.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "wrangler.jsonc",
  "migrations/0001_initial.sql"
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

const workerSource = readFileSync("src/index.js", "utf8");
if (!workerSource.includes("export default")) {
  console.error("src/index.js must export a default Worker handler.");
  process.exit(1);
}

console.log("Build check passed. Cloudflare Workers can deploy using wrangler.jsonc.");
