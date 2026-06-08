import { beforeEach, describe, expect, it, vi } from "vitest";

const notifications: any[] = [];
const preferences: any[] = [];
const deliveryLogs: any[] = [];
const activeUsers = [
  { id: "user_hr", employee_id: "emp_hr", role_key: "hr_admin", permission_key: "leave.approvals.approve" },
  { id: "user_payroll", employee_id: "emp_payroll", role_key: "accountant", permission_key: "long_leave.payroll_apply" },
  { id: "user_bio", employee_id: "emp_bio", role_key: "hr_admin", permission_key: "biometric.resolve_punches" },
  { id: "user_employee", employee_id: "emp_1", role_key: "employee", permission_key: "notifications.view" },
  { id: "user_inactive", employee_id: "emp_inactive", role_key: "hr_admin", permission_key: "leave.approvals.approve", inactive: true },
];

vi.mock("../src/modules/notifications/notifications.repository", () => ({
  findNotificationByIdempotencyKey: vi.fn(async (_env, companyId, key) =>
    notifications.find((row) => row.company_id === companyId && row.idempotency_key === key) ?? null),
  createNotification: vi.fn(async (_env, input) => {
    notifications.push({
      id: input.id,
      company_id: input.companyId,
      user_id: input.recipientUserId,
      recipient_user_id: input.recipientUserId,
      recipient_employee_id: input.recipient_employee_id ?? null,
      recipient_role_key: input.recipient_role_key ?? null,
      recipient_permission_key: input.recipient_permission_key ?? null,
      outlet_id: input.outlet_id ?? null,
      department_id: input.department_id ?? null,
      notification_type: input.notification_type,
      category: input.category,
      priority: input.priority ?? "normal",
      title: input.title,
      message: input.message ?? null,
      action_url: input.action_url ?? null,
      action_label: input.action_label ?? null,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      event_key: input.event_key ?? null,
      idempotency_key: input.idempotency_key ?? null,
      status: "unread",
      is_read: 0,
      read_at: null,
      archived_at: null,
      dismissed_at: null,
      created_by: input.createdBy ?? null,
      created_at: input.createdAt,
      expires_at: input.expires_at ?? null,
      metadata_json: input.metadataJson ?? null,
      updated_at: input.createdAt,
    });
  }),
  listNotifications: vi.fn(async (_env, companyId, userId) => notifications.filter((row) => row.company_id === companyId && row.recipient_user_id === userId)),
  countNotifications: vi.fn(async (_env, companyId, userId) => notifications.filter((row) => row.company_id === companyId && row.recipient_user_id === userId).length),
  getNotificationForUser: vi.fn(async (_env, companyId, userId, id) =>
    notifications.find((row) => row.company_id === companyId && row.recipient_user_id === userId && row.id === id) ?? null),
  updateNotificationStatus: vi.fn(async (_env, companyId, userId, id, status, timestamp) => {
    const row = notifications.find((item) => item.company_id === companyId && item.recipient_user_id === userId && item.id === id);
    if (row) {
      row.status = status;
      row.is_read = status === "read" ? 1 : 0;
      if (status === "read") row.read_at = timestamp;
      if (status === "unread") row.read_at = null;
      if (status === "archived") row.archived_at = timestamp;
      if (status === "dismissed") row.dismissed_at = timestamp;
    }
  }),
  markAllRead: vi.fn(async (_env, companyId, userId) => {
    notifications.filter((row) => row.company_id === companyId && row.recipient_user_id === userId && row.status === "unread").forEach((row) => {
      row.status = "read";
      row.is_read = 1;
    });
  }),
  unreadCount: vi.fn(async (_env, companyId, userId) => ({
    unread_count: notifications.filter((row) => row.company_id === companyId && row.recipient_user_id === userId && row.status === "unread").length,
    urgent_count: notifications.filter((row) => row.company_id === companyId && row.recipient_user_id === userId && row.status === "unread" && row.priority === "urgent").length,
  })),
  getPreferences: vi.fn(async (_env, companyId, userId) => preferences.filter((row) => row.company_id === companyId && row.user_id === userId)),
  upsertPreference: vi.fn(async (_env, input) => {
    const existing = preferences.find((row) => row.company_id === input.companyId && row.user_id === input.userId && row.category === input.category);
    if (existing) Object.assign(existing, { enabled: input.enabled, minimum_priority: input.minimumPriority, muted_until: input.mutedUntil });
    else preferences.push({ id: input.id, company_id: input.companyId, user_id: input.userId, category: input.category, enabled: input.enabled, minimum_priority: input.minimumPriority, muted_until: input.mutedUntil ?? null });
  }),
  preferenceForCategory: vi.fn(async (_env, companyId, userId, category) =>
    preferences.find((row) => row.company_id === companyId && row.user_id === userId && row.category === category) ?? null),
  logDelivery: vi.fn(async (_env, input) => deliveryLogs.push(input)),
  findActiveUsersByIds: vi.fn(async (_env, _companyId, ids) =>
    activeUsers.filter((row) => ids.includes(row.id) && !row.inactive).map((row) => ({ id: row.id, employee_id: row.employee_id }))),
  findActiveUsersByEmployeeIds: vi.fn(async (_env, _companyId, employeeIds) =>
    activeUsers.filter((row) => employeeIds.includes(row.employee_id) && !row.inactive).map((row) => ({ id: row.id, employee_id: row.employee_id }))),
  findActiveUsersByRoleKeys: vi.fn(async (_env, _companyId, roleKeys) =>
    activeUsers.filter((row) => roleKeys.includes(row.role_key) && !row.inactive).map((row) => ({ id: row.id, employee_id: row.employee_id, role_key: row.role_key }))),
  findActiveUsersByPermissionKeys: vi.fn(async (_env, _companyId, permissionKeys) =>
    activeUsers.filter((row) => permissionKeys.includes(row.permission_key) && !row.inactive).map((row) => ({ id: row.id, employee_id: row.employee_id, permission_key: row.permission_key }))),
}));

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async () => ({ created: true })),
}));

