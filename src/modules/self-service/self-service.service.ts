import * as permissionService from "../../services/permission.service";
import type { AuthActor } from "../../types/api.types";
import { PermissionError } from "../../utils/errors";
import * as repository from "./self-service.repository";
import type { SelfDashboardWidget, SelfNavigationItem, SelfProfile } from "./self-service.types";

const todayIso = () => new Date().toISOString().slice(0, 10);
const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);
const hasAny = (context: AuthActor, permissions: string[]) =>
  permissionService.isSuperAdmin(context) || permissionService.hasAnyPermission(context, permissions);
const feature = (features: Set<string>, key: string) => features.has(key);
export const SELF_SERVICE_LINKED_EMPLOYEE_REQUIRED_MESSAGE =
  "Self-service is only available for accounts linked to an employee profile.";

const activeEmployee = (row: any) =>
  Boolean(
    row?.employee_id &&
    !row.deleted_at &&
    !row.archived_at &&
    !["inactive", "archived", "deleted", "terminated", "resigned"].includes(String(row.employment_status ?? "").toLowerCase()),
  );

const employeeFromRow = (row: any): SelfProfile["employee"] => row?.employee_id ? ({
  id: row.employee_id,
  employee_code: row.employee_code ?? null,
  full_name: row.employee_name ?? null,
  department_id: row.department_id ?? null,
  department_name: row.department_name ?? null,
  position_id: row.position_id ?? null,
  position_title: row.position_title ?? null,
  level: row.level ?? null,
  outlet_id: row.outlet_id ?? null,
  outlet_name: row.outlet_name ?? null,
  employment_status: row.employment_status ?? null,
  employment_type: row.employment_type ?? null,
  employee_type: row.employee_type ?? null,
  nationality: row.nationality ?? null,
  email: row.employee_email ?? null,
  phone: row.employee_phone ?? null,
}) : null;

export const requireLinkedEmployeeForSelfService = (profile: SelfProfile) => {
  if (!profile.linked_employee || !profile.employee) {
    throw new PermissionError(SELF_SERVICE_LINKED_EMPLOYEE_REQUIRED_MESSAGE, "SELF_SERVICE_EMPLOYEE_PROFILE_REQUIRED");
  }
  return profile.employee;
};

export const getSelfProfile = async (env: Env, context: AuthActor): Promise<SelfProfile> => {
  if (!has(context, "self.profile.view") && !has(context, "self.dashboard.view")) throw new PermissionError();
  const [row, roles] = await Promise.all([
    repository.findSelfProfile(env, context.companyId, context.actorUserId),
    repository.listSelfRoleNames(env, context.companyId, context.actorUserId),
  ]);
  const profile: SelfProfile = {
    linked_employee: activeEmployee(row),
    user: {
      id: row?.user_id ?? context.actorUserId,
      username: row?.username ?? null,
      email: row?.user_email ?? context.email ?? null,
      full_name: row?.user_full_name ?? context.fullName ?? null,
      status: row?.user_status ?? null,
      last_login_at: row?.last_login_at ?? null,
    },
    employee: activeEmployee(row) ? employeeFromRow(row) : null,
    roles: roles.map((role) => role.role_name),
    access_summary: [
      `Level ${row?.level ?? "unassigned"} access`,
      ...(context.permissions ?? []).filter((permission) => permission.startsWith("self.") || permission.startsWith("department.")).slice(0, 8),
    ],
  };
  requireLinkedEmployeeForSelfService(profile);
  return profile;
};

export const resolveEmployeeNavigation = (context: AuthActor, profile: SelfProfile, features: Set<string>): SelfNavigationItem[] => {
  const linked = profile.linked_employee;
  const item = (key: string, label: string, path: string, permission: string, enabled = true, reason?: string): SelfNavigationItem => ({
    key,
    label,
    path,
    enabled: linked && enabled && has(context, permission),
    reason: !linked ? "Employee profile not linked." : reason,
  });
  return [
    item("dashboard", "Dashboard", "/self/dashboard", "self.dashboard.view"),
    item("profile", "My Profile", "/self/profile", "self.profile.view"),
    item("attendance", "My Attendance", "/self/attendance", "self.attendance.view", feature(features, "attendance"), "Attendance module is not enabled."),
    item("roster", "My Roster", "/self/roster", "self.roster.view", feature(features, "roster"), "Roster module is not enabled."),
    item("leave", "My Leave", "/self/leave", "self.leave.view", feature(features, "leave_management"), "Leave module is not enabled."),
    item("requests", "My Requests", "/self/requests", "self.requests.view"),
    item("documents", "My Documents / KYC", "/self/documents", "self.documents.view", feature(features, "documents") || feature(features, "kyc_update_requests"), "Documents/KYC module is not enabled."),
    item("payslips", "My Payslips", "/self/payslips", "self.payslips.view", feature(features, "payslips") || feature(features, "payroll"), "Payslips module is not enabled."),
    item("pending-approvals", "My Pending Approvals", "/self/pending-approvals", "department.approvals.view", true),
    item("department-dashboard", "Department Dashboard", "/self/department-dashboard", "department.dashboard.view", true),
  ];
};

