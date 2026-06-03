import { describe, expect, it } from "vitest";

import { resolveApiRequestInfo } from "../frontend/src/app/config";
import { ApiError, createHtmlApiResponseError, createInvalidApiResponseError, createTimeoutError, toDiagnosticText } from "../frontend/src/lib/api-errors";

const diagnostics = {
  requestUrl: "https://api.hrm.cafeasiana.com.mv/api/v1/bootstrap/status",
  apiBaseUrl: "https://api.hrm.cafeasiana.com.mv",
  apiBaseUrlSource: "VITE_API_BASE_URL",
  method: "GET",
  browserOnline: true,
  errorName: "TypeError",
  errorMessage: "Failed to fetch",
  timeout: false,
  corsSuspected: true,
  currentPageUrl: "https://hrm.cafeasiana.com.mv/setup",
  buildVersion: "0.1.0",
  requestStartedAt: "2026-06-03T00:00:00.000Z",
  requestEndedAt: "2026-06-03T00:00:01.000Z",
  elapsedMs: 1000,
};

describe("frontend API diagnostics", () => {
  it("empty API base URL resolves to same-origin /api/v1 paths", () => {
    const info = resolveApiRequestInfo("/bootstrap/status", "", "same-origin");

    expect(info.url).toBe("/api/v1/bootstrap/status");
    expect(info.apiBaseUrl).toBe("");
    expect(info.apiBaseUrlSource).toBe("same-origin");
  });

  it("non-empty API base URL resolves to the configured API origin", () => {
    const info = resolveApiRequestInfo("/bootstrap/status", "https://api.hrm.cafeasiana.com.mv", "VITE_API_BASE_URL");

    expect(info.url).toBe("https://api.hrm.cafeasiana.com.mv/api/v1/bootstrap/status");
    expect(info.apiBaseUrl).toBe("https://api.hrm.cafeasiana.com.mv");
  });

  it("Copy Diagnostics text includes URL, method, browser status, page URL, and build version", () => {
    const error = new ApiError("Unable to connect to the server.", {
      code: "NETWORK_UNREACHABLE",
      title: "API is unreachable",
      status: 0,
      retryable: true,
      diagnostics,
    });

    const text = toDiagnosticText(error);

    expect(text).toContain("Request URL: https://api.hrm.cafeasiana.com.mv/api/v1/bootstrap/status");
    expect(text).toContain("API base URL: https://api.hrm.cafeasiana.com.mv");
    expect(text).toContain("Method: GET");
    expect(text).toContain("Browser online: true");
    expect(text).toContain("Fetch error name: TypeError");
    expect(text).toContain("CORS suspected: true");
    expect(text).toContain("Current page: https://hrm.cafeasiana.com.mv/setup");
    expect(text).toContain("Build version: 0.1.0");
    expect(text).toContain("Elapsed ms: 1000");
  });

  it("timeout uses API_TIMEOUT instead of NETWORK_UNREACHABLE", () => {
    const error = createTimeoutError(diagnostics);

    expect(error.code).toBe("API_TIMEOUT");
    expect(error.diagnostics?.timeout).toBe(true);
  });

  it("HTML responses and invalid JSON responses use separate error codes", () => {
    expect(createHtmlApiResponseError(200, diagnostics).code).toBe("API_HTML_RESPONSE");
    expect(createInvalidApiResponseError(502, diagnostics).code).toBe("INVALID_API_RESPONSE");
  });
});
