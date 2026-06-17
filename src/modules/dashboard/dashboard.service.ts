import * as permissionService from "../../services/permission.service";
import { resolveModuleFeatureAliases } from "../../config/module-codes";
import type { AuthActor } from "../../types/api.types";
import * as repository from "./dashboard.repository";
import type {
  CommandCenterResponse,
  CommandCenterWidgetState,
  DashboardAttentionItem,
  DashboardMeta,
  DashboardQueryContext,
  DashboardQuickAction,
} from "./dashboard.types";

const DAY_MS = 86_400_000;

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const monthStart = (date: Date) => `${date.toISOString().slice(0, 7)}-01`;
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
    moduleEnabled(features, "long_leave_management") ? getLongLeave(env, ctx) : Promise.resolve(null),
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
    { key: "long-leave-payroll", label: "Preview long leave payroll", description: "Review long leave salary impact", href: "/long-leave", permission: "long_leave.payroll_preview", category: "Payroll", moduleCode: "long_leave_management" },
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

const widget = <T>(
  title: string,
  enabled: boolean,
  visible: boolean,
  options: Omit<CommandCenterWidgetState<T>, "title" | "enabled" | "visible"> = {},
): CommandCenterWidgetState<T> => ({
  title,
  enabled,
  visible: enabled && visible,
  ...options,
});

