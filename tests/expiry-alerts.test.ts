import { beforeEach, describe, expect, it, vi } from "vitest";

const alerts: any[] = [];
const settingsRows: any[] = [];
const notifications: any[] = [];
const audits: any[] = [];
const sentNotificationKeys = new Set<string>();
let failNotificationRefUpdate = false;

const actorEmployeeLinks = new Map<string, string | null>([
  ["user_employee", "emp_self"],
  ["user_hr", "emp_hr"],
]);

const applyAlertScope = (rows: any[], outletIds: string[], isSuperAdmin: boolean, employeeIdScope?: string | null) => rows.filter((row) => {
  if (employeeIdScope && row.employee_id !== employeeIdScope) return false;
  if (!isSuperAdmin && row.outlet_id && !outletIds.includes(row.outlet_id)) return false;
  return true;
});

vi.mock("../src/modules/expiry-alerts/expiry-alerts.repository", () => ({
  getSettings: vi.fn(async (_env, companyId) => settingsRows.find((row) => row.company_id === companyId) ?? null),
  findUserEmployeeId: vi.fn(async (_env, _companyId, userId) => actorEmployeeLinks.get(userId) ?? null),
  upsertSettings: vi.fn(async (_env, input) => {
    const row = {
      id: input.id,
      company_id: input.companyId,
      enabled: input.enabled,
      warning_days_json: input.warningDaysJson,
      overdue_enabled: input.overdueEnabled,
      repeat_frequency: input.repeatFrequency,
      quiet_days: input.quietDays,
      in_app_enabled: input.inAppEnabled,
      email_enabled: input.emailEnabled,
      minimum_email_severity: input.minimumEmailSeverity,
      notify_roles_json: input.notifyRolesJson,
      notify_permissions_json: input.notifyPermissionsJson,
      notify_employee_self: input.notifyEmployeeSelf,
      fallback_to_admins: input.fallbackToAdmins,
      include_archived_employees: input.includeArchivedEmployees,
      include_inactive_employees: input.includeInactiveEmployees,
      source_toggles_json: input.sourceTogglesJson,
      updated_by: input.updatedBy,
      updated_reason: input.reason,
    };
    const existing = settingsRows.find((item) => item.company_id === input.companyId);
    if (existing) Object.assign(existing, row);
    else settingsRows.push(row);
  }),
  listEmployeeIdentitySources: vi.fn(async () => [{
    employee_id: "emp_1",
    employee_code: "E001",
    employee_name: "Foreign Employee",
    employee_type: "foreign",
    employment_status: "active",
    outlet_id: "outlet_1",
    department_id: "dept_1",
    passport_expiry_date: "2026-06-15",
    work_permit_expiry_date: "2026-07-01",
  }]),
  listDocumentSources: vi.fn(async () => [{
    source_type: "employee_document",
    source_table: "employee_documents",
    source_id: "doc_1",
    source_label: "Work visa",
    expiry_date: "2026-06-10",
    employee_id: "emp_1",
    employee_code: "E001",
    employee_name: "Foreign Employee",
    employee_type: "foreign",
    outlet_id: "outlet_1",
    department_id: "dept_1",
    metadata_json: JSON.stringify({ document_type: "work_visa", device_token_hash: "unsafe" }),
  }]),
  listContractSources: vi.fn(async () => [{
    contract_id: "contract_1",
    contract_number: "C-001",
    contract_type: "fixed_term",
    end_date: "2026-06-20",
    probation_end_date: "2026-06-08",
    employee_id: "emp_1",
    employee_code: "E001",
    employee_name: "Foreign Employee",
    employee_type: "foreign",
    outlet_id: "outlet_1",
    department_id: "dept_1",
  }]),
  listLongLeaveReturnSources: vi.fn(async () => [{
    source_type: "long_leave_return",
    source_table: "long_leave_records",
    source_id: "long_leave_1",
    source_label: "Long leave expected return",
    expiry_date: "2026-06-07",
    employee_id: "emp_1",
    employee_code: "E001",
    employee_name: "Foreign Employee",
    employee_type: "foreign",
    outlet_id: "outlet_1",
    department_id: "dept_1",
  }]),
  getAlertByIdempotency: vi.fn(async (_env, companyId, key) => alerts.find((row) => row.company_id === companyId && row.idempotency_key === key) ?? null),
  insertAlert: vi.fn(async (_env, input) => alerts.push({
    ...input,
    status: "open",
    notification_id: null,
    email_notification_id: null,
    acknowledged_by: null,
    acknowledged_at: null,
    resolved_by: null,
    resolved_at: null,
    dismissed_by: null,
    dismissed_at: null,
    snoozed_until: null,
    resolution_note: null,
    last_notified_at: null,
  })),
  refreshAlert: vi.fn(async (_env, input) => {
    const row = alerts.find((item) => item.company_id === input.company_id && item.id === input.id);
    if (row && !["resolved", "dismissed"].includes(row.status)) Object.assign(row, {
      days_until_expiry: input.days_until_expiry,
      alert_type: input.alert_type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      last_detected_at: input.last_detected_at,
      updated_at: input.updated_at,
    });
  }),
  getAlertById: vi.fn(async (_env, companyId, id) => alerts.find((row) => row.company_id === companyId && row.id === id) ?? null),
  countAlerts: vi.fn(async (_env, companyId, _filters, outletIds, isSuperAdmin, employeeIdScope) =>
    applyAlertScope(alerts.filter((row) => row.company_id === companyId), outletIds, isSuperAdmin, employeeIdScope).length),
  listAlerts: vi.fn(async (_env, companyId, _filters, outletIds, isSuperAdmin, employeeIdScope) =>
    applyAlertScope(alerts.filter((row) => row.company_id === companyId), outletIds, isSuperAdmin, employeeIdScope)),
  updateAlertStatus: vi.fn(async (_env, input) => {
    const row = alerts.find((item) => item.company_id === input.companyId && item.id === input.id);
    if (row) {
      row.status = input.status;
      row.resolution_note = input.reason ?? row.resolution_note;
      row.snoozed_until = input.snoozedUntil ?? row.snoozed_until;
    }
  }),
  updateAlertNotificationRefs: vi.fn(async (_env, input) => {
    if (failNotificationRefUpdate) throw new Error("reference update failed");
    const row = alerts.find((item) => item.company_id === input.companyId && item.id === input.id);
    if (row) {
      row.notification_id = row.notification_id ?? input.notificationId ?? null;
      row.email_notification_id = row.email_notification_id ?? input.emailNotificationId ?? null;
      row.last_notified_at = input.lastNotifiedAt ?? row.last_notified_at;
      row.next_notification_at = input.nextNotificationAt ?? null;
    }
  }),
  summary: vi.fn(async (_env, companyId, outletIds, isSuperAdmin, employeeIdScope) => {
    const scoped = applyAlertScope(alerts.filter((row) => row.company_id === companyId), outletIds, isSuperAdmin, employeeIdScope);
    return {
      active_count: scoped.filter((row) => !["resolved", "dismissed"].includes(row.status)).length,
      open_count: scoped.filter((row) => row.status === "open").length,
      critical_count: scoped.filter((row) => row.severity === "critical" && !["resolved", "dismissed"].includes(row.status)).length,
      high_count: scoped.filter((row) => row.severity === "high" && !["resolved", "dismissed"].includes(row.status)).length,
      warning_count: scoped.filter((row) => row.severity === "warning" && !["resolved", "dismissed"].includes(row.status)).length,
      overdue_count: scoped.filter((row) => row.alert_type === "overdue" && !["resolved", "dismissed"].includes(row.status)).length,
      due_today_count: scoped.filter((row) => row.alert_type === "due_today" && !["resolved", "dismissed"].includes(row.status)).length,
      due_7_days_count: scoped.filter((row) => row.days_until_expiry >= 0 && row.days_until_expiry <= 7 && !["resolved", "dismissed"].includes(row.status)).length,
      due_30_days_count: scoped.filter((row) => row.days_until_expiry >= 0 && row.days_until_expiry <= 30 && !["resolved", "dismissed"].includes(row.status)).length,
    };
  }),
  sourceSummary: vi.fn(async (_env, companyId, outletIds, isSuperAdmin, employeeIdScope) => {
    const scoped = applyAlertScope(alerts.filter((row) => row.company_id === companyId && !["resolved", "dismissed"].includes(row.status)), outletIds, isSuperAdmin, employeeIdScope);
    const counts = new Map<string, number>();
    scoped.forEach((row) => counts.set(row.source_type, (counts.get(row.source_type) ?? 0) + 1));
    return [...counts.entries()].map(([source_type, total]) => ({ source_type, total }));
  }),
}));

