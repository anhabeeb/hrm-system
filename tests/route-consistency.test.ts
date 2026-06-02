import { describe, expect, it } from "vitest";

import app from "../src/app";

describe("route consistency", () => {
  it("keeps health public and under /api/v1", async () => {
    const response = await app.request("/api/v1/health", {}, { ENVIRONMENT: "test" } as Env);
    expect(response.status).toBe(200);
  });

  it("returns the standard not-found code for unknown routes", async () => {
    const response = await app.request("/api/v1/does-not-exist", {}, { ENVIRONMENT: "test" } as Env);
    const body = await response.json() as { success: boolean; error: { code: string; message: string } };

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("ENDPOINT_NOT_FOUND");
    expect(body.error.message).toBe("The requested API endpoint was not found. Please check the URL and try again.");
  });

  it("rejects protected routes without auth before touching business handlers", async () => {
    const response = await app.request("/api/v1/reports", {}, { ENVIRONMENT: "test" } as Env);
    const body = await response.json() as { success: boolean; error: { code: string } };

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_REQUIRED");
  });
});

describe("route consistency placeholders", () => {
  it.todo("bootstrap status works without normal auth");
  it.todo("bootstrap initialize requires BOOTSTRAP_ADMIN_TOKEN and cannot run after setup");
  it.todo("device token cannot access admin/user routes");
  it.todo("admin session cannot access device-only routes without device auth");
  it.todo("static routes such as documents/expiring, approvals/workflows, reports/catalog, and backup restore detail are not shadowed");
});
