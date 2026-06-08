import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { API_PREFIX, NOT_FOUND_MESSAGE } from "../src/config/constants";

const readText = (path: string) => readFileSync(path, "utf8");

describe("production readiness config surface", () => {
  it("keeps the public API mounted under /api/v1", () => {
    expect(API_PREFIX).toBe("/api/v1");
  });

  it("uses the production-safe endpoint not-found message", () => {
    expect(NOT_FOUND_MESSAGE).toBe("The requested API endpoint was not found. Please check the URL and try again.");
  });
});

describe("production config safety checks", () => {
  it("wrangler.jsonc keeps the production Worker and entrypoint", () => {
    const wrangler = readText("wrangler.jsonc");
    expect(wrangler).toContain('"name": "hrm-system"');
    expect(wrangler).toContain('"main": "src/index.ts"');
  });

  it("wrangler.jsonc keeps production environment and D1/R2/Durable Object bindings", () => {
    const wrangler = readText("wrangler.jsonc");
    expect(wrangler).toContain('"ENVIRONMENT": "production"');
    expect(wrangler).toContain('"binding": "DB"');
    expect(wrangler).toContain('"database_name": "hrm-system"');
    expect(wrangler).toContain('"database_id": "59ded11f-6298-4b0b-9970-6000fbd0dca1"');
    expect(wrangler).toContain('"binding": "DOCUMENTS_BUCKET"');
    expect(wrangler).toContain('"binding": "BACKUP_BUCKET"');
    expect(wrangler).toContain('"name": "REALTIME_ROOM"');
    expect(wrangler).toContain('"new_sqlite_classes": ["RealtimeRoom"]');
  });

  it("wrangler.jsonc does not define obvious secret variables or Cloudflare API tokens", () => {
    const wrangler = readText("wrangler.jsonc");
    expect(wrangler).not.toMatch(/"SESSION_SECRET"\s*:/);
    expect(wrangler).not.toMatch(/"JWT_SECRET"\s*:/);
    expect(wrangler).not.toMatch(/"PASSWORD_PEPPER"\s*:/);
    expect(wrangler).not.toMatch(/"DEVICE_TOKEN_SECRET"\s*:/);
    expect(wrangler).not.toMatch(/"TOTP_ENCRYPTION_KEY"\s*:/);
    expect(wrangler).not.toMatch(/CF_API_TOKEN|CLOUDFLARE_API_TOKEN/i);
  });

  it(".gitignore excludes generated, secret, and local state files", () => {
    const gitignore = readText(".gitignore");
    expect(gitignore).toContain(".wrangler/");
    expect(gitignore).toContain("frontend/node_modules/");
    expect(gitignore).toContain("frontend/dist/");
    expect(gitignore).toContain(".dev.vars");
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("New Text Document.txt");
  });

  it("package scripts expose build, typecheck, test, dev, and deploy commands", () => {
    const pkg = JSON.parse(readText("package.json")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.build).toBeTruthy();
    expect(pkg.scripts?.typecheck).toBeTruthy();
    expect(pkg.scripts?.test).toBeTruthy();
    expect(pkg.scripts?.dev).toBeTruthy();
    expect(pkg.scripts?.deploy).toBeTruthy();
  });

  it("frontend env example documents API base URL without secrets", () => {
    const envExample = readText("frontend/.env.example");
    expect(envExample).toContain("VITE_API_BASE_URL=");
    expect(envExample).toContain("same-origin /api/v1");
    expect(envExample).not.toContain("workers.dev");
    expect(envExample).not.toMatch(/SECRET|TOKEN|PASSWORD|PEPPER/i);
  });

  it("wrangler config serves frontend assets through the Worker with API routes worker-first", () => {
    const wrangler = readText("wrangler.jsonc");

    expect(wrangler).toContain('"assets"');
    expect(wrangler).toContain('"directory": "./frontend/dist"');
    expect(wrangler).toContain('"not_found_handling": "single-page-application"');
    expect(wrangler).toContain('"binding": "ASSETS"');
    expect(wrangler).toContain('"run_worker_first": ["/api/*"]');
  });

  it("root deploy script builds API and frontend before deploying", () => {
    const pkg = JSON.parse(readText("package.json")) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["build:api"]).toBe("tsc --noEmit");
    expect(pkg.scripts?.["build:frontend"]).toContain("npm --prefix frontend run build");
    expect(pkg.scripts?.["verify:frontend-assets"]).toBe("node scripts/verify-frontend-assets.mjs");
    expect(pkg.scripts?.["verify:critical-routes"]).toBe("node scripts/verify-critical-routes.mjs");
    expect(pkg.scripts?.["build:all"]).toContain("build:api");
    expect(pkg.scripts?.["build:all"]).toContain("build:frontend");
    expect(pkg.scripts?.["build:all"]).toContain("verify:frontend-assets");
    expect(pkg.scripts?.["build:all"]).toContain("verify:critical-routes");
    expect(pkg.scripts?.deploy).toContain("npm run build");
    expect(pkg.scripts?.deploy).toContain("wrangler deploy");
    expect(pkg.scripts?.deploy).toContain("smoke:production");
  });

  it("frontend asset deploy guard checks index and assets directory", () => {
    const script = readText("scripts/verify-frontend-assets.mjs");

    expect(script).toContain("frontend");
    expect(script).toContain("dist");
    expect(script).toContain("index.html");
    expect(script).toContain("assets");
  });

});