vi.mock("../src/modules/notifications/notifications.service", () => ({
  safeNotifyResolvedRecipients: vi.fn(async (_env, _companyId, resolve, payload) => {
    if (sentNotificationKeys.has(payload.idempotency_key)) {
      return { created_count: 0, duplicate_count: 1, notifications: [{ id: "notif_existing", email_notification_id: "email_existing" }] };
    }
    sentNotificationKeys.add(payload.idempotency_key);
    notifications.push({ resolve, payload });
    return { created_count: 1, notifications: [{ id: "notif_1", email_notification_id: "email_1" }] };
  }),
}));

vi.mock("../src/services/audit.service", () => ({
  createAuditLog: vi.fn(async (_env, input) => {
    audits.push(input);
    return { created: true };
  }),
}));

import {
  buildExpiryAlertCandidate,
  classifyExpirySeverity,
  collectExpiryCandidates,
  dismissAlert,
  getAlert,
  getSummary,
  listAlerts,
  nextNotificationAt,
  notificationWindowKey,
  notifyForAlert,
  previewScan,
  resolveAlert,
  runScan,
  shouldNotify,
  snoozeAlert,
  updateSettings,
} from "../src/modules/expiry-alerts/expiry-alerts.service";
import type { AuthActor } from "../src/types/api.types";

