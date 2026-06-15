import * as permissionService from "../../services/permission.service";
import { resolveModuleFeatureAliases } from "../../config/module-codes";
import type { AuthActor } from "../../types/api.types";
import * as repository from "./dashboard.repository";
import type { DashboardAttentionItem, DashboardMeta, DashboardQueryContext, DashboardQuickAction } from "./dashboard.types";

const DAY_MS = 86_400_000;

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const n = (value: unknown) => Number(value ?? 0);

const makeContext = (actor: AuthActor): DashboardQueryContext => {
  const todayDate = new Date();
  return {
    actor,
    today: dateOnly(todayDate),
    weekEnd: dateOnly(addDays(todayDate, 7)),
    monthEnd: dateOnly(addDays(todayDate, 30)),
    generatedAt: new Date().toISOString(),
  };
};

const meta = (ctx: DashboardQueryContext): DashboardMeta => ({
  scope: ctx.actor.isSuperAdmin || ctx.actor.isAdmin ? "company" : "outlet",
  outlet_ids: ctx.actor.isSuperAdmin || ctx.actor.isAdmin ? [] : ctx.actor.outletIds,
  today: ctx.today,
  generated_at: ctx.generatedAt,
});

const can = (actor: AuthActor, permissions: string[]) =>
  permissionService.hasAnyPermission(actor, permissions);
const moduleEnabled = (features: Set<string>, moduleCode: string) =>
  resolveModuleFeatureAliases(moduleCode).some((feature) => features.has(feature));

const emptyExpiryCounts = () => ({
  critical: 0,
  due_today: 0,
  due_within_7_days: 0,
  due_within_30_days: 0,
  overdue: 0,
  passport: 0,
  work_permit: 0,
  contract: 0,
  probation: 0,
  document: 0,
});

export const getEmployeeSummary = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["dashboard.view", "dashboard.view_company", "dashboard.view_outlet"])) return null;
  const [summary, byOutlet, byDepartment, expiry] = await Promise.all([
    repository.countEmployees(env, ctx.actor),
    repository.employeesByOutlet(env, ctx.actor),
    repository.employeesByDepartment(env, ctx.actor),
    can(ctx.actor, ["dashboard.expiry_alerts.view", "expiry_alerts.view"])
      ? repository.expiryCounts(env, ctx.actor, ctx.today)
      : Promise.resolve(null),
  ]);
  return {
    total_active_employees: n(summary?.total_active),
    local_employees: n(summary?.local_employees),
    foreign_employees: n(summary?.foreign_employees),
    employees_on_probation: n(summary?.probation),
    employees_on_leave: n(summary?.on_leave),
    employees_on_long_leave: n(summary?.on_long_leave),
    employees_with_critical_expiry_alerts: n(expiry?.critical),
    by_outlet: byOutlet,
    by_department: byDepartment,
  };
};

export const getAttendanceToday = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["dashboard.attendance.view", "attendance.view", "attendance.reports.view"])) return null;
  const [attendance, exceptions] = await Promise.all([
    repository.attendanceToday(env, ctx.actor, ctx.today),
    repository.attendanceExceptionCount(env, ctx.actor),
  ]);
  return {
    present_today: n(attendance?.present_today),
    absent_today: n(attendance?.absent_today),
    late_checkins_today: n(attendance?.late_checkins),
    missing_checkin_count: n(attendance?.missing_checkin),
    missing_checkout_count: n(attendance?.missing_checkout),
    overtime_today: n(attendance?.overtime_today),
    holiday_work_today: n(attendance?.holiday_work_today),
    attendance_exceptions_open: n(exceptions?.total),
    href: "/attendance/reports",
  };
};

export const getApprovals = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["dashboard.leave.view", "leave.view", "leave.approvals.view"])) return null;
  const weekStart = dateOnly(addDays(new Date(`${ctx.today}T00:00:00Z`), -7));
  const [leave, inbox, balances] = await Promise.all([
    repository.leaveApprovalCounts(env, ctx.actor, ctx.today, weekStart),
    repository.approvalInboxCount(env, ctx.actor),
    repository.leaveBalanceWarnings(env, ctx.actor),
  ]);
  return {
    pending_leave_approvals: n(leave?.pending_leave_approvals),
    approval_inbox_count: n(inbox?.total),
    leave_requests_submitted_today: n(leave?.submitted_today),
    leave_requests_submitted_this_week: n(leave?.submitted_this_week),
    rejected_cancelled_leave_summary: n(leave?.rejected_cancelled),
    low_leave_balance_warnings: n(balances?.low_leave_balance_warnings),
    negative_balance_warnings: n(balances?.negative_balance_warnings),
    href: "/leave",
  };
};

