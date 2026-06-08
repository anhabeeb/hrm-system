import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`verify:email-notifications-schema failed: ${message}`);
  process.exit(1);
};

const requiredFiles = [
  "migrations/0043_email_notifications.sql",
  "src/modules/email-notifications/email-notifications.service.ts",
  "src/modules/email-notifications/email-notifications.repository.ts",
  "src/modules/email-notifications/email-provider.ts",
  "src/modules/email-notifications/email-templates.ts",
  "src/modules/email-notifications/email-notifications.controller.ts",
  "src/routes/email-notifications.routes.ts",
  "frontend/src/features/notifications/email-notifications.api.ts",
  "frontend/src/features/notifications/NotificationsPage.tsx",
  "tests/email-notifications.test.ts",
];
for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`${file} is missing`);
}

const migration = read("migrations/0043_email_notifications.sql");
for (const token of [
  "email_notifications",
  "email_notification_preferences",
  "email_notification_settings",
  "email_templates",
  "email_delivery_logs",
  "idempotency_key",
  "skipped_config_missing",
  "idx_email_notifications_company_idempotency",
]) {
  if (!migration.includes(token)) fail(`migration missing ${token}`);
}

const provider = read("src/modules/email-notifications/email-provider.ts");
for (const token of [
  "EmailProvider",
  "sendEmail",
  "validateConfiguration",
  "EMAIL_NOTIFICATIONS_ENABLED",
  "EMAIL_PROVIDER",
  "EMAIL_DRY_RUN",
  "RESEND_API_KEY",
  "fetch(",
]) {
  if (!provider.includes(token)) fail(`provider abstraction missing ${token}`);
}

const service = read("src/modules/email-notifications/email-notifications.service.ts");
for (const token of [
  "createEmailJob",
  "safeCreateEmailJobForNotification",
  "findEmailJobByIdempotencyKey",
  "sendPendingEmail",
  "processPendingEmails",
  "updatePreferences",
  "updateSettings",
  "previewTemplate",
  "sanitizeNotificationMetadata",
]) {
  if (!service.includes(token)) fail(`email service missing ${token}`);
}
if (!service.includes("status === \"sent\"") || !service.includes("EMAIL_ALREADY_SENT")) {
  fail("sent email retry protection is missing");
}

const routes = read("src/routes/email-notifications.routes.ts");
for (const route of [
  "/preferences",
  "/settings",
  "/process-pending",
  "/templates",
  "/:id/retry",
]) {
  if (!routes.includes(route)) fail(`email route missing ${route}`);
}

const permissions = read("seeds/permissions.seed.sql");
for (const permission of [
  "email_notifications.view_own",
  "email_notifications.preferences.manage",
  "email_notifications.admin.view",
  "email_notifications.admin.manage",
  "email_notifications.retry",
  "email_notifications.process",
  "email_notifications.templates.view",
  "email_notifications.settings.manage",
  "email_notifications.audit.view",
]) {
  if (!permissions.includes(permission)) fail(`seeded permission missing ${permission}`);
}

const app = read("src/app.ts");
if (!app.includes("emailNotificationsRoutes") || !app.includes('/email-notifications"')) {
  fail("email notification route is not registered");
}

const templates = read("src/modules/email-notifications/email-templates.ts");
for (const token of ["codeEmailTemplates", "renderEmailTemplate", "stripUnsafeHtml", "sanitizeActionUrl"]) {
  if (!templates.includes(token)) fail(`template sanitizer missing ${token}`);
}

const notifications = read("src/modules/notifications/notifications.service.ts");
if (!notifications.includes("safeCreateEmailJobForNotification")) {
  fail("email jobs are not hooked into Phase 10A notification creation");
}

const page = read("frontend/src/features/notifications/NotificationsPage.tsx");
for (const token of [
  "Email Delivery Log",
  "Email Preferences",
  "Email Settings",
  "Retry email",
  "Provider:",
  "No API keys or provider secrets are shown here",
]) {
  if (!page.includes(token)) fail(`frontend email UI missing ${token}`);
}
if (/expiry alert|expiry_alert|expires soon/i.test(page + service)) {
  fail("Phase 10B must not implement Phase 10C expiry alert rules");
}

const tests = read("tests/email-notifications.test.ts");
if (tests.includes("it.todo")) fail("Phase 10B email notification tests contain it.todo placeholders");
for (const testName of [
  "provider disabled mode",
  "dry-run mode does not call external provider",
  "idempotency prevents duplicate email jobs",
  "sent job is not resent",
  "preferences disabled skips optional email",
  "unsafe action URLs are blocked",
  "leave submitted creates email job for approver",
  "provider failure does not fail leave approval workflow",
]) {
  if (!tests.includes(testName)) fail(`email notification tests missing ${testName}`);
}

const allSource = [
  provider,
  service,
  templates,
  migration,
  read("src/modules/email-notifications/email-notifications.controller.ts"),
].join("\n");
if (/smtp_password|mailgun_secret|postmark_token|sendgrid_api_key\s*=\s*['"]/i.test(allSource)) {
  fail("provider secrets appear to be stored or committed");
}

console.log("verify:email-notifications-schema passed");
