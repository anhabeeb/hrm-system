import { describe, expect, it } from "vitest";

import app from "../src/app";

const env = { ENVIRONMENT: "local" } as Env;

describe("lookup routes", () => {
  const routes = [
    "/api/v1/lookups/employees",
    "/api/v1/lookups/outlets",
    "/api/v1/lookups/departments",
    "/api/v1/lookups/positions",
    "/api/v1/lookups/leave-types",
    "/api/v1/lookups/payroll-periods",
  ];

  it.each(routes)("%s is registered and requires authentication", async (route) => {
    const response = await app.request(route, {}, env);
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).not.toBe("API_ROUTE_NOT_FOUND");
  });

  it.todo("employee lookup returns compact safe employee labels without salary, documents, bank, or security fields");
  it.todo("employee lookup applies outlet access and optional outlet, department, position, and status filters");
  it.todo("outlet, department, position, leave type, and payroll period lookups support search and pagination");
});