export const getLongLeave = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["dashboard.long_leave.view", "long_leave.view"])) return null;
  const [counts, impacts] = await Promise.all([
    repository.longLeaveCounts(env, ctx.actor, ctx.today, ctx.weekEnd, ctx.monthEnd),
    repository.longLeavePayrollImpactsPending(env, ctx.actor),
  ]);
  return {
    employees_currently_on_long_leave: n(counts?.active),
    long_leave_pending_approval: n(counts?.pending_approval),
    expected_returns_this_week: n(counts?.returns_this_week),
    expected_returns_this_month: n(counts?.returns_this_month),
    overdue_returns: n(counts?.overdue_returns),
    payroll_review_required: n(counts?.payroll_review_required),
    long_leave_payroll_impacts_pending_review: n(impacts?.total),
    href: "/long-leave",
  };
};

export const getExpiryAlerts = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["dashboard.expiry_alerts.view", "expiry_alerts.view", "expiry_alerts.view_own"])) return null;
  const hasScopedExpiryAccess = can(ctx.actor, ["dashboard.expiry_alerts.view", "expiry_alerts.view"]);
  const linkedEmployeeId = hasScopedExpiryAccess
    ? null
    : await repository.findActorLinkedEmployeeId(env, ctx.actor.companyId, ctx.actor.actorUserId);
  const counts = hasScopedExpiryAccess
    ? await repository.expiryCounts(env, ctx.actor, ctx.today)
    : linkedEmployeeId
      ? await repository.expiryCounts(env, ctx.actor, ctx.today, { employeeId: linkedEmployeeId })
      : emptyExpiryCounts();
  return {
    critical_alerts: n(counts?.critical),
    due_today: n(counts?.due_today),
    due_within_7_days: n(counts?.due_within_7_days),
    due_within_30_days: n(counts?.due_within_30_days),
    overdue_expired: n(counts?.overdue),
    passport_alerts: n(counts?.passport),
    visa_work_permit_alerts: n(counts?.work_permit),
    contract_probation_document_alerts: n(counts?.contract) + n(counts?.probation) + n(counts?.document),
    href: "/expiry-alerts",
  };
};

export const getNotificationHealth = async (env: Env, ctx: DashboardQueryContext) => {
  const notifications = can(ctx.actor, ["notifications.view", "notifications.manage_own"])
    ? await repository.notificationCounts(env, ctx.actor)
    : null;
  const email = can(ctx.actor, ["dashboard.admin_health.view", "email_notifications.admin.view"])
    ? await repository.emailHealth(env, ctx.actor)
    : null;
  return {
    unread_in_app_notifications: n(notifications?.unread),
    urgent_notifications: n(notifications?.urgent),
    pending_email_jobs: email ? n(email.pending_email_jobs) : null,
    failed_email_jobs: email ? n(email.failed_email_jobs) : null,
    href: "/notifications",
  };
};

export const getDeviceHealth = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["dashboard.device_health.view", "biometric.view", "devices.view_health", "sync.view_device_health"])) return null;
  const [devices, punches] = await Promise.all([
    repository.deviceHealth(env, ctx.actor),
    repository.biometricIssueCounts(env, ctx.actor),
  ]);
  return {
    active_devices: n(devices?.active_devices),
    offline_devices: n(devices?.offline_devices),
    suspended_revoked_devices: n(devices?.suspended_revoked_devices),
    unmatched_biometric_punches: n(punches?.unmatched_punches),
    ambiguous_biometric_punches: n(punches?.ambiguous_punches),
    invalid_timestamp_punches: n(punches?.invalid_timestamp_punches),
    href: "/biometric",
  };
};

export const getHolidayRoster = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["holidays.calendar.view", "holidays.view", "roster.view", "rosters.view"])) return null;
  const result = await repository.holidayRosterContext(env, ctx.actor, ctx.today, ctx.weekEnd);
  return {
    todays_holidays: result.holidays.filter((holiday) => String(holiday.date).slice(0, 10) === ctx.today),
    upcoming_holidays: result.holidays,
    holiday_roster_warnings: n(result.conflicts.holiday_roster_warnings),
    open_roster_conflicts: n(result.conflicts.open_roster_conflicts),
    unpublished_roster_warnings: 0,
    href: "/holidays",
  };
};

