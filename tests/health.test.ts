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

    const body = await response.json();

    expect(body).toEqual({
      success: true,
      data: {
        status: "ok",
        service: "hrm-api",
        environment: "local",
      },
      message: "HRM API is running",
    });
  });
});
