import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

const root = process.cwd();
const outputName = "HRM-System-clean.zip";
const outputPath = resolve(root, outputName);

const forbiddenPathPatterns = [
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
  /(?:^|\/)tmp(?:\/|$)/,
  /(?:^|\/)temp(?:\/|$)/,
  /\.zip$/i,
  /\.log$/i,
];

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

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date) => {
  const year = Math.max(date.getFullYear(), 1980);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
};

const normalizePath = (path) => path.split(sep).join("/");

const isInsideRoot = (absolutePath) => {
  const relativePath = relative(root, absolutePath);
  return relativePath && !relativePath.startsWith("..") && !resolve(absolutePath).startsWith(dirname(root) + sep + "..");
};

const isForbidden = (path) => forbiddenPathPatterns.some((pattern) => pattern.test(path));

const gitListFiles = () => {
  const raw = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
  });
  return raw
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replace(/\\/g, "/"));
};

const writeUInt16 = (buffer, value, offset) => buffer.writeUInt16LE(value & 0xffff, offset);
const writeUInt32 = (buffer, value, offset) => buffer.writeUInt32LE(value >>> 0, offset);

const createZip = (entries) => {
  const fileParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = readFileSync(resolve(root, entry.path));
    const nameBuffer = Buffer.from(entry.path, "utf8");
    const checksum = crc32(data);
    const { date, time } = dosDateTime(entry.modifiedAt);

    const localHeader = Buffer.alloc(30);
    writeUInt32(localHeader, 0x04034b50, 0);
    writeUInt16(localHeader, 20, 4);
    writeUInt16(localHeader, 0x0800, 6);
    writeUInt16(localHeader, 0, 8);
    writeUInt16(localHeader, time, 10);
    writeUInt16(localHeader, date, 12);
    writeUInt32(localHeader, checksum, 14);
    writeUInt32(localHeader, data.length, 18);
    writeUInt32(localHeader, data.length, 22);
    writeUInt16(localHeader, nameBuffer.length, 26);
    writeUInt16(localHeader, 0, 28);

    fileParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    writeUInt32(centralHeader, 0x02014b50, 0);
    writeUInt16(centralHeader, 20, 4);
    writeUInt16(centralHeader, 20, 6);
    writeUInt16(centralHeader, 0x0800, 8);
    writeUInt16(centralHeader, 0, 10);
    writeUInt16(centralHeader, time, 12);
    writeUInt16(centralHeader, date, 14);
    writeUInt32(centralHeader, checksum, 16);
    writeUInt32(centralHeader, data.length, 20);
    writeUInt32(centralHeader, data.length, 24);
    writeUInt16(centralHeader, nameBuffer.length, 28);
    writeUInt16(centralHeader, 0, 30);
    writeUInt16(centralHeader, 0, 32);
    writeUInt16(centralHeader, 0, 34);
    writeUInt16(centralHeader, 0, 36);
    writeUInt32(centralHeader, entry.mode, 38);
    writeUInt32(centralHeader, offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  writeUInt32(end, 0x06054b50, 0);
  writeUInt16(end, 0, 4);
  writeUInt16(end, 0, 6);
  writeUInt16(end, entries.length, 8);
  writeUInt16(end, entries.length, 10);
  writeUInt32(end, centralDirectory.length, 12);
  writeUInt32(end, offset, 16);
  writeUInt16(end, 0, 20);

  return Buffer.concat([...fileParts, centralDirectory, end]);
};

if (basename(root) === ".git") {
  console.error("Refusing to create an archive from inside .git.");
  process.exit(1);
}

if (existsSync(outputPath)) {
  unlinkSync(outputPath);
}

const files = gitListFiles()
  .filter((path) => !isForbidden(path))
  .filter((path) => existsSync(resolve(root, path)))
  .map((path) => {
    const absolutePath = resolve(root, path);
    if (!isInsideRoot(absolutePath)) {
      throw new Error(`Refusing to archive path outside project root: ${path}`);
    }
    const stat = statSync(absolutePath);
    return {
      path: normalizePath(path),
      modifiedAt: stat.mtime,
      mode: stat.mode << 16,
      isFile: stat.isFile(),
    };
  })
  .filter((entry) => entry.isFile)
  .sort((a, b) => a.path.localeCompare(b.path));

const missing = requiredPaths.filter((path) => !files.some((entry) => entry.path === path));
if (missing.length > 0) {
  console.error("Cannot create clean archive because required source paths are missing:");
  for (const path of missing) console.error(`- ${path}`);
  console.error("Check git tracking with: git ls-files --cached --others --exclude-standard");
  process.exit(1);
}

const forbidden = files.filter((entry) => isForbidden(entry.path));
if (forbidden.length > 0) {
  console.error("Refusing to create archive because forbidden paths would be included:");
  for (const entry of forbidden) console.error(`- ${entry.path}`);
  process.exit(1);
}

writeFileSync(outputPath, createZip(files));

console.log(`Clean archive created: ${outputName}`);
console.log(`Files included: ${files.length}`);
console.log("Archive preserves project-relative paths and excludes dependencies, build output, caches, Git internals, logs, and nested ZIPs.");
