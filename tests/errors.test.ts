import { describe, expect, it, vi } from "vitest";

import app from "../src/app";
import { classifyError } from "../src/utils/error-classifier";
import { AuthError, PermissionError } from "../src/utils/errors";
import { errorResponse } from "../src/utils/response";

describe("application error classifier", () => {
  it("maps missing tables to DATABASE_MISSING_TABLE", () => {
    const error = classifyError(new Error("D1_ERROR: no such table: system_bootstrap"), {
      step: "check_bootstrap_status",
    });

    expect(error.code).toBe("DATABASE_MISSING_TABLE");
    expect(error.title).toBe("Database schema is incomplete");
    expect(error.technicalMessage).toBe("no such table: system_bootstrap");
    expect(error.step).toBe("check_bootstrap_status");
    expect(error.suggestedAction).toContain("Apply the latest D1 migrations");
  });

  it("maps missing columns to DATABASE_MISSING_COLUMN", () => {
    const error = classifyError(new Error("SQL error: no such column: employees.primary_outlet_id"));

    expect(error.code).toBe("DATABASE_MISSING_COLUMN");
    expect(error.technicalMessage).toBe("no such column: employees.primary_outlet_id");
  });

  it("maps unique constraints to DATABASE_CONSTRAINT_FAILED", () => {
    const error = classifyError(new Error("UNIQUE constraint failed: users.email"));

    expect(error.code).toBe("DATABASE_CONSTRAINT_FAILED");
    expect(error.statusCode).toBe(409);
    expect(error.title).toBe("Duplicate record");
  });

  it("preserves authentication and permission application errors", () => {
    expect(classifyError(new AuthError()).code).toBe("AUTH_REQUIRED");
    expect(classifyError(new PermissionError()).code).toBe("PERMISSION_DENIED");
  });

  it("maps missing bindings and secrets to configuration errors", () => {
    expect(classifyError(new Error("Cannot read properties of undefined (reading 'prepare')")).code).toBe("CONFIG_MISSING_BINDING");
    expect(classifyError(new Error("INTERNAL_SECRET is missing")).code).toBe("CONFIG_MISSING_SECRET");
  });

  it("maps unknown runtime failures to UNKNOWN_ERROR", () => {
    const error = classifyError(new Error("Unexpected banana"));

    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.technicalMessage).toBe("Unexpected banana");
    expect(error.retryable).toBe(true);
  });

  it("redacts sensitive values from technical messages", () => {
    const error = classifyError(new Error("Authorization Bearer abc123 token=secret-value"));

    expect(error.technicalMessage).not.toContain("secret-value");
    expect(error.technicalMessage).not.toContain("abc123");
  });
});

describe("structured error responses", () => {
  it("every error response includes a request ID and diagnostic fields", async () => {
    const response = errorResponse(400, "VALIDATION_ERROR", "Some fields need attention.", {
      requestId: "req_error_test",
      route: "/api/v1/example",
      method: "POST",
      step: "validate_payload",
    });
    const body = await response.json() as {
      success: false;
      requestId: string;
      request_id: string;
      error: {
        code: string;
        title: string;
        requestId: string;
        route: string;
        method: string;
        step: string;
        status: number;
        retryable: boolean;
      };
    };

    expect(body.success).toBe(false);
    expect(body.requestId).toBe("req_error_test");
    expect(body.request_id).toBe("req_error_test");
    expect(body.error.requestId).toBe("req_error_test");
    expect(body.error.route).toBe("/api/v1/example");
    expect(body.error.method).toBe("POST");
    expect(body.error.step).toBe("validate_payload");
    expect(body.error.status).toBe(400);
    expect(body.error.retryable).toBe(false);
  });

  it("production responses do not include stack traces", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = {
      ENVIRONMENT: "production",
      DB: {
        prepare: () => {
          throw new Error("D1_ERROR: no such table: system_bootstrap");
        },
      },
    } as unknown as Env;

    try {
      const response = await app.request("/api/v1/bootstrap/status", {}, env);
      const body = await response.json() as {
        error: { code: string; technicalMessage?: string; details?: unknown };
      };

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("DATABASE_MISSING_TABLE");
      expect(body.error.technicalMessage).toBe("no such table: system_bootstrap");
      expect(JSON.stringify(body)).not.toContain("at ");
      expect(body.error.details).toBeUndefined();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it("system_error_logs write failure does not cause recursive response failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let prepareCalls = 0;
    const env = {
      ENVIRONMENT: "production",
      DB: {
        prepare: () => {
          prepareCalls += 1;
          throw new Error(prepareCalls === 1 ? "no such table: system_bootstrap" : "no such table: system_error_logs");
        },
      },
    } as unknown as Env;

    try {
      const response = await app.request("/api/v1/bootstrap/status", {}, env);
      const body = await response.json() as { error: { code: string } };

      expect(response.status).toBe(500);
      expect(body.error.code).toBe("DATABASE_MISSING_TABLE");
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });
});
