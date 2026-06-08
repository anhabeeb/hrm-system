import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`verify:notifications-schema failed: ${message}`);
  process.exit(1);
};

const requiredFiles = [
  "migrations/0042_in_app_notifications.sql",
  "src/modules/notifications/notifications.service.ts",
  "src/modules/notifications/notifications.repository.ts",
  "src/modules/notifications/notifications.controller.ts",
  "src/routes/notifications.routes.ts",
  "frontend/src/features/notifications/NotificationBell.tsx",
  "frontend/src/features/notifications/NotificationsPage.tsx",
  "frontend/src/features/notifications/notifications.api.ts",
  "tests/notifications.test.ts",
];
for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`${file} is missing`);
}

const migration = read("migrations/0042_in_app_notifications.sql");
for (const token of [
  "recipient_user_id",
  "idempotency_key",
  "notification_preferences",
  "notification_delivery_logs",
  "idx_notifications_company_recipient_status_created",
]) {
  if (!migration.includes(token)) fail(`migration missing ${token}`);
}

const service = read("src/modules/notifications/notifications.service.ts");
for (const token of [
  "sanitizeNotificationMetadata",
  "sanitizeActionUrl",
  "resolveRecipients",
  "createNotificationsForUsers",
  "safeNotifyResolvedRecipients",
  "markRead",
  "markUnread",
  "archive",
  "dismiss",
  "markAllRead",
  "getUnreadCount",
  "updatePreferences",
]) {
  if (!service.includes(token)) fail(`notification service missing ${token}`);
}
if (/sendEmail|smtp|mailgun|ses|postmark/i.test(service)) {
  fail("Phase 10A must not implement email sending");
}

const routes = read("src/routes/notifications.routes.ts");
for (const route of [
  "/unread-count",
  "/preferences",
  "/mark-all-read",
  "/:id/read",
  "/:id/unread",
  "/:id/archive",
  "/:id/dismiss",
]) {
  if (!routes.includes(route)) fail(`notification route missing ${route}`);
}

const permissions = read("seeds/permissions.seed.sql");
for (const permission of [
  "notifications.view",
  "notifications.manage_own",
  "notifications.mark_read",
  "notifications.archive",
  "notifications.preferences.manage",
  "notifications.admin.view",
  "notifications.admin.manage",
  "notifications.audit.view",
]) {
  if (!permissions.includes(permission)) fail(`seeded permission missing ${permission}`);
}

const app = read("src/app.ts");
if (!app.includes("notificationsRoutes") || !app.includes('/notifications"')) fail("notifications route is not registered");

const topbar = read("frontend/src/components/layout/Topbar.tsx");
const page = read("frontend/src/features/notifications/NotificationsPage.tsx");
const router = read("frontend/src/app/router.tsx");
if (!topbar.includes("NotificationBell")) fail("notification bell is missing from topbar");
if (!page.includes("Preferences") || !page.includes("Mark filtered read") || !page.includes("Email Preferences")) {
  fail("notifications page missing list/preferences/email notification tabs");
}
if (!router.includes("/notifications")) fail("notifications frontend route is missing");

const leave = read("src/modules/leave/leave.service.ts");
const longLeave = read("src/modules/long-leave/long-leave.service.ts");
if (!leave.includes("leave_request_submitted") || !leave.includes("leave_request_approved") || !leave.includes("safeNotifyResolvedRecipients")) {
  fail("leave approval notification hooks are missing");
}
if (!longLeave.includes("long_leave_submitted") || !longLeave.includes("long_leave_payroll_review_required") || !longLeave.includes("safeNotifyResolvedRecipients")) {
  fail("long leave approval/payroll review notification hooks are missing");
}

const tests = read("tests/notifications.test.ts");
if (tests.includes("it.todo")) fail("Phase 10A notification tests contain it.todo placeholders");
for (const testName of [
  "idempotency prevents duplicate notifications",
  "metadata sanitizer removes unsafe fields",
  "action_url rejects unsafe external URLs",
  "role-based recipient resolution",
  "permission-based recipient resolution",
  "leave submitted creates approval notification",
  "long leave payroll review creates notification",
]) {
  if (!tests.includes(testName)) fail(`notification tests missing ${testName}`);
}

console.log("verify:notifications-schema passed");
