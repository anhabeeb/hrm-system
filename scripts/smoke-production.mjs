import { pathToFileURL } from "node:url";

export const DEFAULT_BASE_URL = "https://hrm.cafeasiana.com.mv";

export const protectedApiPaths = [
  "/api/v1/users",
  "/api/v1/roles",
  "/api/v1/permissions",
  "/api/v1/dashboard/summary",
  "/api/v1/hr-reports/catalog",
  "/api/v1/payroll-reports/catalog",
  "/api/v1/report-exports/catalog",
  "/api/v1/imports/templates",
  "/api/v1/backup-recovery/backups",
  "/api/v1/data-retention/settings",
];

export const smokeChecks = [
  { label: "health", path: "/api/v1/health", kind: "json-status", expectedStatus: 200, target: "api" },
  { label: "version", path: "/api/v1/version", kind: "json-status", expectedStatus: 200, target: "api" },
  { label: "bootstrap status", path: "/api/v1/bootstrap/status", kind: "json-status", expectedStatus: 200, target: "api" },
  ...protectedApiPaths.map((path) => ({
    label: `${path.replace("/api/v1/", "")} unauthenticated`,
    path,
    kind: "auth-route",
    target: "api",
  })),
  { label: "unknown API route", path: "/api/v1/not-real", kind: "api-not-found", target: "api" },
  { label: "CORS preflight", path: "/api/v1/health", kind: "cors-preflight", target: "api", method: "OPTIONS" },
  { label: "security headers", path: "/", kind: "security-headers", target: "frontend" },
  { label: "frontend root", path: "/", kind: "spa-html", target: "frontend" },
  { label: "frontend dashboard", path: "/dashboard", kind: "spa-html", target: "frontend" },
  { label: "frontend employee route fallback", path: "/employees", kind: "spa-html", target: "frontend" },
];

