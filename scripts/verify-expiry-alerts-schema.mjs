import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`verify:expiry-alerts-schema failed: ${message}`);
  process.exit(1);
};

const requiredFiles = [
  "migrations/0044_expiry_alerts.sql",
  "migrations/0045_expiry_alert_repeat_notification_windows.sql",
  "src/modules/expiry-alerts/expiry-alerts.service.ts",
  "src/modules/expiry-alerts/expiry-alerts.repository.ts",
  "src/modules/expiry-alerts/expiry-alerts.controller.ts",
  "src/modules/expiry-alerts/expiry-alerts.validators.ts",
  "src/routes/expiry-alerts.routes.ts",
  "frontend/src/features/expiry-alerts/ExpiryAlertsPage.tsx",
  "frontend/src/features/expiry-alerts/expiry-alerts.api.ts",
  "tests/expiry-alerts.test.ts",
];
for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`${file} is missing`);
}

const migration = `${read("migrations/0044_expiry_alerts.sql")}\n${read("migrations/0045_expiry_alert_repeat_notification_windows.sql")}`;
for (const token of [
  "expiry_alerts",
  "expiry_alert_settings",
  "idempotency_key",
  "idx_expiry_alerts_company_idempotency",
  "passport_expiry_date",
  "work_permit_expiry_date",
  "employee_documents(company_id, expiry_date",
  "employee_contracts(company_id, probation_end_date",
  "long_leave_records(company_id, expected_return_date",
  "last_notified_at",
  "idx_expiry_alerts_company_last_notified",
]) {
  if (!migration.includes(token)) fail(`migration missing ${token}`);
}

const service = read("src/modules/expiry-alerts/expiry-alerts.service.ts");
for (const token of [
  "collectExpiryCandidates",
  "buildExpiryAlertCandidate",
  "classifyExpirySeverity",
  "upsertCandidateAlert",
  "previewScan",
  "runScan",
  "notifyForAlert",
  "safeNotifyResolvedRecipients",
  "idempotency_key",
  "email_disabled",
  "employee_passport",
  "employee_work_permit",
  "employee_document",
  "contract",
  "probation",
  "long_leave_return",
  "snoozed_until",
  "EXPIRY_ALERT_SNOOZE_INVALID",
  "shouldNotify",
  "isFutureSnooze",
  "findUserEmployeeId",
  "resolveEmployeeScope",
  "updateAlertNotificationRefs",
  "expiry_alert_notification_link_failed",
  "by_source_type",
  "notificationWindowKey",
  "weekStartKey",
  "nextNotificationAt",
  "lastNotifiedAt",
  "nextNotificationAt(notifiedAt, settings)",
]) {
  if (!service.includes(token)) fail(`expiry alert service missing ${token}`);
}
if (!service.includes("assets: false") || !service.includes("uniforms: false") || !service.includes("settings.source_toggles.long_leave_return")) {
  fail("expiry scanner source toggles are incomplete");
}

const repository = read("src/modules/expiry-alerts/expiry-alerts.repository.ts");
for (const token of [
  "listEmployeeIdentitySources",
  "listDocumentSources",
  "listContractSources",
  "listLongLeaveReturnSources",
  "include_archived",
  "include_inactive",
  "getAlertByIdempotency",
  "insertAlert",
  "refreshAlert",
  "updateAlertStatus",
  "findUserEmployeeId",
  "employeeIdScope",
  "updateAlertNotificationRefs",
  "last_notified_at",
  "next_notification_at",
  "sourceSummary",
  "high_count",
  "warning_count",
  "due_7_days_count",
  "due_30_days_count",
]) {
  if (!repository.includes(token)) fail(`expiry alert repository missing ${token}`);
}
if (/sessions|reset_tokens|password|device_token_hash/i.test(repository)) {
  fail("expiry scanner appears to include auth/secrets instead of HR expiry sources");
}

const routes = read("src/routes/expiry-alerts.routes.ts");
for (const route of [
  "/summary",
  "/settings",
  "/scan/preview",
  "/scan/run",
  "/:id/acknowledge",
  "/:id/resolve",
  "/:id/dismiss",
  "/:id/snooze",
]) {
  if (!routes.includes(route)) fail(`expiry alert route missing ${route}`);
}

const permissions = read("seeds/permissions.seed.sql");
for (const permission of [
  "expiry_alerts.view",
  "expiry_alerts.view_own",
  "expiry_alerts.scan",
  "expiry_alerts.manage",
  "expiry_alerts.acknowledge",
  "expiry_alerts.resolve",
  "expiry_alerts.dismiss",
  "expiry_alerts.snooze",
  "expiry_alerts.settings.manage",
  "expiry_alerts.audit.view",
]) {
  if (!permissions.includes(permission)) fail(`seeded permission missing ${permission}`);
}
const roles = read("seeds/roles.seed.sql");
if (!roles.includes("'expiry_alerts'")) fail("expiry_alerts module is not assigned to default admin/HR roles");
if (!roles.includes("expiry_alerts.view_own")) fail("expiry_alerts.view_own is not assigned for self-service roles");

