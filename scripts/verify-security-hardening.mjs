import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(rootDir, file), "utf8");
const exists = (file) => fs.existsSync(path.join(rootDir, file));
const ignoredSearchDirs = new Set([".git", "node_modules", "dist", "build", ".wrangler", ".vite"]);

const listProjectFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredSearchDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProjectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
};

const failures = [];
const unsupportedVitestPoolOptionsFlag = `--pool${"Options"}`;
const assertContains = (label, text, pattern, hint) => {
  if (!(pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern))) {
    failures.push(`${label}: ${hint}`);
  }
};

const app = read("src/app.ts");
const workerEntrypoint = read("src/index.ts");
const packageJson = read("package.json");
const securityMiddleware = read("src/middleware/security.middleware.ts");
const cors = read("src/middleware/cors.middleware.ts");
const session = read("src/services/session.service.ts");
const frontendAuthToken = read("frontend/src/lib/auth-token.ts");
const frontendApiClient = read("frontend/src/lib/api-client.ts");
const frontendAuthStore = read("frontend/src/features/auth/auth.store.tsx");
const authService = read("src/modules/auth/auth.service.ts");
const authRepository = read("src/modules/auth/auth.repository.ts");
const errorLogger = read("src/utils/error-logger.ts");
const documentsController = read("src/modules/documents/documents.controller.ts");
const reportExportsController = read("src/modules/report-exports/report-exports.controller.ts");
const backupService = read("src/modules/backup-recovery/backup-recovery.service.ts");
const reportExportsService = read("src/modules/report-exports/report-exports.service.ts");
const backupSnapshot = read("src/modules/backup-recovery/backup-snapshot.service.ts");
const deviceAuth = read("src/middleware/device-auth.middleware.ts");
const devicesService = read("src/modules/devices/devices.service.ts");
const notificationsSafety = read("src/modules/notifications/notification-safety.ts");
const auditLogs = read("src/modules/audit-logs/audit-logs.service.ts");
const securityTests = exists("tests/security-hardening.test.ts") ? read("tests/security-hardening.test.ts") : "";

assertContains("app", app, "securityHeadersMiddleware", "security headers middleware must be mounted.");
assertContains("app", app, "unsafeRequestGuardMiddleware", "unsafe request guard middleware must be mounted.");
assertContains("security middleware", securityMiddleware, "X-Content-Type-Options", "nosniff header is missing.");
assertContains("security middleware", securityMiddleware, "Content-Security-Policy", "CSP header is missing.");
assertContains("security middleware", securityMiddleware, "Referrer-Policy", "Referrer-Policy header is missing.");
assertContains("security middleware", securityMiddleware, "X-Frame-Options", "frame protection header is missing.");
assertContains("security middleware", securityMiddleware, "Cache-Control", "API no-store cache control is missing.");
assertContains("security middleware", securityMiddleware, "CSRF_ORIGIN_DENIED", "unsafe cross-origin mutation guard is missing.");
assertContains("security middleware", securityMiddleware, "UNSAFE_CONTENT_TYPE", "simple form/text content-type guard is missing.");
assertContains("security middleware", securityMiddleware, "isDeviceTokenRequest", "device token routes must be separated from cookie CSRF handling.");
assertContains("worker frontend assets", workerEntrypoint, "withFrontendSecurityHeaders(await env.ASSETS.fetch(request))", "frontend ASSETS responses must be wrapped with security headers.");
assertContains("worker frontend assets", workerEntrypoint, "frontendAssetsNotConfigured", "missing frontend assets fallback must exist.");
assertContains("worker frontend assets", workerEntrypoint, "X-Content-Type-Options", "frontend ASSETS responses must include nosniff.");
assertContains("worker frontend assets", workerEntrypoint, "Referrer-Policy", "frontend ASSETS responses must include Referrer-Policy.");
assertContains("worker frontend assets", workerEntrypoint, "strict-origin-when-cross-origin", "frontend ASSETS Referrer-Policy must match production smoke expectation.");
assertContains("worker frontend assets", workerEntrypoint, "X-Frame-Options", "frontend ASSETS responses should deny framing.");
assertContains("worker frontend assets", workerEntrypoint, "Permissions-Policy", "frontend ASSETS responses should include a safe permissions policy.");

