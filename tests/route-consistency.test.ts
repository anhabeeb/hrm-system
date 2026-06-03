import { describe, expect, it } from "vitest";

import app from "../src/app";

const envWithEmptyBootstrapDb = {
  ENVIRONMENT: "test",
  DB: {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ success: true }),
        first: async () => ({ total: 0 }),
      }),
    }),
  },
} as unknown as Env;

describe("route consistency", () => {
  it("keeps health public and under /api/v1", async () => {
    const response = await app.request("/api/v1/health", {}, { ENVIRONMENT: "test" } as Env);
    expect(response.status).toBe(200);
  });

  it("returns a structured API route not-found code for unknown API routes", async () => {
    const response = await app.request("/api/v1/does-not-exist", {}, { ENVIRONMENT: "test" } as Env);
    const body = await response.json() as {
      success: boolean;
      error: {
        code: string;
        title: string;
        message: string;
        route: string;
        status: number;
        retryable: boolean;
      };
    };

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("API_ROUTE_NOT_FOUND");
    expect(body.error.title).toBe("API route not found");
    expect(body.error.message).toBe("The requested API endpoint does not exist.");
    expect(body.error.route).toBe("/api/v1/does-not-exist");
    expect(body.error.status).toBe(404);
    expect(body.error.retryable).toBe(false);
    expect(JSON.stringify(body)).not.toContain("<!doctype html");
  });

  it("/api/* unknown routes never fall through to an HTML SPA response", async () => {
    const response = await app.request("/api/not-real", {}, { ENVIRONMENT: "test" } as Env);
    const text = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(text).toContain("API_ROUTE_NOT_FOUND");
    expect(text).not.toContain("<!doctype html");
  });

  it("rejects protected routes without auth before touching business handlers", async () => {
    const response = await app.request("/api/v1/reports", {}, { ENVIRONMENT: "test" } as Env);
    const body = await response.json() as { success: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_REQUIRED");
  });

  it("adds CORS headers to allowed production-origin success responses", async () => {
    const response = await app.request(
      "/api/v1/health",
      {
        headers: {
          Origin: "https://hrm.cafeasiana.com.mv",
        },
      },
      { ENVIRONMENT: "test" } as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://hrm.cafeasiana.com.mv");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("adds CORS headers to bootstrap status responses for the production frontend", async () => {
    const response = await app.request(
      "/api/v1/bootstrap/status",
      {
        headers: {
          Origin: "https://hrm.cafeasiana.com.mv",
        },
      },
      envWithEmptyBootstrapDb,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://hrm.cafeasiana.com.mv");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("handles allowed production-origin OPTIONS preflight before route matching", async () => {
    const response = await app.request(
      "/api/v1/bootstrap/status",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://hrm.cafeasiana.com.mv",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
      },
      { ENVIRONMENT: "test" } as Env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://hrm.cafeasiana.com.mv");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("X-Request-ID");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("allows CORS origins configured from the environment", async () => {
    const response = await app.request(
      "/api/v1/health",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://preview.hrm.pages.dev",
          "Access-Control-Request-Method": "GET",
        },
      },
      {
        ENVIRONMENT: "test",
        CORS_ALLOWED_ORIGINS: "https://preview.hrm.pages.dev, https://another.example.com",
      } as Env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://preview.hrm.pages.dev");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("does not allow unknown CORS origins or wildcard credentials", async () => {
    const response = await app.request(
      "/api/v1/health",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.example.com",
          "Access-Control-Request-Method": "GET",
        },
      },
      {
        ENVIRONMENT: "test",
        CORS_ALLOWED_ORIGINS: "https://preview.hrm.pages.dev",
      } as Env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("adds CORS headers to allowed production-origin unauthorized responses", async () => {
    const response = await app.request(
      "/api/v1/auth/me",
      {
        headers: {
          Origin: "https://hrm.cafeasiana.com.mv",
        },
      },
      { ENVIRONMENT: "test", SESSION_SECRET: "test-secret" } as Env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://hrm.cafeasiana.com.mv");
  });

  it("adds CORS headers to allowed production-origin not-found responses", async () => {
    const response = await app.request(
      "/api/v1/does-not-exist",
      {
        headers: {
          Origin: "https://hrm.cafeasiana.com.mv",
        },
      },
      { ENVIRONMENT: "test" } as Env,
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://hrm.cafeasiana.com.mv");
  });

  it("does not use wildcard CORS for production API responses", async () => {
    const response = await app.request(
      "/api/v1/bootstrap/status",
      {
        headers: {
          Origin: "https://hrm.cafeasiana.com.mv",
        },
      },
      envWithEmptyBootstrapDb,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
  });
});

describe("route consistency placeholders", () => {
  it.todo("bootstrap status works without normal auth");
  it.todo("bootstrap initialize requires BOOTSTRAP_ADMIN_TOKEN and cannot run after setup");
  it.todo("device token cannot access admin/user routes");
  it.todo("admin session cannot access device-only routes without device auth");
  it.todo("static routes such as documents/expiring, approvals/workflows, reports/catalog, and backup restore detail are not shadowed");
});
