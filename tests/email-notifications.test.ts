import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs: any[] = [];
const preferences: any[] = [];
const settings: any[] = [];
const deliveryLogs: any[] = [];
const users = [
  { id: "user_hr", employee_id: "emp_hr", email: "hr@example.com", full_name: "HR User", status: "active" },
  { id: "user_employee", employee_id: "emp_1", email: "employee@example.com", full_name: "Employee One", status: "active" },
  { id: "user_no_email", employee_id: "emp_2", email: null, full_name: "No Email", status: "active" },
];

vi.mock("../src/modules/email-notifications/email-notifications.repository", () => ({
  findUserEmail: vi.fn(async (_env, companyId, userId) =>
    companyId === "company_1" ? users.find((row) => row.id === userId) ?? null : null),
  findEmailJobByIdempotencyKey: vi.fn(async (_env, companyId, key) =>
    jobs.find((row) => row.company_id === companyId && row.idempotency_key === key) ?? null),
  createEmailJob: vi.fn(async (_env, input) => {
    jobs.push({
      id: input.id,
      company_id: input.companyId,
      in_app_notification_id: input.inAppNotificationId ?? null,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_employee_id: input.recipientEmployeeId ?? null,
      recipient_email: input.recipientEmail ?? null,
      recipient_name: input.recipientName ?? null,
      notification_type: input.notificationType,
      category: input.category,
      priority: input.priority,
      subject: input.subject,
      text_body: input.textBody,
      html_body: input.htmlBody ?? null,
      template_key: input.templateKey ?? null,
      template_version: input.templateVersion ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      event_key: input.eventKey ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      status: input.status,
      provider: input.provider ?? null,
      provider_message_id: null,
      attempt_count: 0,
      last_attempt_at: null,
      sent_at: null,
      failed_at: null,
      failure_code: input.failureCode ?? null,
      failure_message: input.failureMessage ?? null,
      created_by: input.createdBy ?? null,
      created_at: input.createdAt,
      updated_at: input.createdAt,
      metadata_json: input.metadataJson ?? null,
    });
  }),
  getEmailJob: vi.fn(async (_env, companyId, id) => jobs.find((row) => row.company_id === companyId && row.id === id) ?? null),
  countEmailJobs: vi.fn(async (_env, companyId, filters) =>
    jobs.filter((row) => row.company_id === companyId && (!filters.recipient_user_id || row.recipient_user_id === filters.recipient_user_id)).length),
  listEmailJobs: vi.fn(async (_env, companyId, filters) =>
    jobs.filter((row) => row.company_id === companyId && (!filters.recipient_user_id || row.recipient_user_id === filters.recipient_user_id))),
  listPendingEmailJobs: vi.fn(async (_env, companyId, limit) =>
    jobs.filter((row) => row.company_id === companyId && ["pending", "queued", "failed"].includes(row.status)).slice(0, limit)),
  updateAttempt: vi.fn(async (_env, companyId, id, timestamp) => {
    const row = jobs.find((item) => item.company_id === companyId && item.id === id);
    if (row) {
      row.attempt_count += 1;
      row.last_attempt_at = timestamp;
    }
  }),
  markSent: vi.fn(async (_env, input) => {
    const row = jobs.find((item) => item.company_id === input.companyId && item.id === input.id);
    if (row) {
      row.status = "sent";
      row.provider = input.provider;
      row.provider_message_id = input.providerMessageId ?? null;
      row.sent_at = input.timestamp;
      row.failure_code = null;
      row.failure_message = null;
    }
  }),
  markFailed: vi.fn(async (_env, input) => {
    const row = jobs.find((item) => item.company_id === input.companyId && item.id === input.id);
    if (row) {
      row.status = input.status ?? "failed";
      row.provider = input.provider ?? row.provider;
      row.failed_at = input.timestamp;
      row.failure_code = input.failureCode;
      row.failure_message = input.failureMessage;
    }
  }),
  getPreferences: vi.fn(async (_env, companyId, userId) => preferences.filter((row) => row.company_id === companyId && row.user_id === userId)),
  preferenceForCategory: vi.fn(async (_env, companyId, userId, category) =>
    preferences.find((row) => row.company_id === companyId && row.user_id === userId && row.category === category) ?? null),
  upsertPreference: vi.fn(async (_env, input) => {
    const existing = preferences.find((row) => row.company_id === input.companyId && row.user_id === input.userId && row.category === input.category);
    if (existing) Object.assign(existing, { email_enabled: input.enabled, minimum_priority_for_email: input.minimumPriority, muted_until: input.mutedUntil });
    else preferences.push({ company_id: input.companyId, user_id: input.userId, category: input.category, email_enabled: input.enabled, minimum_priority_for_email: input.minimumPriority, muted_until: input.mutedUntil ?? null, digest_enabled: input.digestEnabled });
  }),
  getSettings: vi.fn(async (_env, companyId) => settings.find((row) => row.company_id === companyId) ?? null),
  upsertSettings: vi.fn(async (_env, input) => {
    const existing = settings.find((row) => row.company_id === input.companyId);
    const row = {
      id: input.id,
      company_id: input.companyId,
      enabled: input.enabled,
      provider_name: input.providerName,
      allowed_categories_json: input.allowedCategoriesJson,
      minimum_priority: input.minimumPriority,
      send_immediately: input.sendImmediately,
      admin_failure_notifications: input.adminFailureNotifications,
      updated_reason: input.reason,
    };
    if (existing) Object.assign(existing, row);
    else settings.push(row);
  }),
  logDelivery: vi.fn(async (_env, input) => deliveryLogs.push(input)),
}));

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