import {
  archive,
  createNotificationsForUsers,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  markUnread,
  notifyResolvedRecipients,
  resolveRecipients,
  sanitizeActionUrl,
  sanitizeNotificationMetadata,
  updatePreferences,
} from "../src/modules/notifications/notifications.service";
import type { AuthActor } from "../src/types/api.types";

const env = { DB: {} } as Env;
const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR User",
  email: "hr@example.com",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: ["notifications.view", "notifications.manage_own", "notifications.mark_read", "notifications.archive", "notifications.preferences.manage"],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
};

beforeEach(() => {
  notifications.length = 0;
  preferences.length = 0;
  deliveryLogs.length = 0;
});

describe("Phase 10A in-app notifications", () => {
  it("create notification for one user", async () => {
    const result = await createNotificationsForUsers(env, "company_1", ["user_employee"], {
      notification_type: "system_notice",
      category: "system",
      title: "Welcome",
      message: "Hello",
      idempotency_key: "system:welcome",
    });
    expect(result.created_count).toBe(1);
    expect(notifications[0]).toMatchObject({ recipient_user_id: "user_employee", status: "unread", title: "Welcome" });
  });

  it("create notifications for multiple users", async () => {
    const result = await createNotificationsForUsers(env, "company_1", ["user_employee", "user_hr"], {
      notification_type: "system_notice",
      category: "system",
      title: "Policy updated",
    });
    expect(result.created_count).toBe(2);
    expect(new Set(notifications.map((row) => row.recipient_user_id))).toEqual(new Set(["user_employee", "user_hr"]));
  });

  it("idempotency prevents duplicate notifications", async () => {
    const payload = { notification_type: "leave_request_submitted", category: "leave", title: "Review leave", idempotency_key: "leave:1" };
    await createNotificationsForUsers(env, "company_1", ["user_hr"], payload);
    await createNotificationsForUsers(env, "company_1", ["user_hr"], payload);
    expect(notifications).toHaveLength(1);
    expect(deliveryLogs.some((row) => row.status === "duplicate")).toBe(true);
  });

  it("metadata sanitizer removes unsafe fields", () => {
    const sanitized = sanitizeNotificationMetadata({
      employee_id: "emp_1",
      device_token_hash: "secret",
      nested: { password_hash: "secret", safe: "yes" },
      raw_payload_json: "{unsafe}",
    });
    expect(sanitized).toEqual({ employee_id: "emp_1", nested: { safe: "yes" } });
  });

  it("action_url rejects unsafe external URLs", () => {
    expect(() => sanitizeActionUrl("https://example.com/phish")).toThrow(/internal app routes/);
    expect(sanitizeActionUrl("/leave")).toBe("/leave");
  });

  it("inactive users are not notified and actor is excluded where required", async () => {
    const recipients = await resolveRecipients(env, "company_1", {
      roleKeys: ["hr_admin"],
      excludeUserId: "user_hr",
    });
    expect(recipients.map((row) => row.user_id)).toEqual(["user_bio"]);
    expect(recipients.some((row) => row.user_id === "user_inactive")).toBe(false);
  });

  it("role-based recipient resolution", async () => {
    const recipients = await resolveRecipients(env, "company_1", { roleKeys: ["accountant"] });
    expect(recipients).toEqual([expect.objectContaining({ user_id: "user_payroll", role_key: "accountant" })]);
  });

  it("permission-based recipient resolution", async () => {
    const recipients = await resolveRecipients(env, "company_1", { permissionKeys: ["biometric.resolve_punches"] });
    expect(recipients).toEqual([expect.objectContaining({ user_id: "user_bio", permission_key: "biometric.resolve_punches" })]);
  });

  it("outlet-scoped recipient resolution de-duplicates recipients", async () => {
    const recipients = await resolveRecipients(env, "company_1", {
      roleKeys: ["hr_admin"],
      permissionKeys: ["leave.approvals.approve"],
      outletId: "outlet_1",
    });
    expect(recipients.filter((row) => row.user_id === "user_hr")).toHaveLength(1);
  });

  it("list own notifications, unread count, mark read, mark unread, archive, and mark all read", async () => {
    await createNotificationsForUsers(env, "company_1", ["user_hr"], { notification_type: "n1", category: "system", title: "One", priority: "urgent" });
    await createNotificationsForUsers(env, "company_1", ["user_hr"], { notification_type: "n2", category: "system", title: "Two" });
    expect((await listNotifications(env, actor, { page: 1, page_size: 25 })).pagination.total).toBe(2);
    expect(await getUnreadCount(env, actor)).toEqual({ unread_count: 2, urgent_count: 1 });
    await markRead(env, actor, notifications[0].id);
    expect(notifications[0].status).toBe("read");
    await markUnread(env, actor, notifications[0].id);
    expect(notifications[0].status).toBe("unread");
    await archive(env, actor, notifications[0].id);
    expect(notifications[0].status).toBe("archived");
    await markAllRead(env, actor, { page: 1, page_size: 25 });
    expect(notifications[1].status).toBe("read");
  });

  it("preferences get/update and skipped optional delivery", async () => {
    await updatePreferences(env, actor, [{ category: "leave", enabled: false, minimum_priority: "low" }]);
    await createNotificationsForUsers(env, "company_1", ["user_hr"], {
      notification_type: "leave_request_submitted",
      category: "leave",
      title: "Leave",
    }, { optional: true });
    expect(notifications).toHaveLength(0);
    expect(deliveryLogs.some((row) => row.status === "skipped_preference")).toBe(true);
  });

  it("user cannot mutate another user’s notification", async () => {
    await createNotificationsForUsers(env, "company_1", ["user_employee"], { notification_type: "n1", category: "system", title: "Private" });
    await expect(markRead(env, actor, notifications[0].id)).rejects.toThrow(/could not be found/i);
  });

  it("leave submitted creates approval notification", async () => {
    await notifyResolvedRecipients(env, "company_1", {
      permissionKeys: ["leave.approvals.approve"],
      fallbackToAdmins: true,
    }, {
      notification_type: "leave_request_submitted",
      category: "leave",
      title: "Leave request needs approval",
      entity_type: "leave_request",
      entity_id: "leave_req_1",
      idempotency_key: "leave_request_submitted:leave_req_1",
      action_url: "/leave?tab=approvals",
    }, { actorId: "user_employee", excludeActor: true });
    expect(notifications.some((row) => row.notification_type === "leave_request_submitted")).toBe(true);
  });

  it("leave approved/rejected creates notification", async () => {
    await createNotificationsForUsers(env, "company_1", ["user_employee"], {
      notification_type: "leave_request_approved",
      category: "leave",
      title: "Leave approved",
      entity_type: "leave_request",
      entity_id: "leave_req_2",
      idempotency_key: "leave_request_approved:leave_req_2",
    });
    await createNotificationsForUsers(env, "company_1", ["user_employee"], {
      notification_type: "leave_request_rejected",
      category: "leave",
      title: "Leave rejected",
      entity_type: "leave_request",
      entity_id: "leave_req_3",
      idempotency_key: "leave_request_rejected:leave_req_3",
    });
    expect(notifications.map((row) => row.notification_type)).toEqual(["leave_request_approved", "leave_request_rejected"]);
  });

  it("long leave payroll review creates notification", async () => {
    await notifyResolvedRecipients(env, "company_1", {
      permissionKeys: ["long_leave.payroll_apply"],
      roleKeys: ["accountant"],
      fallbackToAdmins: true,
    }, {
      notification_type: "long_leave_payroll_review_required",
      category: "long_leave",
      title: "Long leave payroll review required",
      entity_type: "long_leave_record",
      entity_id: "long_leave_1",
      idempotency_key: "long_leave_payroll_review_required:long_leave_1",
      action_url: "/long-leave",
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].recipient_user_id).toBe("user_payroll");
  });

  it("biometric unmatched punch creates notification", async () => {
    await notifyResolvedRecipients(env, "company_1", {
      permissionKeys: ["biometric.resolve_punches"],
      roleKeys: ["hr_admin"],
    }, {
      notification_type: "biometric_unmatched_punch_review",
      category: "biometric",
      title: "Unmatched biometric punch needs review",
      entity_type: "biometric_attendance_log",
      entity_id: "bio_log_1",
      idempotency_key: "biometric_unmatched_punch_review:bio_log_1",
      action_url: "/biometric?tab=unmatched",
      metadata: { biometric_user_id: "42", raw_payload_json: "{unsafe}" },
    });
    expect(notifications.length).toBeGreaterThan(0);
    expect(JSON.parse(notifications[0].metadata_json)).toEqual({ biometric_user_id: "42" });
  });

  it("holiday roster conflict creates notification if hook implemented", async () => {
    await notifyResolvedRecipients(env, "company_1", {
      permissionKeys: ["roster.resolve_conflicts"],
      roleKeys: ["hr_admin"],
    }, {
      notification_type: "holiday_roster_conflict_review",
      category: "holiday",
      title: "Holiday roster conflict needs review",
      entity_type: "roster_conflict",
      entity_id: "conflict_1",
      idempotency_key: "holiday_roster_conflict_review:conflict_1",
      action_url: "/rosters?tab=conflicts",
    });
    expect(notifications.some((row) => row.category === "holiday")).toBe(true);
  });
});
