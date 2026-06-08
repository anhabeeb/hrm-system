import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  classifySmokeResponse,
  protectedApiPaths,
  smokeChecks,
} from "../scripts/smoke-production.mjs";
import {
  runStagingAcceptance,
  validateAcceptanceConfig,
} from "../scripts/acceptance-staging.mjs";

const response = (status: number, contentType: string, body: string, headers: Record<string, string> = {}) => ({
  status,
  contentType,
  body,
  headers: { "content-type": contentType, ...headers },
});

const check = (path: string, kind?: string) =>
  smokeChecks.find((item) => item.path === path && (!kind || item.kind === kind))!;

describe("production smoke response classification", () => {
  it("detects protected API routes as existing only when they return 401 JSON", () => {
    for (const path of protectedApiPaths) {
      const result = classifySmokeResponse(
        check(path),
        response(401, "application/json", JSON.stringify({ error: { code: "AUTH_REQUIRED" } })),
      );

      expect(result.ok).toBe(true);
    }
  });

  it("fails when API routes return frontend HTML", () => {
    const result = classifySmokeResponse(
      check("/api/v1/users"),
      response(200, "text/html", "<!doctype html><html></html>"),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("API route returned HTML");
  });

  it("fails when frontend SPA routes return API JSON", () => {
    const result = classifySmokeResponse(
      check("/dashboard"),
      response(200, "application/json", JSON.stringify({ error: { code: "ENDPOINT_NOT_FOUND" } })),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("API JSON");
  });

  it("validates CORS preflight without wildcard credentials", () => {
    const result = classifySmokeResponse(
      check("/api/v1/health", "cors-preflight"),
      response(204, "", "", {
        "access-control-allow-origin": "https://hrm.cafeasiana.com.mv",
        "access-control-allow-credentials": "true",
      }),
    );
    const unsafe = classifySmokeResponse(
      check("/api/v1/health", "cors-preflight"),
      response(204, "", "", {
        "access-control-allow-origin": "*",
        "access-control-allow-credentials": "true",
      }),
    );

    expect(result.ok).toBe(true);
    expect(unsafe.ok).toBe(false);
  });

  it("requires production security headers", () => {
    const result = classifySmokeResponse(
      check("/", "security-headers"),
      response(200, "text/html", "<!doctype html><html></html>", {
        "x-content-type-options": "nosniff",
        "referrer-policy": "same-origin",
        "cache-control": "no-store",
      }),
    );
    const missing = classifySmokeResponse(
      check("/", "security-headers"),
      response(200, "text/html", "<!doctype html><html></html>"),
    );

    expect(result.ok).toBe(true);
    expect(missing.ok).toBe(false);
  });
});

describe("staging acceptance safety", () => {
  it("refuses to run without required staging credentials", () => {
    const result = validateAcceptanceConfig({});

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ACCEPTANCE_BASE_URL");
  });

  it("refuses mutation mode even when requested explicitly", () => {
    const result = validateAcceptanceConfig({
      ACCEPTANCE_BASE_URL: "https://staging.example.com",
      ACCEPTANCE_USERNAME: "admin",
      ACCEPTANCE_PASSWORD: "secret",
      ACCEPTANCE_ENABLE_MUTATIONS: "true",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Mutation acceptance tests are intentionally disabled");
  });

  it("runs only read-only checks after login and does not print credentials", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.endsWith("/api/v1/auth/login")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json", "set-cookie": "sid=test; HttpOnly" },
        });
      }
      return new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const logs: string[] = [];

    const result = await runStagingAcceptance({
      env: {
        ACCEPTANCE_BASE_URL: "https://staging.example.com",
        ACCEPTANCE_USERNAME: "admin",
        ACCEPTANCE_PASSWORD: "super-secret",
      },
      fetchImpl,
      logger: { log: (message: string) => logs.push(message), error: (message: string) => logs.push(message) },
    });

    expect(result.ok).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/api/v1/auth/login"))).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/api/v1/auth/logout"))).toBe(true);
    expect(calls.filter((call) => !call.url.endsWith("/api/v1/auth/login") && !call.url.endsWith("/api/v1/auth/logout")).every((call) => call.method === "GET")).toBe(true);
    expect(logs.join("\n")).not.toContain("super-secret");
  });
});

describe("production acceptance artifacts", () => {
  it("documents production acceptance, migration safety, smoke testing, and rollback", () => {
    const checklist = readFileSync("docs/production-acceptance-checklist.md", "utf8");
    const deployment = readFileSync("docs/deployment-checklist.md", "utf8");
    const matrix = readFileSync("docs/acceptance-test-matrix.md", "utf8");

    expect(checklist).toContain("Environment Readiness");
    expect(checklist).toContain("Rollback Readiness");
    expect(deployment).toContain("Production Migration Safety");
    expect(deployment).toContain("npm run smoke:production");
    expect(matrix).toContain("Employee 360");
    expect(matrix).toContain("Pass/Fail");
  });

  it("wires package scripts for production acceptance verification", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(pkg.scripts["smoke:production"]).toBe("node scripts/smoke-production.mjs");
    expect(pkg.scripts["acceptance:staging"]).toBe("node scripts/acceptance-staging.mjs");
    expect(pkg.scripts["verify:production-readiness"]).toBe("node scripts/verify-production-readiness.mjs");
    expect(pkg.scripts["verify:production-acceptance"]).toBe("node scripts/verify-production-acceptance.mjs");
  });
});
