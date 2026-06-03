import { pathToFileURL } from "node:url";

export const DEFAULT_BASE_URL = "https://hrm.cafeasiana.com.mv";

export const smokeChecks = [
  { label: "health", path: "/api/v1/health", kind: "json-status", expectedStatus: 200 },
  { label: "version", path: "/api/v1/version", kind: "json-status", expectedStatus: 200 },
  { label: "users unauthenticated", path: "/api/v1/users", kind: "auth-route" },
  { label: "roles unauthenticated", path: "/api/v1/roles", kind: "auth-route" },
  { label: "permissions unauthenticated", path: "/api/v1/permissions", kind: "auth-route" },
  { label: "unknown API route", path: "/api/not-real", kind: "api-not-found" },
  { label: "frontend root", path: "/", kind: "spa-html" },
  { label: "frontend dashboard", path: "/dashboard", kind: "spa-html" },
];

const isJson = (contentType) => contentType.toLowerCase().includes("application/json");
const isHtml = (contentType) => contentType.toLowerCase().includes("text/html");
const hasHtmlShell = (body) => body.toLowerCase().includes("<!doctype html");

export const classifySmokeResponse = (check, response) => {
  const status = response.status;
  const contentType = response.contentType ?? "";
  const body = response.body ?? "";

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

  if (check.kind === "spa-html") {
    if (status !== 200) {
      return { ok: false, reason: `Expected frontend 200, received ${status}.` };
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

export const runProductionSmoke = async ({
  baseUrl = process.env.SMOKE_BASE_URL ?? process.argv[2] ?? DEFAULT_BASE_URL,
  fetchImpl = fetch,
  logger = console,
} = {}) => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const results = [];

  for (const check of smokeChecks) {
    const url = `${normalizedBaseUrl}${check.path}`;
    let responseSummary;

    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: check.kind === "spa-html" ? "text/html,application/xhtml+xml" : "application/json",
        },
      });
      responseSummary = {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body: await response.text(),
      };
    } catch (error) {
      responseSummary = {
        status: 0,
        contentType: "",
        body: error instanceof Error ? error.message : String(error),
      };
    }

    const classification = classifySmokeResponse(check, responseSummary);
    const result = { check, url, response: responseSummary, ...classification };
    results.push(result);

    logger.log(
      `${result.ok ? "OK" : "FAIL"} ${check.label}: ${responseSummary.status} ${responseSummary.contentType} ${url} - ${result.reason}`,
    );

    if (!result.ok && responseSummary.body) {
      logger.log(responseSummary.body.slice(0, 800));
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