const app = read("src/app.ts");
if (!app.includes("expiryAlertsRoutes") || !app.includes('/expiry-alerts"')) fail("expiry alerts route is not registered");

const page = read("frontend/src/features/expiry-alerts/ExpiryAlertsPage.tsx");
const api = read("frontend/src/features/expiry-alerts/expiry-alerts.api.ts");
const router = read("frontend/src/app/router.tsx");
const nav = read("frontend/src/lib/navigation.ts");
for (const token of [
  "Expiry alerts page actions",
  "Run scan",
  "Preview",
  "Settings",
  "warning_days",
  "source_toggles",
  "No due-date field exists yet.",
  "High:",
  "Warning:",
  "Due 7d:",
  "Due 30d:",
]) {
  if (!page.includes(token)) fail(`frontend expiry page missing ${token}`);
}
for (const endpoint of ["/expiry-alerts", "/expiry-alerts/scan/preview", "/expiry-alerts/scan/run", "/expiry-alerts/settings"]) {
  if (!api.includes(endpoint)) fail(`frontend expiry API missing ${endpoint}`);
}
if (!router.includes("/expiry-alerts") || !nav.includes("Expiry Alerts")) fail("expiry alerts frontend route/navigation is missing");
if (/dark:/i.test(page)) fail("expiry alerts UI must not add dark mode styling");

const notifications = read("src/modules/notifications/notifications.service.ts");
if (!notifications.includes("metadata?.email_disabled !== true")) {
  fail("notification-to-email bridge cannot respect expiry alert email settings");
}

const tests = read("tests/expiry-alerts.test.ts");
if (tests.includes("it.todo")) fail("Phase 10C expiry alert tests contain it.todo placeholders");
for (const testName of [
  "preview scan does not write alerts or notifications",
  "run scan creates alert records, audit log, and in-app/email bridge notifications",
  "scan idempotency prevents duplicate alert records on rerun",
  "snoozed alert with future snoozed_until does not notify on rerun",
  "snoozed alert after snoozed_until notifies when next_notification_at is due while resolved or dismissed alerts do not notify",
  "snooze validates future snoozed_until and requires reason",
  "employee with view_own sees only own alert and cannot see another employee alert in same outlet",
  "employee with view_own can acknowledge own alert but cannot resolve or dismiss other employee alert",
  "HR user with expiry_alerts.view can see scoped outlet alerts while outlet-scoped manager cannot see other outlet alerts",
  "run scan stores notification_id and email_notification_id when notification is created",
  "daily repeat creates one notification per day, not multiple in same day",
  "weekly repeat creates one notification per week",
  "monthly repeat creates one notification per month",
  "repeat_frequency = once creates only one notification ever for the same alert/window",
  "next_notification_at and last_notified_at are updated after successful notification",
  "notification idempotency key includes a repeat window",
  "snoozed alert after snoozed_until does not notify if next_notification_at is still in the future",
  "snoozed alert after snoozed_until notifies when next_notification_at is due",
  "duplicate scan in same repeat window does not duplicate in-app or email notifications",
  "new repeat window can create a new in-app notification/email job",
  "failed notification reference update does not fail alert creation and writes warning audit",
  "summary counts active, high, warning, due windows, source type, critical, overdue, and due-today alerts",
  "collects employee document, passport, work permit, contract, probation, and long leave return sources",
  "settings update requires permission and reason",
  "resolve and dismiss require reason",
]) {
  if (!tests.includes(testName)) fail(`expiry alert tests missing ${testName}`);
}

if (!/status\)\s*===\s*"snoozed"[\s\S]*isFutureSnooze/.test(service)) {
  fail("shouldNotify does not suppress future snoozed alerts");
}
if (/idempotency_key:\s*`expiry-alert-notify:\$\{alert\.id\}:\$\{alert\.severity\}:\$\{alert\.expiry_date\}`/.test(service)) {
  fail("notifyForAlert still uses a static expiry alert notification idempotency key");
}
if (!/idempotency_key:\s*`expiry-alert-notify:\$\{alert\.id\}:\$\{alert\.severity\}:\$\{alert\.expiry_date\}:\$\{windowKey\}`/.test(service)) {
  fail("notifyForAlert idempotency key is missing the repeat notification window");
}
if (!/if \(alert\.next_notification_at\) return alert\.next_notification_at <= now/.test(service)) {
  fail("shouldNotify does not evaluate next_notification_at after snooze expiry");
}
if (!/last_notified_at\s*=\s*COALESCE/.test(repository) || !/next_notification_at\s*=\s*\?/.test(repository)) {
  fail("expiry alerts do not update last_notified_at and next_notification_at after notification");
}
if (!/notification_id\s*=\s*COALESCE\(notification_id/.test(repository) || !/email_notification_id\s*=\s*COALESCE\(email_notification_id/.test(repository)) {
  fail("expiry alerts do not safely link notification references");
}
if (!/findUserEmployeeId[\s\S]*expiry_alerts\.view_own/.test(service)) {
  fail("expiry_alerts.view_own is not scoped to the current user's employee profile");
}

console.log("verify:expiry-alerts-schema passed");
