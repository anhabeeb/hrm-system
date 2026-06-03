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
});
