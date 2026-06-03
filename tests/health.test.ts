import { describe, expect, it } from "vitest";

import app from "../src/app";

describe("GET /api/v1/health", () => {
  it("returns a readable health payload", async () => {
    const response = await app.request(
      "/api/v1/health",
      {},
      {
        ENVIRONMENT: "local",
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^req_/);

    const body = await response.json() as {
      success: boolean;
      status: string;
      service: string;
      environment: string;
      timestamp: string;
      version: string;
      requestId: string;
      request_id: string;
    };

    expect(body.success).toBe(true);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("hrm-api");
    expect(body.environment).toBe("local");
    expect(body.version).toBe("0.1.0");
    expect(body.requestId).toMatch(/^req_/);
    expect(body.request_id).toBe(body.requestId);
    expect(typeof body.timestamp).toBe("string");
    expect(JSON.stringify(body)).not.toContain("<!doctype html");
  });

  it("deep health returns binding diagnostics without requiring auth", async () => {
    const response = await app.request(
      "/api/v1/health/deep",
      {},
      {
        ENVIRONMENT: "local",
        DB: {
          prepare: () => ({
            first: async () => ({ ok: 1 }),
          }),
        },
      } as unknown as Env,
    );
    const body = await response.json() as {
      success: boolean;
      checks: {
        db_binding: boolean;
        d1_query: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.checks.db_binding).toBe(true);
    expect(body.checks.d1_query).toBe(true);
  });

  it("version endpoint returns safe Git build metadata", async () => {
    const response = await app.request(
      "/api/v1/version",
      {},
      {
        ENVIRONMENT: "production",
        APP_VERSION: "0.1.0",
        GIT_BRANCH: "main",
        GIT_COMMIT_SHA: "abc123",
        BUILD_TIMESTAMP: "2026-06-03T00:00:00Z",
      } as Env,
    );
    const body = await response.json() as {
      success: boolean;
      service: string;
      version: string;
      environment: string;
      build: {
        source: string;
        branch: string;
        commit: string;
        timestamp: string;
      };
      features: {
        usersRoutes: boolean;
        rolesRoutes: boolean;
        permissionsRoutes: boolean;
        employeeIdentity: boolean;
        workerAssetsRouting: boolean;
      };
      requestId: string;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.success).toBe(true);
    expect(body.service).toBe("hrm-api");
    expect(body.environment).toBe("production");
    expect(body.build.source).toBe("git");
    expect(body.build.branch).toBe("main");
    expect(body.build.commit).toBe("abc123");
    expect(body.features.usersRoutes).toBe(true);
    expect(body.features.rolesRoutes).toBe(true);
    expect(body.features.permissionsRoutes).toBe(true);
    expect(body.features.employeeIdentity).toBe(true);
    expect(body.features.workerAssetsRouting).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/secret|token|password/i);
  });
});