if (/localStorage|sessionStorage|TOKEN_STORAGE_KEY|hrm\.auth\.token/.test(frontendAuthToken)) {
  failures.push("frontend/src/lib/auth-token.ts: auth tokens must not be read from or written to browser storage.");
}
if (/getAuthToken/.test(frontendApiClient) || /Authorization["']?\s*,\s*`Bearer/.test(frontendApiClient)) {
  failures.push("frontend/src/lib/api-client.ts: API client must not attach Authorization Bearer from frontend auth-token storage.");
}
if (/setAuthToken|getAuthToken|localStorage|sessionStorage/.test(frontendAuthStore)) {
  failures.push("frontend auth store: AuthProvider must rely on cookie-backed /auth/me and avoid stored auth tokens.");
}
assertContains("api client", frontendApiClient, 'credentials: "include"', "API client must keep cookie credentials enabled.");

assertContains("error logger", errorLogger, "sanitizeSensitivePayload", "error details must be sanitized before logging/storage.");
assertContains("error logger", errorLogger, "sanitizeSensitiveText", "error messages and stacks must be text-sanitized.");
assertContains("error logger", errorLogger, "sanitizedStackForEnvironment", "environment-aware stack handling is missing.");
assertContains("error logger", errorLogger, "shouldSuppressErrorDetails", "auth/permission error details must be suppressed to avoid scope leaks.");
assertContains("error logger", errorLogger, /isProduction\(environment\)[\s\S]*return null/, "production stack traces must be omitted.");
if (/errorStack\(originalError\)\s*\?\?\s*null/.test(errorLogger)) {
  failures.push("src/utils/error-logger.ts: raw original error stacks must not be stored.");
}
if (/JSON\.stringify\(appError\.details\)/.test(errorLogger)) {
  failures.push("src/utils/error-logger.ts: appError.details must not be stringified without sensitive sanitization.");
}

assertContains("package scripts", packageJson, "verify:dependency-security", "critical dependency audit verification script is missing.");
assertContains("package scripts", packageJson, /verify:security-hardening[\s\S]*verify:dependency-security/, "security hardening verifier must run dependency security checks.");
assertContains("dependency verifier", read("scripts/verify-dependency-security.mjs"), /npm[\s\S]*audit[\s\S]*critical/, "dependency verifier must fail on critical npm audit findings.");

for (const file of listProjectFiles(rootDir)) {
  const relative = path.relative(rootDir, file).replace(/\\/g, "/");
  if (relative === "package-lock.json") continue;
  const text = fs.readFileSync(file, "utf8");
  if (text.includes(unsupportedVitestPoolOptionsFlag)) {
    failures.push(`${relative}: Vitest 4 does not support ${unsupportedVitestPoolOptionsFlag}; use supported flags such as --pool=forks --maxWorkers=1 if single-worker execution is needed.`);
  }
}

if (/Access-Control-Allow-Origin["']?\s*:\s*["']\*/.test(cors) && cors.includes("Access-Control-Allow-Credentials")) {
  failures.push("cors.middleware.ts: wildcard CORS must not be used with credentials.");
}
assertContains("cors", cors, "getAllowedCorsOrigins", "CORS origins must be config/env based.");
assertContains("cors", cors, "Vary: \"Origin\"", "CORS responses must vary by Origin.");

for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) {
  assertContains("session cookie", session, flag, `${flag} cookie flag is missing.`);
}
assertContains("session tokens", session, /generateSecureToken\(48\)[\s\S]*hashToken\(token,\s*sessionSecret\)/, "session token must be random and hashed before storage.");

assertContains("auth login", authService, "LOGIN_ERROR_MESSAGE", "login errors must use generic messaging.");
assertContains("auth login", authService, "FAILED_LOGIN_LIMIT", "failed login limit must be enforced.");
assertContains("auth login", authService, "updateFailedLogin", "failed login attempts must be tracked.");
assertContains("auth password", authService, /verifyPassword\([\s\S]*input\.current_password[\s\S]*revokeUserSessions/, "password change must verify current password and revoke sessions.");
assertContains("password reset", authService, /hashToken\(token,\s*env\.SESSION_SECRET\)[\s\S]*createPasswordResetToken/, "password reset tokens must be hashed at rest.");
assertContains("password reset", authRepository, /token_hash[\s\S]*expires_at[\s\S]*used_at[\s\S]*markPasswordResetTokenUsed/, "password reset tokens must be single-use and expiring.");
assertContains("2FA", authService, /encryptTotpSecret|secret_encrypted/, "TOTP secrets must be encrypted/protected at rest.");
assertContains("2FA", authService, /backup_codes_hash_json|createBackupCodes/, "backup codes must be hashed/protected.");

assertContains("device auth", deviceAuth, /readBearerToken[\s\S]*authenticateDevice/, "device endpoints must use bearer/device auth.");
assertContains("device DTO", devicesService, /device_token_hash:\s*_tokenHash/, "device token hash must not be returned in DTOs.");
assertContains("device DTO", devicesService, /rawToken[\s\S]*device_token[\s\S]*token_shown_once/, "raw device token should only appear on registration/rotation responses.");

assertContains("report export", reportExportsService, /formula|spreadsheet|dangerous/i, "CSV formula injection protection must be present.");
assertContains("report export", reportExportsService, /action === "download"[\s\S]*requireExportPermission\(actor,\s*requireCatalogItem\(job\.report_key\),\s*"download"\)/, "export download must route through job permission checks.");
assertContains("report export", reportExportsService, /action === "download"[\s\S]*report_exports\.download/, "export download must map to report_exports.download permission.");
assertContains("backup", backupSnapshot, /excluded_fields[\s\S]*password_hash[\s\S]*device_token[\s\S]*raw_payload/, "backup snapshots must exclude secrets/tokens/raw payloads.");
assertContains("backup", backupService, /backup_recovery\.backup\.download[\s\S]*findBackup/, "backup download must re-check permission and company scope.");

for (const [label, text] of [
  ["document downloads", documentsController],
  ["report export downloads", reportExportsController],
  ["backup downloads", backupService],
]) {
  assertContains(label, text, "safeAttachmentHeader", "download filename must use safe attachment header helper.");
}

assertContains("notifications", notificationsSafety, /password_hash[\s\S]*api_token_hash[\s\S]*redacted/i, "notification metadata sanitizer must redact secrets.");
assertContains("audit logs", auditLogs, /password_hash[\s\S]*secret[\s\S]*sanitize/i, "audit metadata must be sanitized.");

for (const file of [
  "src/routes/report-exports.routes.ts",
  "src/routes/imports.routes.ts",
  "src/routes/backup-recovery.routes.ts",
  "src/routes/data-retention.routes.ts",
]) {
  const text = read(file);
  assertContains(file, text, /requirePermission|requireAnyPermission|requireReason/, "dangerous recent-phase routes must retain strong guards.");
}

if (/it\.todo\(/.test(securityTests)) {
  failures.push("tests/security-hardening.test.ts: Phase 13B-critical it.todo placeholders remain.");
}
for (const phrase of [
  "session cookie includes secure browser flags",
  "security headers are present on API responses",
  "disallowed cross-origin unsafe mutation is rejected",
  "unsafe download filenames are sanitized",
  "login and reset flows do not expose secrets",
  "device and biometric secrets are not returned",
  "login does not write any auth token to localStorage or sessionStorage",
  "API client does not attach Authorization from localStorage",
  "error logger redacts sensitive details, messages, causes, and production stacks",
  "system_error_logs stores sanitized stack values outside production",
]) {
  if (!securityTests.includes(phrase)) failures.push(`tests/security-hardening.test.ts: missing coverage marker "${phrase}".`);
}

if (failures.length > 0) {
  console.error("Security hardening verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Security hardening verification passed.");
}