const isJson = (contentType) => contentType.toLowerCase().includes("application/json");
const isHtml = (contentType) => contentType.toLowerCase().includes("text/html");
const hasHtmlShell = (body) => body.toLowerCase().includes("<!doctype html");
const normalizeHeaders = (headers = {}) => {
  if (headers instanceof Headers) {
    return Object.fromEntries([...headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
};

export const requiredSecurityHeaders = [
  "x-content-type-options",
  "referrer-policy",
  "cache-control",
];

export const classifySmokeResponse = (check, response) => {
  const status = response.status;
  const contentType = response.contentType ?? "";
  const body = response.body ?? "";
  const headers = normalizeHeaders(response.headers);

  if (check.path.startsWith("/api/") && hasHtmlShell(body)) {
    return { ok: false, reason: "API route returned HTML instead of JSON." };
  }

  if (check.kind === "json-status") {
    if (status !== check.expectedStatus) {
      return { ok: false, reason: `Expected status ${check.expectedStatus}, received ${status}.` };
    }
    if (!isJson(contentType)) {
      return { ok: false, reason: "Expected JSON content type." };
    }
    return { ok: true, reason: "JSON route responded correctly." };
  }

  if (check.kind === "auth-route") {
    if (status === 404) {
      return { ok: false, reason: "Critical route returned 404; production likely deployed stale source." };
    }
    if (status !== 401) {
      return { ok: false, reason: `Expected unauthenticated 401, received ${status}.` };
    }
    if (!isJson(contentType)) {
      return { ok: false, reason: "Expected JSON auth error." };
    }
    return { ok: true, reason: "Critical route exists and is protected by auth." };
  }

  if (check.kind === "api-not-found") {
    if (status !== 404) {
      return { ok: false, reason: `Expected API 404, received ${status}.` };
    }
    if (!isJson(contentType)) {
      return { ok: false, reason: "Expected JSON API not-found response." };
    }
    if (!body.includes("API_ROUTE_NOT_FOUND")) {
      return { ok: false, reason: "Expected API_ROUTE_NOT_FOUND code." };
    }
    return { ok: true, reason: "Unknown API route returns structured JSON 404." };
  }

  if (check.kind === "cors-preflight") {
    if (![200, 204].includes(status)) {
      return { ok: false, reason: `Expected CORS preflight 200/204, received ${status}.` };
    }
    if (!headers["access-control-allow-origin"]) {
      return { ok: false, reason: "Missing Access-Control-Allow-Origin header." };
    }
    if (headers["access-control-allow-origin"] === "*" && headers["access-control-allow-credentials"] === "true") {
      return { ok: false, reason: "Wildcard CORS with credentials is unsafe." };
    }
    return { ok: true, reason: "CORS preflight responded safely." };
  }

  if (check.kind === "security-headers") {
    const missing = requiredSecurityHeaders.filter((header) => !headers[header]);
    if (missing.length > 0) {
      return { ok: false, reason: `Missing security headers: ${missing.join(", ")}.` };
    }
    return { ok: true, reason: "Security headers are present." };
  }

  if (check.kind === "spa-html") {
    if (status !== 200) {
      return { ok: false, reason: `Expected frontend 200, received ${status}.` };
    }
    if (isJson(contentType)) {
      return { ok: false, reason: "Frontend route returned API JSON instead of HTML." };
    }
    if (!isHtml(contentType)) {
      return { ok: false, reason: "Expected text/html content type." };
    }
    if (!hasHtmlShell(body)) {
      return { ok: false, reason: "Expected React app shell HTML." };
    }
    if (body.includes("ENDPOINT_NOT_FOUND")) {
      return { ok: false, reason: "Frontend route returned API ENDPOINT_NOT_FOUND JSON." };
    }
    return { ok: true, reason: "Frontend route returns the React app shell." };
  }

  return { ok: false, reason: `Unknown smoke check kind: ${check.kind}` };
};

const responseSummary = async (response) => ({
  status: response.status,
  contentType: response.headers.get("content-type") ?? "",
  headers: Object.fromEntries(response.headers.entries()),
  body: await response.text(),
});

const urlForCheck = (check, baseUrl, apiBaseUrl) => {
  const selectedBaseUrl = check.target === "api" ? apiBaseUrl : baseUrl;
  return `${selectedBaseUrl.replace(/\/+$/, "")}${check.path}`;
};

export const runProductionSmoke = async ({
  baseUrl = process.env.SMOKE_BASE_URL ?? process.argv[2] ?? DEFAULT_BASE_URL,
  apiBaseUrl = process.env.SMOKE_API_BASE_URL ?? baseUrl,
  allowedOrigin = process.env.SMOKE_ALLOWED_ORIGIN ?? baseUrl,
  fetchImpl = fetch,
  logger = console,
} = {}) => {
  const results = [];

  for (const check of smokeChecks) {
    const url = urlForCheck(check, baseUrl, apiBaseUrl);
    let summary;

    try {
      const response = await fetchImpl(url, {
        method: check.method ?? "GET",
        headers: {
          Accept: check.kind === "spa-html" || check.kind === "security-headers" ? "text/html,application/xhtml+xml" : "application/json",
          ...(check.kind === "cors-preflight"
            ? {
                Origin: allowedOrigin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type",
              }
            : {}),
        },
      });
      summary = await responseSummary(response);
    } catch (error) {
      summary = {
        status: 0,
        contentType: "",
        headers: {},
        body: error instanceof Error ? error.message : String(error),
      };
    }

    const classification = classifySmokeResponse(check, summary);
    const result = { check, url, response: summary, ...classification };
    results.push(result);

    logger.log(`${result.ok ? "PASS" : "FAIL"} ${check.label}: ${summary.status} ${summary.contentType} ${url} - ${result.reason}`);

    if (!result.ok && summary.body) {
      logger.log(summary.body.slice(0, 800));
    }
  }

  const failed = results.filter((result) => !result.ok);
  logger.log(`Production smoke summary: ${results.length - failed.length}/${results.length} passed.`);

  return {
    ok: failed.length === 0,
    results,
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runProductionSmoke();

  if (!result.ok) {
    process.exitCode = 1;
  }
}
