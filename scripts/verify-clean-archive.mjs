import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const archivePath = resolve(process.cwd(), "HRM-System-clean.zip");

const requiredPaths = [
  "package.json",
  "wrangler.jsonc",
  "src/app.ts",
  "src/index.ts",
  "frontend/package.json",
  "frontend/src/app/App.tsx",
  "scripts/clean-project.mjs",
  "scripts/create-clean-archive.mjs",
  "migrations/0001_foundation.sql",
];

const forbiddenPatterns = [
  /^\.git(?:\/|$)/,
  /(?:^|\/)node_modules(?:\/|$)/,
  /^frontend\/node_modules(?:\/|$)/,
  /^\.wrangler(?:\/|$)/,
  /(?:^|\/)\.vite(?:\/|$)/,
  /^frontend\/dist(?:\/|$)/,
  /^dist(?:\/|$)/,
  /^coverage(?:\/|$)/,
  /(?:^|\/)\.cache(?:\/|$)/,
  /(?:^|\/)\.turbo(?:\/|$)/,
  /\.zip$/i,
];

const readUInt16 = (buffer, offset) => buffer.readUInt16LE(offset);
const readUInt32 = (buffer, offset) => buffer.readUInt32LE(offset);

const listZipEntries = (buffer) => {
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 0xffff - 22); i -= 1) {
    if (readUInt32(buffer, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("Archive is not a readable ZIP file.");
  }

  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralDirectoryOffset = readUInt32(buffer, eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, offset) !== 0x02014b50) {
      throw new Error(`Invalid ZIP central directory entry at offset ${offset}.`);
    }
    const nameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

if (!existsSync(archivePath)) {
  console.error("HRM-System-clean.zip does not exist. Run npm run archive:clean first.");
  process.exit(1);
}

const entries = listZipEntries(readFileSync(archivePath));
const entrySet = new Set(entries);

const missing = requiredPaths.filter((path) => !entrySet.has(path));
const forbidden = entries.filter((entry) => forbiddenPatterns.some((pattern) => pattern.test(entry)));

if (missing.length > 0) {
  console.error("Clean archive is missing required project paths:");
  for (const path of missing) console.error(`- ${path}`);
}

if (forbidden.length > 0) {
  console.error("Clean archive contains forbidden generated/dependency/cache/archive paths:");
  for (const path of forbidden) console.error(`- ${path}`);
}

if (missing.length > 0 || forbidden.length > 0) {
  process.exit(1);
}

console.log("Clean archive verification passed.");
console.log(`Entries checked: ${entries.length}`);