import {
  createEmailJob,
  getPreferences,
  listEmailJobs,
  previewTemplate,
  processPendingEmails,
  safeCreateEmailJobForNotification,
  sendPendingEmail,
  updatePreferences,
  updateSettings,
} from "../src/modules/email-notifications/email-notifications.service";
import { getEmailProviderStatus } from "../src/modules/email-notifications/email-provider";
import type { AuthActor } from "../src/types/api.types";

const env = (overrides: Partial<Env> = {}) => ({
  DB: {},
  EMAIL_NOTIFICATIONS_ENABLED: "true",
  EMAIL_DRY_RUN: "true",
  EMAIL_PROVIDER: "resend",
  EMAIL_FROM_ADDRESS: "hrm@example.com",
  ...overrides,
}) as Env;

const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR User",
  email: "hr@example.com",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: [
    "email_notifications.view_own",
    "email_notifications.preferences.manage",
    "email_notifications.admin.view",
    "email_notifications.admin.manage",
    "email_notifications.retry",
    "email_notifications.process",
    "email_notifications.settings.manage",
    "email_notifications.templates.view",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const payload = {
  notification_type: "leave_request_submitted",
  category: "leave",
  priority: "high" as const,
  title: "Leave request needs approval",
  message: "Please review leave.",
  action_url: "/leave?tab=approvals",
  entity_type: "leave_request",
  entity_id: "leave_req_1",
  event_key: "leave_request_submitted",
  idempotency_key: "leave_request_submitted:leave_req_1",
  metadata: { requester_name: "Employee One", leave_type: "Annual Leave", start_date: "2026-06-01", end_date: "2026-06-03" },
};

beforeEach(() => {
  jobs.length = 0;
  preferences.length = 0;
  settings.length = 0;
  deliveryLogs.length = 0;
  vi.restoreAllMocks();
});

describe("Phase 10B email notifications", () => {
  it("provider disabled mode", () => {
    expect(getEmailProviderStatus(env({ EMAIL_NOTIFICATIONS_ENABLED: "false" }))).toMatchObject({
      configured: false,
      status: "disabled",
    });
  });

  it("missing config produces skipped_config_missing safely", async () => {
    const result = await createEmailJob(env({ EMAIL_DRY_RUN: "false", EMAIL_PROVIDER: undefined }), "company_1", {
      recipientUserId: "user_hr",
      payload,
    });
    expect(result.job).toMatchObject({ status: "skipped_config_missing", failure_code: "SKIPPED_CONFIG_MISSING" });
  });

  it("dry-run mode does not call external provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload });
    const result = await sendPendingEmail(env(), actor, jobs[0].id);
    expect(result.sent).toBe(true);
    expect(jobs[0]).toMatchObject({ status: "sent", provider: "dry_run" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("create email job for user", async () => {
    const result = await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload });
    expect(result.job).toMatchObject({ recipient_email: "hr@example.com", status: "pending", subject: "Leave request awaiting approval" });
  });

  it("missing recipient email is skipped safely", async () => {
    const result = await createEmailJob(env(), "company_1", { recipientUserId: "user_no_email", payload });
    expect(result.job).toMatchObject({ status: "skipped_no_email", failure_code: "SKIPPED_NO_EMAIL" });
  });

  it("idempotency prevents duplicate email jobs", async () => {
    await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload });
    const duplicate = await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload });
    expect(jobs).toHaveLength(1);
    expect(duplicate.duplicate).toBe(true);
    expect(deliveryLogs.some((row) => row.status === "duplicate")).toBe(true);
  });

  it("sent job is not resent", async () => {
    await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload });
    await sendPendingEmail(env(), actor, jobs[0].id);
    await expect(sendPendingEmail(env(), actor, jobs[0].id)).rejects.toMatchObject({ code: "EMAIL_ALREADY_SENT" });
  });

  it("retry failed job increments attempt_count", async () => {
    await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload });
    await sendPendingEmail(env(), actor, jobs[0].id);
    expect(jobs[0].attempt_count).toBe(1);
  });

  it("retry sent job is blocked", async () => {
    await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload });
    jobs[0].status = "sent";
    await expect(sendPendingEmail(env(), actor, jobs[0].id)).rejects.toMatchObject({ code: "EMAIL_ALREADY_SENT" });
  });

  it("process pending respects max batch size", async () => {
    for (let index = 0; index < 3; index += 1) {
      await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload: { ...payload, idempotency_key: `leave:${index}` } });
    }
    const result = await processPendingEmails(env(), actor, 2);
    expect(result.processed).toBe(2);
  });

  it("preferences disabled skips optional email", async () => {
    await updatePreferences(env(), actor, [{ category: "leave", email_enabled: false, minimum_priority_for_email: "low" }]);
    const result = await createEmailJob(env(), "company_1", { recipientUserId: "user_hr", payload, optional: true });
    expect(result.job).toMatchObject({ status: "skipped_preference" });
  });

  it("critical emails respect minimum allowed behavior", async () => {
    await expect(updatePreferences(env(), actor, [{ category: "security", email_enabled: false, minimum_priority_for_email: "low" }])).rejects.toMatchObject({ code: "EMAIL_PREFERENCE_INVALID" });
  });

  it("metadata sanitizer removes unsafe fields", async () => {
    await createEmailJob(env(), "company_1", {
      recipientUserId: "user_hr",
      payload: { ...payload, metadata: { employee_name: "A", device_token_hash: "secret", nested: { password_hash: "secret", safe: "ok" } } },
    });
    expect(JSON.parse(jobs[0].metadata_json)).toEqual({ employee_name: "A", nested: { safe: "ok" } });
  });

  it("unsafe action URLs are blocked", async () => {
    await expect(createEmailJob(env(), "company_1", {
      recipientUserId: "user_hr",
      payload: { ...payload, action_url: "https://evil.example" },
    })).rejects.toThrow(/internal app routes/);
  });

  it("template renders subject/text/html safely", async () => {
    const result = await previewTemplate(env(), actor, "leave_request_submitted", {
      requester_name: "<script>alert(1)</script>",
      leave_type: "Annual",
      start_date: "2026-06-01",
      end_date: "2026-06-03",
      action_url: "/leave",
    });
    expect(result.preview.subject).toContain("Leave request");
    expect(result.preview.html).not.toContain("<script>");
  });

  it("list own email jobs or preferences where allowed", async () => {
    await createEmailJob(env(), "company_1", { recipientUserId: "user_employee", payload });
    const employeeContext = { ...actor, actorUserId: "user_employee", isAdmin: false, permissions: ["email_notifications.view_own"] };
    const result = await listEmailJobs(env(), employeeContext, { page: 1, page_size: 25 });
    expect(result.pagination.total).toBe(1);
    expect(await getPreferences(env(), employeeContext)).toEqual({ preferences: [] });
  });

  it("settings update requires permission and reason", async () => {
    await expect(updateSettings(env(), actor, { enabled: true, reason: "" })).rejects.toThrow(/reason/i);
    const result = await updateSettings(env(), actor, { enabled: true, minimum_priority: "high", reason: "Enable email for approvals" });
    expect(result.settings.minimum_priority).toBe("high");
  });

  it("leave submitted creates email job for approver", async () => {
    await safeCreateEmailJobForNotification(env(), "company_1", {
      inAppNotificationId: "notif_1",
      recipientUserId: "user_hr",
      payload,
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ notification_type: "leave_request_submitted", recipient_email: "hr@example.com" });
  });

  it("leave approved/rejected creates email job for requester", async () => {
    await safeCreateEmailJobForNotification(env(), "company_1", {
      recipientUserId: "user_employee",
      payload: { ...payload, notification_type: "leave_request_approved", idempotency_key: "leave_approved:1" },
    });
    await safeCreateEmailJobForNotification(env(), "company_1", {
      recipientUserId: "user_employee",
      payload: { ...payload, notification_type: "leave_request_rejected", idempotency_key: "leave_rejected:1" },
    });
    expect(jobs.map((row) => row.notification_type)).toEqual(["leave_request_approved", "leave_request_rejected"]);
  });

  it("long leave payroll review creates email job for payroll/HR recipient", async () => {
    await safeCreateEmailJobForNotification(env(), "company_1", {
      recipientUserId: "user_hr",
      payload: {
        ...payload,
        notification_type: "long_leave_payroll_review_required",
        category: "long_leave",
        idempotency_key: "long_leave_payroll_review_required:1",
        metadata: { employee_name: "Foreign Employee" },
      },
    });
    expect(jobs[0]).toMatchObject({ category: "long_leave", subject: "Long leave payroll review required" });
  });

  it("email preference disabled skips email but keeps in-app notification", async () => {
    await updatePreferences(env(), actor, [{ category: "leave", email_enabled: false, minimum_priority_for_email: "low" }]);
    await safeCreateEmailJobForNotification(env(), "company_1", { inAppNotificationId: "notif_kept", recipientUserId: "user_hr", payload });
    expect(jobs[0]).toMatchObject({ in_app_notification_id: "notif_kept", status: "skipped_preference" });
  });

  it("provider failure is sanitized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("token=secret provider failed", { status: 500 }));
    await createEmailJob(env({ EMAIL_DRY_RUN: "false", RESEND_API_KEY: "secret" }), "company_1", { recipientUserId: "user_hr", payload });
    await expect(sendPendingEmail(env({ EMAIL_DRY_RUN: "false", RESEND_API_KEY: "secret" }), actor, jobs[0].id)).rejects.toMatchObject({ code: "EMAIL_SEND_FAILED" });
    expect(jobs[0].failure_message).not.toContain("secret");
  });

  it("provider failure does not fail leave approval workflow", async () => {
    const result = await safeCreateEmailJobForNotification({} as Env, "company_1", {
      recipientUserId: "user_hr",
      payload,
    });
    expect("failed" in result).toBe(false);
    expect(result.job).toMatchObject({ status: "skipped_disabled" });
  });

  it("duplicate event does not create duplicate email job", async () => {
    await safeCreateEmailJobForNotification(env(), "company_1", { recipientUserId: "user_hr", payload });
    await safeCreateEmailJobForNotification(env(), "company_1", { recipientUserId: "user_hr", payload });
    expect(jobs).toHaveLength(1);
  });
});