export const getSelfNavigation = async (env: Env, context: AuthActor) => {
  const [profile, enabledFeatures] = await Promise.all([
    getSelfProfile(env, context),
    repository.listEnabledFeatureKeys(env, context.companyId),
  ]);
  return resolveEmployeeNavigation(context, profile, new Set(enabledFeatures));
};

const widget = (input: SelfDashboardWidget): SelfDashboardWidget => input;

export const getSelfRequests = async (env: Env, context: AuthActor) => {
  if (!has(context, "self.requests.view")) throw new PermissionError();
  const profile = await getSelfProfile(env, context);
  if (!profile.employee) return [];
  return repository.listSelfRequests(env, context.companyId, context.actorUserId, profile.employee.id);
};

export const getSelfPendingApprovals = async (env: Env, context: AuthActor) => {
  if (!hasAny(context, ["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"])) throw new PermissionError();
  const profile = await getSelfProfile(env, context);
  return repository.listSelfPendingApprovals(env, context.companyId, context.actorUserId, profile.employee ? {
    id: profile.employee.id,
    department_id: profile.employee.department_id,
    level: profile.employee.level,
  } : null, context.permissions ?? []);
};

export const getSelfAccessSummary = async (env: Env, context: AuthActor) => {
  const [profile, enabledFeatures] = await Promise.all([
    getSelfProfile(env, context),
    repository.listEnabledFeatureKeys(env, context.companyId),
  ]);
  return {
    linked_employee: profile.linked_employee,
    level: profile.employee?.level ?? null,
    roles: profile.roles,
    permissions: (context.permissions ?? []).filter((permission) => !/password|token|secret|session/i.test(permission)),
    navigation: resolveEmployeeNavigation(context, profile, new Set(enabledFeatures)),
  };
};

