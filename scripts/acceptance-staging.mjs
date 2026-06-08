import { pathToFileURL } from "node:url";

export const requiredAcceptanceEnv = [
  "ACCEPTANCE_BASE_URL",
  "ACCEPTANCE_USERNAME",
  "ACCEPTANCE_PASSWORD",
];

export const readOnlyAcceptanceChecks = [
  { label: "auth me", path: "/api/v1/auth/me" },
  { label: "dashboard summary", path: "/api/v1/dashboard/summary" },
  { label: "employee list", path: "/api/v1/employees?page=1&page_size=10" },
  { label: "attendance report", path: "/api/v1/attendance/reports/daily?date=2026-06-09&page=1&page_size=10" },
  { label: "leave balances", path: "/api/v1/leave/balances?page=1&page_size=10" },
  { label: "leave approval inbox", path: "/api/v1/leave/approvals/inbox?page=1&page_size=10" },
  { label: "long leave list", path: "/api/v1/long-leave?page=1&page_size=10" },
  { label: "holiday calendar", path: "/api/v1/holidays?page=1&page_size=10" },
  { label: "notifications unread count", path: "/api/v1/notifications/unread-count" },
  { label: "expiry alerts summary", path: "/api/v1/expiry-alerts/summary" },
  { label: "HR reports catalog", path: "/api/v1/hr-reports/catalog" },
  { label: "payroll reports catalog", path: "/api/v1/payroll-reports/catalog" },
  { label: "export catalog", path: "/api/v1/report-exports/catalog" },
  { label: "import templates", path: "/api/v1/imports/templates" },
  { label: "backup settings", path: "/api/v1/backup-recovery/settings" },
  { label: "data retention settings", path: "/api/v1/data-retention/settings" },
];

export const validateAcceptanceConfig = (env = process.env) => {
  const missing = requiredAcceptanceEnv.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Missing required staging acceptance env vars: ${missing.join(", ")}.`,
    };
  }
  if (env.ACCEPTANCE_ENABLE_MUTATIONS === "true") {
    return {
      ok: false,
      reason: "Mutation acceptance tests are intentionally disabled in this script. Use a separate staging-only script for mutating flows.",
    };
  }
  return { ok: true, reason: "Staging acceptance configuration is present." };
};

const appendCookie = (jar, response) => {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return jar;
  const cookie = setCookie.split(";")[0];
  return cookie ? [...jar.filter((item) => item.split("=")[0] !== cookie.split("=")[0]), cookie] : jar;
};

const safeJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const request = async (fetchImpl, baseUrl, path, options = {}, cookieJar = []) => {
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookieJar.length ? { Cookie: cookieJar.join("; ") } : {}),
      ...(options.headers ?? {}),
    },
  });
  return response;
};

export const runStagingAcceptance = async ({
  env = process.env,
  fetchImpl = fetch,
  logger = console,
} = {}) => {
  const config = validateAcceptanceConfig(env);
  if (!config.ok) {
    logger.error(`FAIL staging acceptance configuration: ${config.reason}`);
    return { ok: false, results: [{ label: "configuration", ok: false, reason: config.reason }] };
  }

  logger.log("Staging-only acceptance script starting. Read-only checks only; no import/export/restore/archive/apply actions will run.");

  const baseUrl = env.ACCEPTANCE_BASE_URL;
  const results = [];
  let cookieJar = [];

  const loginResponse = await request(fetchImpl, baseUrl, "/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: env.ACCEPTANCE_USERNAME,
      password: env.ACCEPTANCE_PASSWORD,
      totp_code: env.ACCEPTANCE_TOTP_CODE,
    }),
  });
  cookieJar = appendCookie(cookieJar, loginResponse);
  const loginOk = loginResponse.status >= 200 && loginResponse.status < 300;
  results.push({ label: "login", ok: loginOk, status: loginResponse.status });
  logger.log(`${loginOk ? "PASS" : "FAIL"} login: ${loginResponse.status}`);

  if (!loginOk) {
    return { ok: false, results };
  }

  const checks = [...readOnlyAcceptanceChecks];
  if (env.ACCEPTANCE_EMPLOYEE_ID?.trim()) {
    checks.splice(3, 0, {
      label: "Employee 360",
      path: `/api/v1/employees/${encodeURIComponent(env.ACCEPTANCE_EMPLOYEE_ID)}`,
    });
  }

  for (const check of checks) {
    const response = await request(fetchImpl, baseUrl, check.path, { method: "GET" }, cookieJar);
    const ok = response.status >= 200 && response.status < 300;
    results.push({ label: check.label, ok, status: response.status });
    logger.log(`${ok ? "PASS" : "FAIL"} ${check.label}: ${response.status}`);
    if (!ok) await safeJson(response);
  }

  const logoutResponse = await request(fetchImpl, baseUrl, "/api/v1/auth/logout", { method: "POST" }, cookieJar);
  const logoutOk = logoutResponse.status >= 200 && logoutResponse.status < 300;
  results.push({ label: "logout", ok: logoutOk, status: logoutResponse.status });
  logger.log(`${logoutOk ? "PASS" : "FAIL"} logout: ${logoutResponse.status}`);

  return {
    ok: results.every((result) => result.ok),
    results,
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runStagingAcceptance();
  if (!result.ok) process.exitCode = 1;
}