export const getPayrollReadiness = async (env: Env, ctx: DashboardQueryContext) => {
  if (!can(ctx.actor, ["dashboard.payroll_readiness.view", "payroll.view", "long_leave.payroll_preview"])) return null;
  return {
    ...(await repository.payrollReadiness(env, ctx.actor)),
    href: "/payroll",
  };
};

export const getSummary = async (env: Env, actor: AuthActor) => {
  const ctx = makeContext(actor);
  const features = new Set(await repository.listEnabledFeatureKeys(env, actor.companyId));
  const [
    employee_summary,
    attendance_today,
    leave_approvals,
    long_leave,
    expiry_alerts,
    notifications_email_health,
    device_health,
    holiday_roster_context,
    payroll_readiness,
  ] = await Promise.all([
    moduleEnabled(features, "employees") ? getEmployeeSummary(env, ctx) : Promise.resolve(null),
    moduleEnabled(features, "attendance") ? getAttendanceToday(env, ctx) : Promise.resolve(null),
    moduleEnabled(features, "leave") ? getApprovals(env, ctx) : Promise.resolve(null),
    moduleEnabled(features, "leave") ? getLongLeave(env, ctx) : Promise.resolve(null),
    getExpiryAlerts(env, ctx),
    getNotificationHealth(env, ctx),
    moduleEnabled(features, "biometric") || moduleEnabled(features, "kiosk") ? getDeviceHealth(env, ctx) : Promise.resolve(null),
    moduleEnabled(features, "roster") ? getHolidayRoster(env, ctx) : Promise.resolve(null),
    moduleEnabled(features, "payroll") ? getPayrollReadiness(env, ctx) : Promise.resolve(null),
  ]);

  return {
    data: {
      employee_summary,
      attendance_today,
      leave_approvals,
      long_leave,
      expiry_alerts,
      notifications_email_health,
      device_health,
      holiday_roster_context,
      payroll_readiness,
    },
    meta: meta(ctx),
  };
};

export const getAttention = async (env: Env, actor: AuthActor) => {
  const summary = await getSummary(env, actor);
  const data = summary.data;
  const rows = [
    { id: "attendance-missing", area: "Attendance", title: "Missing punches before payroll", count: n(data.attendance_today?.missing_checkin_count) + n(data.attendance_today?.missing_checkout_count), priority: "high", href: "/attendance/reports" },
    { id: "leave-approvals", area: "Leave", title: "Leave approvals waiting", count: n(data.leave_approvals?.pending_leave_approvals), priority: "normal", href: "/leave" },
    { id: "long-leave-payroll", area: "Long Leave", title: "Long leave payroll review required", count: n(data.long_leave?.payroll_review_required), priority: "high", href: "/long-leave" },
    { id: "expiry-critical", area: "Expiry Alerts", title: "Critical expiry alerts", count: n(data.expiry_alerts?.critical_alerts), priority: "urgent", href: "/expiry-alerts" },
    { id: "device-review", area: "Biometric", title: "Biometric punches needing review", count: n(data.device_health?.unmatched_biometric_punches) + n(data.device_health?.ambiguous_biometric_punches), priority: "normal", href: "/biometric" },
  ] satisfies DashboardAttentionItem[];
  const visibleRows = rows.filter((row) => row.count > 0);

  return { data: visibleRows, meta: summary.meta };
};