export const getSelfDashboard = async (env: Env, context: AuthActor) => {
  if (!has(context, "self.dashboard.view")) throw new PermissionError();
  const [profile, enabledFeatures] = await Promise.all([
    getSelfProfile(env, context),
    repository.listEnabledFeatureKeys(env, context.companyId),
  ]);
  const featureSet = new Set(enabledFeatures);
  const navigation = resolveEmployeeNavigation(context, profile, featureSet);
  const employee = requireLinkedEmployeeForSelfService(profile);

  const today = todayIso();
  const attendanceEnabled = feature(featureSet, "attendance");
  const rosterEnabled = feature(featureSet, "roster");
  const leaveEnabled = feature(featureSet, "leave_management");
  const documentsEnabled = feature(featureSet, "documents") || feature(featureSet, "kyc_update_requests");
  const payslipsEnabled = feature(featureSet, "payslips") || feature(featureSet, "payroll");
  const noAccessMessage = "You do not have access to this module.";
  const canViewAttendance = attendanceEnabled && has(context, "self.attendance.view");
  const canViewRoster = rosterEnabled && has(context, "self.roster.view");
  const canViewLeave = leaveEnabled && has(context, "self.leave.view");
  const canViewDocuments = documentsEnabled && has(context, "self.documents.view");
  const canViewPayslips = payslipsEnabled && has(context, "self.payslips.view");
  const [attendance, roster, leaveBalance, leaveCounts, correctionCounts, documents, notifications, payslip, requests, pendingApprovals] = await Promise.all([
    canViewAttendance ? repository.getTodayAttendance(env, context.companyId, employee.id, today).catch(() => null) : Promise.resolve(null),
    canViewRoster ? repository.getNextRosterShift(env, context.companyId, employee.id, today).catch(() => null) : Promise.resolve(null),
    canViewLeave ? repository.getLeaveBalanceSummary(env, context.companyId, employee.id).catch(() => null) : Promise.resolve(null),
    canViewLeave ? repository.getLeaveRequestCounts(env, context.companyId, employee.id).catch(() => null) : Promise.resolve(null),
    canViewAttendance ? repository.getAttendanceCorrectionCounts(env, context.companyId, employee.id, context.actorUserId).catch(() => null) : Promise.resolve(null),
    canViewDocuments ? repository.getDocumentSummary(env, context.companyId, employee.id, today).catch(() => null) : Promise.resolve(null),
    repository.getUnreadNotificationCount(env, context.companyId, context.actorUserId).catch(() => null),
    canViewPayslips ? repository.getLatestPayslip(env, context.companyId, employee.id).catch(() => null) : Promise.resolve(null),
    has(context, "self.requests.view") ? repository.listSelfRequests(env, context.companyId, context.actorUserId, employee.id, 5).catch(() => []) : Promise.resolve([]),
    hasAny(context, ["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"])
      ? repository.listSelfPendingApprovals(env, context.companyId, context.actorUserId, {
        id: employee.id,
        department_id: employee.department_id,
        level: employee.level,
      }, context.permissions ?? [], 5).catch(() => [])
      : Promise.resolve([]),
  ]);

  const widgets: SelfDashboardWidget[] = [
    widget({
      key: "profile",
      title: "My profile summary",
      enabled: true,
      status: "ok",
      value: employee.full_name,
      description: `${employee.department_name ?? "Unassigned department"} - ${employee.position_title ?? "Unassigned position"}`,
      href: "/self/profile",
      rows: [
        { label: "Employee code", value: employee.employee_code },
        { label: "Level", value: employee.level ? `Level ${employee.level}` : "Unassigned" },
        { label: "Outlet/store", value: employee.outlet_name ?? "Unassigned" },
      ],
    }),
    widget({
      key: "attendance",
      title: "Today's attendance status",
      enabled: canViewAttendance,
      status: !attendanceEnabled || !canViewAttendance ? "disabled" : attendance ? "ok" : "empty",
      value: attendance?.status ?? null,
      description: !attendanceEnabled ? "Attendance module is not enabled." : !canViewAttendance ? noAccessMessage : attendance ? `${attendance.first_clock_in ?? "No check-in"} / ${attendance.last_clock_out ?? "No check-out"}` : "No attendance summary recorded for today.",
      href: "/self/attendance",
    }),
    widget({
      key: "roster",
      title: "Next roster / shift",
      enabled: canViewRoster,
      status: !rosterEnabled || !canViewRoster ? "disabled" : roster ? "ok" : "empty",
      value: roster?.shift_date ?? null,
      description: !rosterEnabled ? "Roster module is not enabled." : !canViewRoster ? noAccessMessage : roster ? `${roster.start_time ?? "-"} to ${roster.end_time ?? "-"}` : "No roster assigned for today or upcoming days.",
      href: "/self/roster",
    }),
    widget({
      key: "leave",
      title: "Leave balance summary",
      enabled: canViewLeave,
      status: !leaveEnabled || !canViewLeave ? "disabled" : "ok",
      value: leaveBalance?.available_days ?? 0,
      description: !leaveEnabled ? "Leave module is not enabled." : !canViewLeave ? noAccessMessage : `${leaveCounts?.pending ?? 0} pending leave request(s).`,
      href: "/self/leave",
    }),
    widget({
      key: "requests",
      title: "My pending requests",
      enabled: true,
      status: (requests as unknown[]).length ? "attention" : "empty",
      value: (requests as unknown[]).filter((request: any) => ["SUBMITTED", "IN_REVIEW", "NEEDS_MANUAL_ASSIGNMENT"].includes(request.status)).length,
      description: `${correctionCounts?.pending ?? 0} attendance correction(s) pending. ${leaveCounts?.rejected ?? 0} leave request(s) rejected/cancelled.`,
      href: "/self/requests",
    }),
    widget({
      key: "approvals",
      title: "My approvals",
      enabled: hasAny(context, ["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"]),
      status: (pendingApprovals as unknown[]).length ? "attention" : "empty",
      value: (pendingApprovals as unknown[]).length,
      description: (pendingApprovals as unknown[]).length ? "Approval steps are waiting for your review." : "No pending approvals assigned to you.",
      href: "/self/pending-approvals",
    }),
    widget({
      key: "documents",
      title: "Documents / KYC status",
      enabled: canViewDocuments,
      status: !documentsEnabled || !canViewDocuments ? "disabled" : documents?.expired ? "attention" : documents?.expiring_soon ? "attention" : "ok",
      value: documents?.uploaded ?? 0,
      description: !documentsEnabled ? "Documents/KYC module is not enabled." : !canViewDocuments ? noAccessMessage : documents ? `${documents.expiring_soon ?? 0} expiring soon - ${documents.expired ?? 0} expired.` : "No document summary available.",
      href: "/self/documents",
    }),
    widget({
      key: "notifications",
      title: "Notifications",
      enabled: true,
      status: (notifications?.unread ?? 0) > 0 ? "attention" : "empty",
      value: notifications?.unread ?? 0,
      description: "Unread in-app notifications.",
      href: "/notifications",
    }),
    widget({
      key: "payslip",
      title: "Latest payslip",
      enabled: canViewPayslips,
      status: !payslipsEnabled || !canViewPayslips ? "disabled" : payslip ? "ok" : "empty",
      value: payslip?.payroll_month ?? null,
      description: !payslipsEnabled ? "Payslips module is not enabled." : !canViewPayslips ? noAccessMessage : payslip ? `Status: ${payslip.status ?? "generated"}` : "No payslip has been published yet.",
      href: "/self/payslips",
    }),
  ];

  return { profile, navigation, widgets, requests, pending_approvals: pendingApprovals };
};