const env = { DB: {} } as Env;
const actor: AuthActor = {
  companyId: "company_1",
  actorUserId: "user_hr",
  fullName: "HR User",
  email: "hr@example.test",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: [
    "expiry_alerts.view",
    "expiry_alerts.scan",
    "expiry_alerts.manage",
    "expiry_alerts.resolve",
    "expiry_alerts.dismiss",
    "expiry_alerts.settings.manage",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: true,
  ipAddress: null,
  userAgent: null,
};

const selfActor: AuthActor = {
  ...actor,
  actorUserId: "user_employee",
  fullName: "Self Service User",
  email: "employee@example.test",
  roles: ["Employee"],
  roleKeys: ["employee"],
  permissions: ["expiry_alerts.view_own", "expiry_alerts.acknowledge"],
  isAdmin: false,
};

beforeEach(() => {
  alerts.length = 0;
  settingsRows.length = 0;
  notifications.length = 0;
  audits.length = 0;
  sentNotificationKeys.clear();
  failNotificationRefUpdate = false;
});

describe("Phase 10C expiry alerts", () => {
  it("classifies overdue, due today, high, warning, and info severities", () => {
    expect(classifyExpirySeverity(-1, [90, 30, 7])).toEqual({ alert_type: "overdue", severity: "critical" });
    expect(classifyExpirySeverity(0, [90, 30, 7])).toEqual({ alert_type: "due_today", severity: "critical" });
    expect(classifyExpirySeverity(6, [90, 30, 7])).toEqual({ alert_type: "upcoming_expiry", severity: "high" });
    expect(classifyExpirySeverity(20, [90, 30, 7])).toEqual({ alert_type: "upcoming_expiry", severity: "warning" });
    expect(classifyExpirySeverity(60, [90, 30, 7])).toEqual({ alert_type: "upcoming_expiry", severity: "info" });
  });

  it("builds safe deterministic candidates without unsafe metadata", () => {
    const candidate = buildExpiryAlertCandidate("company_1", {
      source_type: "employee_document",
      source_table: "employee_documents",
      source_id: "doc_1",
      source_label: "Passport",
      expiry_date: "2026-06-10",
      employee_id: "emp_1",
      employee_name: "Employee One",
      outlet_id: "outlet_1",
      metadata: { token: "unsafe", document_type: "passport" },
    }, "2026-06-08", [30, 7, 1]);
    expect(candidate).toMatchObject({
      days_until_expiry: 2,
      severity: "high",
      idempotency_key: "expiry:company_1:employee_document:doc_1:2026-06-10",
    });
    expect(candidate?.metadata).toEqual(expect.objectContaining({ document_type: "passport" }));
    expect(candidate?.metadata).not.toHaveProperty("token");
  });

  it("preview scan does not write alerts or notifications", async () => {
    const result = await previewScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(result.preview).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(alerts).toHaveLength(0);
    expect(notifications).toHaveLength(0);
  });

  it("collects employee document, passport, work permit, contract, probation, and long leave return sources", async () => {
    const result = await collectExpiryCandidates(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(new Set(result.candidates.map((row) => row.source_type))).toEqual(new Set([
      "employee_passport",
      "employee_work_permit",
      "employee_document",
      "contract",
      "probation",
      "long_leave_return",
    ]));
  });

  it("run scan creates alert records, audit log, and in-app/email bridge notifications", async () => {
    const result = await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(result.created).toBe(6);
    expect(alerts).toHaveLength(6);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0].payload).toMatchObject({ notification_type: "expiry_alert", event_key: "expiry_alert_detected" });
    expect(audits.some((row) => row.action === "expiry_alert_scan_run")).toBe(true);
  });

  it("scan idempotency prevents duplicate alert records on rerun", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(alerts).toHaveLength(6);
  });

  it("daily repeat creates one notification per day, not multiple in same day", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    notifications.length = 0;
    sentNotificationKeys.clear();
    const settings = { ...defaultSettingsForTest(), repeat_frequency: "daily" as const };
    await notifyForAlert(env, actor, alert, settings, "2026-06-08T10:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-06-08T18:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-06-09T09:00:00.000Z");
    expect(notifications).toHaveLength(2);
    expect(notifications[0].payload.idempotency_key).toContain(":2026-06-08");
    expect(notifications[1].payload.idempotency_key).toContain(":2026-06-09");
  });

  it("weekly repeat creates one notification per week", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    notifications.length = 0;
    sentNotificationKeys.clear();
    const settings = { ...defaultSettingsForTest(), repeat_frequency: "weekly" as const };
    await notifyForAlert(env, actor, alert, settings, "2026-06-08T10:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-06-10T10:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-06-15T10:00:00.000Z");
    expect(notifications).toHaveLength(2);
    expect(notifications[0].payload.idempotency_key).toContain(":2026-06-08");
    expect(notifications[1].payload.idempotency_key).toContain(":2026-06-15");
  });

  it("monthly repeat creates one notification per month", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    notifications.length = 0;
    sentNotificationKeys.clear();
    const settings = { ...defaultSettingsForTest(), repeat_frequency: "monthly" as const };
    await notifyForAlert(env, actor, alert, settings, "2026-06-08T10:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-06-30T10:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-07-01T10:00:00.000Z");
    expect(notifications).toHaveLength(2);
    expect(notifications[0].payload.idempotency_key).toContain(":2026-06");
    expect(notifications[1].payload.idempotency_key).toContain(":2026-07");
  });

  it("repeat_frequency = once creates only one notification ever for the same alert/window", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    notifications.length = 0;
    sentNotificationKeys.clear();
    const settings = { ...defaultSettingsForTest(), repeat_frequency: "none" as const };
    await notifyForAlert(env, actor, alert, settings, "2026-06-08T10:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-07-08T10:00:00.000Z");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].payload.idempotency_key).toContain(":once");
    expect(notificationWindowKey(settings, "2026-07-08T10:00:00.000Z")).toBe("once");
  });

  it("next_notification_at and last_notified_at are updated after successful notification", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    notifications.length = 0;
    sentNotificationKeys.clear();
    const settings = { ...defaultSettingsForTest(), repeat_frequency: "daily" as const };
    await notifyForAlert(env, actor, alert, settings, "2026-06-08T10:00:00.000Z");
    expect(alert.last_notified_at).toBe("2026-06-08T10:00:00.000Z");
    expect(alert.next_notification_at).toBe(nextNotificationAt("2026-06-08T10:00:00.000Z", settings));
  });

  it("notification idempotency key includes a repeat window", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    notifications.length = 0;
    sentNotificationKeys.clear();
    await notifyForAlert(env, actor, alerts[0], { ...defaultSettingsForTest(), repeat_frequency: "daily" }, "2026-06-08T10:00:00.000Z");
    expect(notifications[0].payload.idempotency_key).toMatch(/expiry-alert-notify:.+:high:.+:2026-06-08/);
  });

  it("snoozed alert with future snoozed_until does not notify on rerun", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    alert.status = "snoozed";
    alert.snoozed_until = "2026-06-30";
    alert.next_notification_at = "2026-06-09T00:00:00.000Z";
    notifications.length = 0;
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(notifications.find((row) => row.payload.entity_id === alert.id)).toBeUndefined();
    expect(shouldNotify(alert, { ...defaultSettingsForTest(), in_app_enabled: true }, "2026-06-08T10:00:00.000Z")).toBe(false);
  });

  it("snoozed alert after snoozed_until notifies when next_notification_at is due while resolved or dismissed alerts do not notify", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    alert.status = "snoozed";
    alert.snoozed_until = "2026-06-07";
    alert.next_notification_at = "2026-06-08T00:00:00.000Z";
    expect(shouldNotify(alert, defaultSettingsForTest(), "2026-06-08T10:00:00.000Z")).toBe(true);
    alert.status = "resolved";
    expect(shouldNotify(alert, defaultSettingsForTest(), "2026-06-08T10:00:00.000Z")).toBe(false);
    alert.status = "dismissed";
    expect(shouldNotify(alert, defaultSettingsForTest(), "2026-06-08T10:00:00.000Z")).toBe(false);
  });

  it("snoozed alert after snoozed_until does not notify if next_notification_at is still in the future", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    alert.status = "snoozed";
    alert.snoozed_until = "2026-06-07";
    alert.next_notification_at = "2026-06-09T00:00:00.000Z";
    expect(shouldNotify(alert, defaultSettingsForTest(), "2026-06-08T10:00:00.000Z")).toBe(false);
  });

  it("duplicate scan in same repeat window does not duplicate in-app or email notifications", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const firstCount = notifications.length;
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(notifications).toHaveLength(firstCount);
    expect(alerts.every((alert) => alert.last_notified_at)).toBe(true);
  });

  it("new repeat window can create a new in-app notification/email job", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alert = alerts[0];
    notifications.length = 0;
    sentNotificationKeys.clear();
    const settings = { ...defaultSettingsForTest(), repeat_frequency: "weekly" as const };
    await notifyForAlert(env, actor, alert, settings, "2026-06-08T10:00:00.000Z");
    await notifyForAlert(env, actor, alert, settings, "2026-06-15T10:00:00.000Z");
    expect(notifications.map((row) => row.payload.metadata.notification_window_key)).toEqual(["2026-06-08", "2026-06-15"]);
  });

  it("snooze validates future snoozed_until and requires reason", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const snoozeActor = { ...actor, permissions: [...actor.permissions, "expiry_alerts.snooze"] };
    await expect(snoozeAlert(env, snoozeActor, alerts[0].id, { snoozed_until: "2026-06-30" })).rejects.toMatchObject({ code: "EXPIRY_ALERT_REASON_REQUIRED" });
    await expect(snoozeAlert(env, snoozeActor, alerts[0].id, { reason: "Waiting for renewal", snoozed_until: "not-a-date" })).rejects.toMatchObject({ code: "EXPIRY_ALERT_SNOOZE_INVALID" });
    await expect(snoozeAlert(env, snoozeActor, alerts[0].id, { reason: "Waiting for renewal", snoozed_until: "2020-01-01" })).rejects.toMatchObject({ code: "EXPIRY_ALERT_SNOOZE_INVALID" });
    await snoozeAlert(env, snoozeActor, alerts[0].id, { reason: "Waiting for renewal", snoozed_until: "2999-01-01" });
    expect(alerts[0]).toMatchObject({ status: "snoozed", snoozed_until: "2999-01-01" });
  });

  it("employee with view_own sees only own alert and cannot see another employee alert in same outlet", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    alerts[0].employee_id = "emp_self";
    const list = await listAlerts(env, selfActor, { page: 1, page_size: 25 });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]?.employee_id).toBe("emp_self");
    await expect(getAlert(env, selfActor, alerts[1].id)).rejects.toMatchObject({ code: "EXPIRY_ALERT_PERMISSION_DENIED" });
  });

  it("employee with view_own can acknowledge own alert but cannot resolve or dismiss other employee alert", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    alerts[0].employee_id = "emp_self";
    const { acknowledgeAlert } = await import("../src/modules/expiry-alerts/expiry-alerts.service");
    await acknowledgeAlert(env, selfActor, alerts[0].id, {});
    expect(alerts[0].status).toBe("acknowledged");
    await expect(resolveAlert(env, selfActor, alerts[1].id, { reason: "No access" })).rejects.toMatchObject({ code: "EXPIRY_ALERT_PERMISSION_DENIED" });
    await expect(dismissAlert(env, selfActor, alerts[1].id, { reason: "No access" })).rejects.toMatchObject({ code: "EXPIRY_ALERT_PERMISSION_DENIED" });
  });

  it("HR user with expiry_alerts.view can see scoped outlet alerts while outlet-scoped manager cannot see other outlet alerts", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    alerts[0].outlet_id = "outlet_2";
    const hrList = await listAlerts(env, actor, { page: 1, page_size: 25 });
    expect(hrList.rows.every((row: any) => row.outlet_id !== "outlet_2")).toBe(true);
    const broadHr = { ...actor, isSuperAdmin: true };
    const broadList = await listAlerts(env, broadHr, { page: 1, page_size: 25 });
    expect(broadList.rows.some((row: any) => row.outlet_id === "outlet_2")).toBe(true);
  });

  it("run scan stores notification_id and email_notification_id when notification is created", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(alerts[0].notification_id).toBe("notif_1");
    expect(alerts[0].email_notification_id).toBe("email_1");
  });

  it("failed notification reference update does not fail alert creation and writes warning audit", async () => {
    failNotificationRefUpdate = true;
    const result = await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    expect(result.created).toBe(6);
    expect(audits.some((row) => row.action === "expiry_alert_notification_link_failed")).toBe(true);
  });

  it("settings update requires permission and reason and stores source toggles", async () => {
    const result = await updateSettings(env, actor, {
      enabled: true,
      warning_days: [60, 30, 7],
      source_toggles: { contracts: false, assets: false, uniforms: false },
      reason: "Tune alert windows",
    });
    expect(result.settings.warning_days).toEqual([60, 30, 7]);
    expect(result.settings.source_toggles.contracts).toBe(false);
    expect(audits.some((row) => row.action === "expiry_alert_settings_updated")).toBe(true);
    await expect(updateSettings(env, { ...actor, permissions: [] }, { reason: "Nope" })).rejects.toMatchObject({ code: "EXPIRY_ALERT_PERMISSION_DENIED" });
    await expect(updateSettings(env, actor, { reason: "" })).rejects.toMatchObject({ code: "EXPIRY_ALERT_REASON_REQUIRED" });
  });

  it("resolve and dismiss require reason and update lifecycle safely", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const alertId = alerts[0].id;
    await expect(resolveAlert(env, actor, alertId, {})).rejects.toMatchObject({ code: "EXPIRY_ALERT_REASON_REQUIRED" });
    await resolveAlert(env, actor, alertId, { reason: "Renewed document uploaded" });
    expect(alerts[0]).toMatchObject({ status: "resolved", resolution_note: "Renewed document uploaded" });
    await dismissAlert(env, actor, alerts[1].id, { reason: "Not applicable" });
    expect(alerts[1]).toMatchObject({ status: "dismissed", resolution_note: "Not applicable" });
  });

  it("summary counts active, high, warning, due windows, source type, critical, overdue, and due-today alerts", async () => {
    await runScan(env, actor, { as_of_date: "2026-06-08", warning_days: [30, 7, 1] });
    const result = await getSummary(env, actor);
    const summary = result.summary as any;
    expect(summary.active_count).toBe(6);
    expect(summary.critical_count).toBeGreaterThanOrEqual(2);
    expect(summary.high_count).toBeGreaterThan(0);
    expect(summary.warning_count).toBeGreaterThan(0);
    expect(summary.overdue_count).toBe(1);
    expect(summary.due_today_count).toBe(1);
    expect(summary.due_7_days_count).toBeGreaterThanOrEqual(3);
    expect(summary.due_30_days_count).toBe(5);
    expect(summary.by_source_type.employee_document).toBe(1);
  });

  it("expiry alert permissions, routes, UI, and email-disable bridge exist", async () => {
    const moduleName = "node:fs/promises";
    const fs = await import(moduleName) as { readFile: (path: string, encoding: string) => Promise<string> };
    const [permissions, routes, app, page, nav, notificationService] = await Promise.all([
      fs.readFile("seeds/permissions.seed.sql", "utf8"),
      fs.readFile("src/routes/expiry-alerts.routes.ts", "utf8"),
      fs.readFile("src/app.ts", "utf8"),
      fs.readFile("frontend/src/features/expiry-alerts/ExpiryAlertsPage.tsx", "utf8"),
      fs.readFile("frontend/src/lib/navigation.ts", "utf8"),
      fs.readFile("src/modules/notifications/notifications.service.ts", "utf8"),
    ]);
    for (const permission of ["expiry_alerts.view", "expiry_alerts.scan", "expiry_alerts.manage", "expiry_alerts.resolve", "expiry_alerts.settings.manage"]) {
      expect(permissions).toContain(permission);
    }
    for (const route of ["/scan/preview", "/scan/run", "/settings", "/:id/resolve", "/:id/snooze"]) {
      expect(routes).toContain(route);
    }
    expect(app).toContain("/expiry-alerts");
    expect(page).toContain("Run scan");
    expect(page).toContain("Settings");
    expect(page).toContain("No due-date field exists yet.");
    expect(nav).toContain("Expiry Alerts");
    expect(notificationService).toContain("metadata?.email_disabled !== true");
  });
});

const defaultSettingsForTest = () => ({
  enabled: true,
  warning_days: [90, 60, 30, 14, 7, 1],
  overdue_enabled: true,
  repeat_frequency: "weekly" as const,
  quiet_days: 7,
  in_app_enabled: true,
  email_enabled: true,
  minimum_email_severity: "high" as const,
  notify_roles: ["hr_admin"],
  notify_permissions: ["expiry_alerts.manage"],
  notify_employee_self: false,
  fallback_to_admins: true,
  include_archived_employees: false,
  include_inactive_employees: false,
  source_toggles: {},
});