const safeCommandCenterQuery = async <T>(
  label: string,
  fallback: T,
  query: () => Promise<T>,
  warnings: string[],
): Promise<T> => {
  try {
    return await query();
  } catch (error) {
    warnings.push(`${label} is temporarily unavailable.`);
    console.warn("Command center widget query failed", {
      widget: label,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
};

const moduleAction = (
  key: string,
  label: string,
  description: string,
  href: string,
  permission: string,
  category: string,
): DashboardQuickAction => ({ key, label, description, href, permission, category });

const visibleActions = (actor: AuthActor, features: Set<string>, actions: Array<DashboardQuickAction & { moduleCode?: string }>) =>
  actions
    .filter((action) => !action.moduleCode || moduleEnabled(features, action.moduleCode))
    .filter((action) => permissionService.hasPermission(actor, action.permission));

const countApprovalRow = (
  id: string,
  moduleName: string,
  count: number,
  href: string,
  enabled: boolean,
  visible: boolean,
) =>
  enabled && visible
    ? {
        id,
        moduleName,
        count,
        oldestPendingAge: count > 0 ? "Review queue" : null,
        priority: count > 10 ? "high" : count > 0 ? "normal" : "clear",
        href,
      }
    : null;

export const getCommandCenter = async (env: Env, actor: AuthActor): Promise<{ data: CommandCenterResponse; meta: DashboardMeta }> => {
  const ctx = makeContext(actor);
  const commandCenterWarnings: string[] = [];
  const features = new Set(await repository.listEnabledFeatureKeys(env, actor.companyId));
  const summary = await safeCommandCenterQuery(
    "dashboard summary",
    {
      data: {
        employee_summary: null,
        attendance_today: null,
        leave_approvals: null,
        long_leave: null,
        expiry_alerts: null,
        notifications_email_health: {
          unread_in_app_notifications: 0,
          urgent_notifications: 0,
          pending_email_jobs: null,
          failed_email_jobs: null,
          href: "/notifications",
        },
        device_health: null,
        holiday_roster_context: null,
        payroll_readiness: null,
      },
      meta: meta(ctx),
    },
    () => getSummary(env, actor),
    commandCenterWarnings,
  );
  const data = summary.data;
  const attention = await safeCommandCenterQuery(
    "employee attention",
    { data: [] as DashboardAttentionItem[], meta: meta(ctx) },
    () => getAttention(env, actor),
    commandCenterWarnings,
  );
  const quickActions = visibleActions(actor, features, [
    { ...moduleAction("add-employee", "Add employee", "Create a new employee profile", "/employees", "employees.create", "Employees"), moduleCode: "employees" },
    { ...moduleAction("view-attendance", "View attendance", "Open today's attendance and exceptions", "/attendance", "attendance.view", "Attendance"), moduleCode: "attendance" },
    { ...moduleAction("pending-approvals", "Pending approvals", "Open approval command queue", "/approvals", "approvals.view", "Approvals"), moduleCode: "approvals" },
    { ...moduleAction("payroll-review", "Payroll review", "Review payroll readiness and blockers", "/payroll", "payroll.view", "Payroll"), moduleCode: "payroll" },
    { ...moduleAction("document-expiry", "Document expiry", "Review document and KYC attention", "/documents", "documents.view", "Documents"), moduleCode: "documents_kyc" },
    { ...moduleAction("operation-ownership", "Operation Ownership setup", "Resolve ownership setup warnings", "/organization/operation-ownership", "operationOwnership.view", "Operation Ownership"), moduleCode: "operation_ownership" },
  ]);

  const employeesEnabled = moduleEnabled(features, "employees");
  const attendanceEnabled = moduleEnabled(features, "attendance");
  const leaveEnabled = moduleEnabled(features, "leave");
  const approvalsEnabled = moduleEnabled(features, "approvals");
  const payrollEnabled = moduleEnabled(features, "payroll");
  const documentsEnabled = moduleEnabled(features, "documents_kyc");
  const rosterEnabled = moduleEnabled(features, "roster");
  const lifecycleEnabled = moduleEnabled(features, "resignation_offboarding");
  const disciplineEnabled = moduleEnabled(features, "disciplinary_actions");
  const operationOwnershipEnabled = moduleEnabled(features, "operation_ownership");

  const canViewEmployees = can(actor, ["employees.view", "dashboard.view", "dashboard.view_company", "dashboard.view_outlet"]);
  const canViewAttendance = can(actor, ["attendance.view", "attendance.reports.view", "dashboard.attendance.view"]);
  const canViewApprovals = can(actor, ["approvals.view", "approvals.requests.view", "approvals.department.view", "dashboard.view"]);
  const canViewPayroll = can(actor, ["payroll.view", "dashboard.payroll_readiness.view"]);
  const canViewDocuments = can(actor, ["documents.view", "documentKyc.requests.view", "expiry_alerts.view", "dashboard.expiry_alerts.view"]);
  const canViewRoster = can(actor, ["rosters.view", "roster.view"]);
  const canViewLifecycle = can(actor, ["employeeLifecycle.exitRequests.viewAll", "employeeLifecycle.offboarding.view", "employeeLifecycle.resignations.view"]);
  const canViewDiscipline = can(actor, ["employeeDiscipline.actions.view", "employeeDiscipline.records.viewAll", "employeeDiscipline.tasks.view"]);
  const canViewOperationOwnership = can(actor, ["operationOwnership.view", "operationOwnership.matrix.view", "settings.view"]);
  const canViewAudit = can(actor, ["audit_logs.view", "reports.view", "dashboard.view"]);

  const approvalOperationTypes = [
    "LEAVE_REQUEST",
    "ATTENDANCE_CORRECTION",
    "ROSTER_CHANGE",
    "PAYROLL_ADJUSTMENT",
    "ADVANCE_SALARY_REQUEST",
    "DOCUMENT_KYC_UPDATE",
    "EMPLOYEE_TRANSFER",
    "EMPLOYEE_STRUCTURE_CHANGE",
    "RESIGNATION",
    "OFFBOARDING",
    "DISCIPLINARY_ACTION",
  ];
  const [
    employeeSetup,
    leaveToday,
    pendingCorrections,
    approvalCounts,
    documentKyc,
    expiry60,
    rosterCoverage,
    lifecycleCounts,
    disciplinaryCounts,
    operationHealth,
    recentActivity,
  ] = await Promise.all([
    employeesEnabled && canViewEmployees ? safeCommandCenterQuery("people snapshot", null, () => repository.employeeSetupHealth(env, actor, monthStart(new Date(`${ctx.today}T00:00:00Z`))), commandCenterWarnings) : Promise.resolve(null),
    attendanceEnabled && leaveEnabled && canViewAttendance ? safeCommandCenterQuery("leave overlay", null, () => repository.leaveTodayCounts(env, actor, ctx.today), commandCenterWarnings) : Promise.resolve(null),
    attendanceEnabled && canViewAttendance ? safeCommandCenterQuery("attendance corrections", null, () => repository.pendingAttendanceCorrectionCount(env, actor), commandCenterWarnings) : Promise.resolve(null),
    approvalsEnabled && canViewApprovals ? safeCommandCenterQuery("approval queue", [] as Awaited<ReturnType<typeof repository.approvalQueueCounts>>, () => repository.approvalQueueCounts(env, actor, approvalOperationTypes), commandCenterWarnings) : Promise.resolve([]),
    documentsEnabled && canViewDocuments ? safeCommandCenterQuery("document KYC", null, () => repository.documentKycCounts(env, actor), commandCenterWarnings) : Promise.resolve(null),
    documentsEnabled && canViewDocuments ? safeCommandCenterQuery("document expiry 60 days", null, () => repository.expiryCountsWithinDays(env, actor, ctx.today, 60), commandCenterWarnings) : Promise.resolve(null),
    rosterEnabled && canViewRoster ? safeCommandCenterQuery("roster coverage", null, () => repository.rosterCoverage(env, actor, ctx.today), commandCenterWarnings) : Promise.resolve(null),
    lifecycleEnabled && canViewLifecycle ? safeCommandCenterQuery("lifecycle", null, () => repository.lifecycleCounts(env, actor, ctx.today), commandCenterWarnings) : Promise.resolve(null),
    disciplineEnabled && canViewDiscipline ? safeCommandCenterQuery("disciplinary follow-up", null, () => repository.disciplinaryCounts(env, actor), commandCenterWarnings) : Promise.resolve(null),
    operationOwnershipEnabled && canViewOperationOwnership ? safeCommandCenterQuery("operation ownership health", null, () => repository.operationOwnershipHealth(env, actor), commandCenterWarnings) : Promise.resolve(null),
    canViewAudit ? safeCommandCenterQuery("recent activity", [] as Awaited<ReturnType<typeof repository.recentAuditActivity>>, () => repository.recentAuditActivity(env, actor), commandCenterWarnings) : Promise.resolve([]),
  ]);

  const approvalCountByOperation = new Map(approvalCounts.map((row) => [String(row.operation_type), n(row.total)]));
  const approvalCount = (operationType: string) => approvalCountByOperation.get(operationType) ?? 0;

  const pendingApprovals = Array.from(approvalCountByOperation.values()).reduce((total, count) => total + count, 0);
  const payrollBlockers =
    n(data.payroll_readiness?.attendance_exceptions) +
    n(data.payroll_readiness?.missing_punches) +
    n(data.payroll_readiness?.long_leave_payroll_review) +
    n(data.payroll_readiness?.pending_salary_changes) +
    n(data.payroll_readiness?.approved_advances_deductions) +
    n(data.payroll_readiness?.pending_leave_adjustments) +
    n(data.payroll_readiness?.approved_leave_not_finalized);
  const payrollStatus = !payrollEnabled || !canViewPayroll ? null : payrollBlockers > 0 ? "Needs Review" : "Ready";
  const operationWarnings = [
    n(operationHealth?.operations_missing_owner) > 0 ? `${n(operationHealth?.operations_missing_owner)} operations need owner setup.` : null,
    n(operationHealth?.operations_missing_final_approver) > 0 ? `${n(operationHealth?.operations_missing_final_approver)} operations need final approver setup.` : null,
    n(operationHealth?.operations_missing_executor) > 0 ? `${n(operationHealth?.operations_missing_executor)} operations need executor setup.` : null,
    n(operationHealth?.operations_using_super_admin_fallback) > 0 ? `${n(operationHealth?.operations_using_super_admin_fallback)} responsibilities use Super Admin fallback.` : null,
    n(operationHealth?.operations_blocked_by_fallback) > 0 ? `${n(operationHealth?.operations_blocked_by_fallback)} responsibilities block operations by fallback.` : null,
  ].filter((warning): warning is string => Boolean(warning) && operationOwnershipEnabled && canViewOperationOwnership);

  const approvalRows = [
    countApprovalRow("leave", "Leave approvals", approvalCount("LEAVE_REQUEST"), "/leave", leaveEnabled, canViewApprovals),
    countApprovalRow("attendance-correction", "Attendance correction approvals", approvalCount("ATTENDANCE_CORRECTION"), "/attendance/corrections", attendanceEnabled, canViewApprovals),
    countApprovalRow("roster-change", "Roster change approvals", approvalCount("ROSTER_CHANGE"), "/rosters", rosterEnabled, canViewApprovals),
    countApprovalRow("payroll-adjustment", "Payroll adjustment approvals", approvalCount("PAYROLL_ADJUSTMENT"), "/payroll", payrollEnabled, canViewApprovals && canViewPayroll),
    countApprovalRow("advance-salary", "Advance salary approvals", approvalCount("ADVANCE_SALARY_REQUEST"), "/advances", moduleEnabled(features, "advance_salary"), canViewApprovals),
    countApprovalRow("document-kyc", "Document/KYC approvals", approvalCount("DOCUMENT_KYC_UPDATE"), "/documents", documentsEnabled, canViewApprovals && canViewDocuments),
    countApprovalRow("employee-structure", "Employee transfer/structure approvals", approvalCount("EMPLOYEE_TRANSFER") + approvalCount("EMPLOYEE_STRUCTURE_CHANGE"), "/organization/structure-change-requests", moduleEnabled(features, "employee_structure_changes"), canViewApprovals && canViewEmployees),
    countApprovalRow("offboarding", "Resignation/offboarding approvals", approvalCount("RESIGNATION") + approvalCount("OFFBOARDING"), "/offboarding", lifecycleEnabled, canViewApprovals && canViewLifecycle),
    countApprovalRow("discipline", "Disciplinary approvals", approvalCount("DISCIPLINARY_ACTION"), "/disciplinary-actions", disciplineEnabled, canViewApprovals && canViewDiscipline),
  ].filter((row): row is NonNullable<typeof row> => Boolean(row));

  const response: CommandCenterResponse = {
    header: {
      greeting_name: actor.fullName || "there",
      today: ctx.today,
      company_name: null,
      outlet_name: actor.outletIds.length === 1 ? actor.outletIds[0] : null,
      summary: {
        present_today: n(data.attendance_today?.present_today),
        absent_today: n(data.attendance_today?.absent_today),
        pending_approvals: pendingApprovals,
        payroll_status: payrollStatus,
      },
      quick_actions: quickActions,
    },
    widgets: {
      people_snapshot: widget("People Snapshot", employeesEnabled, canViewEmployees, {
        description: "Employee population and setup health.",
        metrics: {
          total_active_employees: n(data.employee_summary?.total_active_employees),
          new_hires_this_month: n(employeeSetup?.new_hires_this_month),
          employees_without_login: n(employeeSetup?.employees_without_login),
          employees_without_structure: n(employeeSetup?.employees_without_structure),
          employees_missing_level: n(employeeSetup?.employees_missing_level),
          employees_in_notice_period: lifecycleEnabled ? n(lifecycleCounts?.employees_in_notice_period) : 0,
        },
        actions: visibleActions(actor, features, [
          { ...moduleAction("view-employees", "View employees", "Open employee directory", "/employees", "employees.view", "Employees"), moduleCode: "employees" },
          { ...moduleAction("assign-login", "Assign login", "Open login assignment tools", "/employees", "employees.login.view", "Employees"), moduleCode: "employees" },
        ]),
        status: employeeSetup ? "ready" : commandCenterWarnings.some((warning) => warning.includes("people snapshot")) ? "empty" : "ready",
        error: commandCenterWarnings.some((warning) => warning.includes("people snapshot")) ? "unavailable" : undefined,
      }),
      attendance_pulse: widget("Attendance Pulse", attendanceEnabled, canViewAttendance, {
        description: "Today’s attendance status.",
        metrics: {
          present: n(data.attendance_today?.present_today),
          late: n(data.attendance_today?.late_checkins_today),
          absent: n(data.attendance_today?.absent_today),
          on_leave: leaveEnabled ? n(leaveToday?.on_leave) : 0,
          sick: leaveEnabled ? n(leaveToday?.sick) : 0,
          missing_punch: n(data.attendance_today?.missing_checkin_count) + n(data.attendance_today?.missing_checkout_count),
          pending_corrections: n(pendingCorrections?.total),
        },
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-attendance", "View attendance", "Open attendance module", "/attendance", "attendance.view", "Attendance"), moduleCode: "attendance" },
          { ...moduleAction("open-corrections", "View corrections", "Open correction queue", "/attendance/corrections", "attendance.view", "Attendance"), moduleCode: "attendance" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("attendance")) ? "empty" : n(data.attendance_today?.attendance_exceptions_open) > 0 ? "needs_review" : "ready",
        error: commandCenterWarnings.some((warning) => warning.includes("attendance")) ? "unavailable" : undefined,
      }),
      approval_queue: widget("Approval Command Queue", approvalsEnabled, canViewApprovals, {
        description: "Pending approval queues by module.",
        rows: approvalRows,
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-approvals", "Open approvals", "Open approval inbox", "/approvals", "approvals.view", "Approvals"), moduleCode: "approvals" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("approval queue")) ? "empty" : approvalRows.some((row) => row.count > 0) ? "needs_review" : "empty",
        error: commandCenterWarnings.some((warning) => warning.includes("approval queue")) ? "unavailable" : undefined,
      }),
      payroll_readiness: widget("Payroll Readiness", payrollEnabled, canViewPayroll, {
        description: "Pre-payroll blockers and setup checks.",
        metrics: {
          current_payroll_period: data.payroll_readiness?.current_payroll_period ?? null,
          pay_date: data.payroll_readiness?.pay_date ?? null,
          pending_attendance_corrections: n(data.payroll_readiness?.attendance_exceptions),
          missing_punches: n(data.payroll_readiness?.missing_punches),
          approved_advances_deductions: n(data.payroll_readiness?.approved_advances_deductions),
          pending_payroll_adjustments: n(data.payroll_readiness?.pending_salary_changes),
          payslip_generation_status: data.payroll_readiness?.payslip_generation_status ?? null,
          payroll_locked_or_finalized: Boolean(data.payroll_readiness?.payroll_locked_or_finalized),
        },
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-payroll", "Open payroll", "Review payroll", "/payroll", "payroll.view", "Payroll"), moduleCode: "payroll" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("dashboard summary")) ? "empty" : payrollBlockers > 0 ? "needs_review" : "ready",
        error: commandCenterWarnings.some((warning) => warning.includes("dashboard summary")) ? "unavailable" : undefined,
      }),
      document_expiry: widget("Document Expiry / KYC Attention", documentsEnabled, canViewDocuments, {
        description: "Document expiry and KYC attention counts.",
        metrics: {
          expiring_30_days: n(data.expiry_alerts?.due_within_30_days),
          expiring_60_days: n(expiry60?.total),
          missing_critical_documents: n(data.expiry_alerts?.critical_alerts),
          pending_kyc_updates: n(documentKyc?.pending_kyc_updates),
          pending_document_approvals: n(documentKyc?.pending_document_approvals),
        },
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-documents", "Open documents", "Review documents", "/documents", "documents.view", "Documents"), moduleCode: "documents_kyc" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("document")) ? "empty" : n(data.expiry_alerts?.critical_alerts) > 0 ? "needs_review" : "ready",
        error: commandCenterWarnings.some((warning) => warning.includes("document")) ? "unavailable" : undefined,
      }),
      roster_coverage: widget("Roster Coverage", rosterEnabled, canViewRoster, {
        description: "Roster coverage and conflicts.",
        metrics: {
          scheduled_today: n(rosterCoverage?.scheduled_today),
          open_shifts: n(rosterCoverage?.open_shifts),
          employees_on_leave_today: leaveEnabled ? n(rosterCoverage?.employees_on_leave_today) : 0,
          roster_conflicts: n(rosterCoverage?.roster_conflicts),
          unassigned_employees: n(rosterCoverage?.unassigned_employees),
          pending_roster_changes: n(rosterCoverage?.pending_roster_changes),
        },
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-roster", "Open roster", "Review rosters", "/rosters", "rosters.view", "Roster"), moduleCode: "roster" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("roster coverage")) ? "empty" : n(data.holiday_roster_context?.open_roster_conflicts) > 0 ? "needs_review" : "ready",
        error: commandCenterWarnings.some((warning) => warning.includes("roster coverage")) ? "unavailable" : undefined,
      }),
      department_health: widget("Department Health", employeesEnabled, can(actor, ["department.dashboard.view", "employees.view", "dashboard.view_company"]), {
        description: "Department-level health overview.",
        rows: data.employee_summary?.by_department ?? [],
        status: (data.employee_summary?.by_department?.length ?? 0) > 0 ? "ready" : "empty",
      }),
      employee_attention: widget("Employee Attention", employeesEnabled, canViewEmployees, {
        description: "Employee setup and lifecycle attention categories.",
        rows: attention.data.map((item) => ({
          id: item.id,
          category: item.area,
          title: item.title,
          count: item.count,
          priority: item.priority,
          href: item.href,
        })),
        status: commandCenterWarnings.some((warning) => warning.includes("employee attention")) ? "empty" : attention.data.length > 0 ? "needs_review" : "empty",
        error: commandCenterWarnings.some((warning) => warning.includes("employee attention")) ? "unavailable" : undefined,
      }),
      lifecycle: widget("Lifecycle / Offboarding", lifecycleEnabled, canViewLifecycle, {
        description: "Notice period and offboarding task health.",
        metrics: {
          employees_in_notice_period: n(lifecycleCounts?.employees_in_notice_period),
          offboarding_tasks_pending: n(lifecycleCounts?.offboarding_tasks_pending),
          final_settlement_review_pending: n(lifecycleCounts?.final_settlement_review_pending),
          access_disable_review_pending: n(lifecycleCounts?.access_disable_review_pending),
          exit_interviews_pending: n(lifecycleCounts?.exit_interviews_pending),
        },
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-offboarding", "Open offboarding", "Review exit requests", "/offboarding", "employeeLifecycle.offboarding.view", "Lifecycle"), moduleCode: "resignation_offboarding" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("lifecycle")) ? "empty" : Object.values(lifecycleCounts ?? {}).some((value) => n(value) > 0) ? "needs_review" : "empty",
        error: commandCenterWarnings.some((warning) => warning.includes("lifecycle")) ? "unavailable" : undefined,
      }),
      disciplinary_follow_up: widget("Disciplinary Follow-up", disciplineEnabled, canViewDiscipline, {
        description: "Disciplinary reviews and follow-up tasks.",
        metrics: {
          pending_reviews: n(disciplinaryCounts?.pending_reviews),
          pending_acknowledgements: n(disciplinaryCounts?.pending_acknowledgements),
          open_follow_up_tasks: n(disciplinaryCounts?.open_follow_up_tasks),
          high_severity_cases_pending: n(disciplinaryCounts?.high_severity_cases_pending),
        },
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-disciplinary", "Open disciplinary actions", "Review disciplinary actions", "/disciplinary-actions", "employeeDiscipline.actions.view", "Discipline"), moduleCode: "disciplinary_actions" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("disciplinary")) ? "empty" : Object.values(disciplinaryCounts ?? {}).some((value) => n(value) > 0) ? "needs_review" : "empty",
        error: commandCenterWarnings.some((warning) => warning.includes("disciplinary")) ? "unavailable" : undefined,
      }),
      operation_ownership_health: widget("Operation Ownership Health", operationOwnershipEnabled, canViewOperationOwnership, {
        description: "Responsibility matrix setup health.",
        metrics: {
          operations_missing_owner: n(operationHealth?.operations_missing_owner),
          operations_missing_final_approver: n(operationHealth?.operations_missing_final_approver),
          operations_missing_executor: n(operationHealth?.operations_missing_executor),
          operations_using_super_admin_fallback: n(operationHealth?.operations_using_super_admin_fallback),
          operations_blocked_by_fallback: n(operationHealth?.operations_blocked_by_fallback),
          functions_without_assigned_users: n(operationHealth?.functions_without_assigned_users),
        },
        warnings: operationWarnings,
        actions: visibleActions(actor, features, [
          { ...moduleAction("open-operation-ownership", "Open Operation Ownership", "Resolve setup warnings", "/organization/operation-ownership", "operationOwnership.view", "Operation Ownership"), moduleCode: "operation_ownership" },
        ]),
        status: commandCenterWarnings.some((warning) => warning.includes("operation ownership")) ? "empty" : Object.values(operationHealth ?? {}).some((value) => n(value) > 0) ? "needs_review" : "ready",
        error: commandCenterWarnings.some((warning) => warning.includes("operation ownership")) ? "unavailable" : undefined,
      }),
      recent_activity: widget("Recent Activity", true, canViewAudit, {
        description: "Safe recent activity summaries.",
        rows: recentActivity.map((item) => ({
          id: String(item.id),
          title: `${item.module ?? "System"} ${item.action ?? "activity"}`,
          description: item.entity_type ? `${item.entity_type}${item.entity_id ? ` ${item.entity_id}` : ""}` : "Recent system activity",
          timestamp: String(item.created_at ?? ctx.generatedAt),
          status: String(item.severity ?? "info"),
        })),
        status: commandCenterWarnings.some((warning) => warning.includes("recent activity")) ? "empty" : recentActivity.length > 0 ? "ready" : "empty",
        error: commandCenterWarnings.some((warning) => warning.includes("recent activity")) ? "unavailable" : undefined,
      }),
    },
    warnings: [
      ...commandCenterWarnings,
      ...(!quickActions.length ? ["No command-center quick actions are available for this role."] : []),
      ...operationWarnings,
    ],
    generated_at: ctx.generatedAt,
  };

  return { data: response, meta: meta(ctx) };
};