export const getQuickActionsForEnabledModules = async (env: Env, actor: AuthActor) => {
  const features = new Set(await repository.listEnabledFeatureKeys(env, actor.companyId));
  const actions: Array<DashboardQuickAction & { moduleCode?: string }> = [
    { key: "add-employee", label: "Add employee", description: "Create a new employee profile", href: "/employees", permission: "employees.create", category: "Employees", moduleCode: "employees" },
    { key: "create-leave", label: "Create leave request", description: "Submit employee leave", href: "/leave", permission: "leave.create", category: "Leave", moduleCode: "leave" },
    { key: "approval-inbox", label: "Open approval inbox", description: "Review pending approvals", href: "/leave", permission: "leave.approvals.view", category: "Approvals", moduleCode: "leave" },
    { key: "expiry-scan", label: "Run expiry scan", description: "Refresh document and contract alerts", href: "/expiry-alerts", permission: "expiry_alerts.scan", category: "Alerts" },
    { key: "attendance-exceptions", label: "Review attendance exceptions", description: "Open missing punch and exception queues", href: "/attendance/reports", permission: "attendance.reports.view", category: "Attendance", moduleCode: "attendance" },
    { key: "biometric-review", label: "Review biometric punches", description: "Resolve unmatched or ambiguous punches", href: "/biometric", permission: "biometric.resolve_punches", category: "Biometric", moduleCode: "biometric" },
    { key: "long-leave-payroll", label: "Preview long leave payroll", description: "Review long leave salary impact", href: "/long-leave", permission: "long_leave.payroll_preview", category: "Payroll" },
    { key: "holiday-calendar", label: "Open holiday calendar", description: "Check upcoming holidays", href: "/holidays", permission: "holidays.calendar.view", category: "Holidays" },
    { key: "employee-360", label: "Open Employee 360 search", description: "Find an employee profile", href: "/employees", permission: "employees.view", category: "Employees", moduleCode: "employees" },
  ];
  const filtered = actions
    .filter((action) => !action.moduleCode || moduleEnabled(features, action.moduleCode))
    .filter((action) => permissionService.hasPermission(actor, action.permission));
  return {
    data: filtered,
    meta: {
      scope: actor.isSuperAdmin || actor.isAdmin ? "company" : "outlet",
      outlet_ids: actor.isSuperAdmin || actor.isAdmin ? [] : actor.outletIds,
      today: dateOnly(new Date()),
      generated_at: new Date().toISOString(),
    },
  };
};

export const getQuickActions = (actor: AuthActor) => {
  const actions: DashboardQuickAction[] = [
    { key: "add-employee", label: "Add employee", description: "Create a new employee profile", href: "/employees", permission: "employees.create", category: "Employees" },
    { key: "create-leave", label: "Create leave request", description: "Submit employee leave", href: "/leave", permission: "leave.create", category: "Leave" },
    { key: "approval-inbox", label: "Open approval inbox", description: "Review pending approvals", href: "/leave", permission: "leave.approvals.view", category: "Approvals" },
    { key: "expiry-scan", label: "Run expiry scan", description: "Refresh document and contract alerts", href: "/expiry-alerts", permission: "expiry_alerts.scan", category: "Alerts" },
    { key: "attendance-exceptions", label: "Review attendance exceptions", description: "Open missing punch and exception queues", href: "/attendance/reports", permission: "attendance.reports.view", category: "Attendance" },
    { key: "biometric-review", label: "Review biometric punches", description: "Resolve unmatched or ambiguous punches", href: "/biometric", permission: "biometric.resolve_punches", category: "Biometric" },
    { key: "long-leave-payroll", label: "Preview long leave payroll", description: "Review long leave salary impact", href: "/long-leave", permission: "long_leave.payroll_preview", category: "Payroll" },
    { key: "holiday-calendar", label: "Open holiday calendar", description: "Check upcoming holidays", href: "/holidays", permission: "holidays.calendar.view", category: "Holidays" },
    { key: "employee-360", label: "Open Employee 360 search", description: "Find an employee profile", href: "/employees", permission: "employees.view", category: "Employees" },
  ];
  const filtered = actions.filter((action) => permissionService.hasPermission(actor, action.permission));
  return {
    data: filtered,
    meta: {
      scope: actor.isSuperAdmin || actor.isAdmin ? "company" : "outlet",
      outlet_ids: actor.isSuperAdmin || actor.isAdmin ? [] : actor.outletIds,
      today: dateOnly(new Date()),
      generated_at: new Date().toISOString(),
    },
  };
};

export const getSection = async (env: Env, actor: AuthActor, section: string) => {
  const ctx = makeContext(actor);
  const sectionMeta = meta(ctx);
  if (section === "attendance") return { data: await getAttendanceToday(env, ctx), meta: sectionMeta };
  if (section === "approvals") return { data: await getApprovals(env, ctx), meta: sectionMeta };
  if (section === "expiry-alerts") return { data: await getExpiryAlerts(env, ctx), meta: sectionMeta };
  if (section === "device-health") return { data: await getDeviceHealth(env, ctx), meta: sectionMeta };
  if (section === "payroll-readiness") return { data: await getPayrollReadiness(env, ctx), meta: sectionMeta };
  return { data: null, meta: sectionMeta };
};
