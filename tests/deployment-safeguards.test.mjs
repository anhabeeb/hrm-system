import { describe, expect, it } from "vitest";
import fs from "node:fs";

import { verifyCriticalRoutes } from "../scripts/verify-critical-routes.mjs";
import { classifySmokeResponse, smokeChecks } from "../scripts/smoke-production.mjs";
import { requiredEmployeeDocumentColumns } from "../scripts/document-schema-columns.mjs";

const response = (status, contentType, body) => ({ status, contentType, body });
const check = (path) => smokeChecks.find((item) => item.path === path);

describe("deployment safeguards", () => {
  it("critical route verify script passes with current source", () => {
    const result = verifyCriticalRoutes();

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("smoke script classifies 401 users, roles, and permissions as pass", () => {
    for (const path of ["/api/v1/users", "/api/v1/roles", "/api/v1/permissions"]) {
      const result = classifySmokeResponse(
        check(path),
        response(401, "application/json", JSON.stringify({ error: { code: "AUTH_REQUIRED" } })),
      );

      expect(result.ok).toBe(true);
    }
  });

  it("smoke script classifies 404 users, roles, and permissions as failure", () => {
    for (const path of ["/api/v1/users", "/api/v1/roles", "/api/v1/permissions"]) {
      const result = classifySmokeResponse(
        check(path),
        response(404, "application/json", JSON.stringify({ error: { code: "API_ROUTE_NOT_FOUND" } })),
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toContain("Critical route returned 404");
    }
  });

  it("smoke script classifies API returning HTML as failure", () => {
    const result = classifySmokeResponse(
      check("/api/v1/health"),
      response(200, "text/html", "<!doctype html><html></html>"),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("API route returned HTML instead of JSON.");
  });

  it("smoke script classifies /dashboard returning API JSON as failure", () => {
    const result = classifySmokeResponse(
      check("/dashboard"),
      response(404, "application/json", JSON.stringify({ error: { code: "ENDPOINT_NOT_FOUND" } })),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Expected frontend 200");
  });

  it("foreign employee document history migration declares every required compliance column", () => {
    const migration = fs.readFileSync("migrations/0017_foreign_employee_document_history.sql", "utf8");

    for (const column of requiredEmployeeDocumentColumns.filter((column) => column !== "updated_at")) {
      expect(migration).toContain(`ADD COLUMN ${column}`);
    }
  });

  it("deployment checklist documents safe handling for partial document migration reruns", () => {
    const checklist = fs.readFileSync("docs/deployment-checklist.md", "utf8");

    expect(checklist).toContain('npx wrangler d1 execute hrm-system --remote --command "PRAGMA table_info(employee_documents);"');
    expect(checklist).toContain("do not re-run this migration blindly");
    expect(checklist).toContain("npm run verify:document-schema");
    for (const column of requiredEmployeeDocumentColumns) {
      expect(checklist).toContain(column);
    }
  });
});
