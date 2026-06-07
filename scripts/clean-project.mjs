import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { basename, resolve, relative, sep } from "node:path";

const root = process.cwd();

const protectedRoots = new Set([
  ".git",
  ".github",
  "src",
  "frontend/src",
  "migrations",
  "tests",
  "docs",
  "seeds",
  "scripts",
]);

const removableDirs = [
  "node_modules",
  "frontend/node_modules",
  ".wrangler",
  ".vite",
  "frontend/.vite",
  "dist",
  "frontend/dist",
  "build",
  "frontend/build",
  "coverage",
  ".turbo",
  "frontend/.turbo",
  ".cache",
  "frontend/.cache",
  "tmp",
  "frontend/tmp",
  "temp",
  "frontend/temp",
  ".npm",
  ".pnpm-store",
  ".yarn/cache",
  ".yarn/unplugged",
];

const removableFilePatterns = [
  /\.zip$/i,
  /\.log$/i,
  /\.tmp$/i,
  /\.temp$/i,
  /^npm-debug\.log/i,
  /^yarn-debug\.log/i,
  /^yarn-error\.log/i,
  /^pnpm-debug\.log/i,
];

const deleted = [];

const normalizeRelative = (path) => relative(root, path).split(sep).join("/");

const assertInsideRoot = (target) => {
  const relativePath = relative(root, target);
  if (relativePath.startsWith("..") || resolve(target) === resolve(root) || resolve(target).startsWith(resolve(root) + sep) === false) {
    throw new Error(`Refusing to remove path outside project root: ${target}`);
  }
};

const assertNotProtected = (target) => {
  const relativePath = normalizeRelative(target);
  if (protectedRoots.has(relativePath)) {
    throw new Error(`Refusing to remove protected source folder: ${relativePath}`);
  }
};

const removeTarget = (relativePath) => {
  const target = resolve(root, relativePath);
  if (!existsSync(target)) return;
  assertInsideRoot(target);
  assertNotProtected(target);
  rmSync(target, { recursive: true, force: true });
  deleted.push(relativePath);
};

for (const dir of removableDirs) {
  removeTarget(dir);
}

const walkAndRemoveGeneratedFiles = (dir) => {
  if (!existsSync(dir)) return;
  const relativePath = normalizeRelative(dir);
  if (relativePath === ".git" || relativePath.startsWith(".git/")) return;
  if (relativePath === "node_modules" || relativePath.startsWith("node_modules/")) return;
  if (relativePath === "frontend/node_modules" || relativePath.startsWith("frontend/node_modules/")) return;

  for (const entry of readdirSync(dir)) {
    const target = resolve(dir, entry);
    const stat = lstatSync(target);
    if (stat.isDirectory()) {
      walkAndRemoveGeneratedFiles(target);
      continue;
    }
    if (removableFilePatterns.some((pattern) => pattern.test(entry))) {
      assertInsideRoot(target);
      rmSync(target, { force: true });
      deleted.push(normalizeRelative(target));
    }
  }
};

walkAndRemoveGeneratedFiles(root);

if (deleted.length === 0) {
  console.log("Project cleanup completed. No generated files or folders were found.");
} else {
  console.log("Project cleanup removed:");
  for (const item of deleted) console.log(`- ${item}`);
}
