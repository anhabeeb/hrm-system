import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor } from "../../types/api.types";
import { NotFoundError, PermissionError } from "../../utils/errors";
import * as attendanceCalendarService from "../attendance/attendance-calendar.service";
import { getEnabledApprovalOperationTypes } from "../approvals/approval-module-access.service";
import { APPROVAL_OPERATION_TYPES } from "../approvals/approval-workflow-engine.types";
import * as repository from "./self-service.repository";
import type {
  SelfDashboardQuickAction,
  SelfDashboardWidget,
  SelfNavigationItem,
  SelfProfile,
  SelfServiceApprovalChainResponse,
  SelfServiceApprovalChainStatus,
  SelfServiceApprovalChainStep,
  SelfServiceApprovalPolicySummary,
} from "./self-service.types";

const todayIso = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => todayIso().slice(0, 7);
const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);
const hasAny = (context: AuthActor, permissions: string[]) =>
  permissionService.isSuperAdmin(context) || permissionService.hasAnyPermission(context, permissions);
const feature = (features: Set<string>, key: string) => features.has(key);
const featureAny = (features: Set<string>, keys: string[]) => keys.some((key) => features.has(key));
const featuresAll = (features: Set<string>, groups: string[][]) => groups.every((group) => featureAny(features, group));
const SHOW_APPROVER_NAMES_TO_EMPLOYEES = false;

interface SelfServiceCapabilities {
  payslipsEnabled: boolean;
  attendanceCorrectionsEnabled: boolean;
}

const attendanceCorrectionsSubFeatureEnabled = async (env: Env, companyId: string) => {
  const settings = await settingsService.getAttendanceSettings(env, companyId).catch(() => ({})) as Record<string, unknown>;
  return ["attendance.corrections_enabled", "attendance_correction_enabled"].every((alias) => settings[alias] !== false);
};

const resolveSelfServiceCapabilities = async (
  env: Env,
  companyId: string,
  features: Set<string>,
): Promise<SelfServiceCapabilities> => {
  const attendanceEnabled = feature(features, "attendance");
  const payrollEnabled = feature(features, "payroll");
  const payslipsFeatureEnabled = feature(features, "payslips");
  const [attendanceCorrectionsEnabled, payrollPayslipsEnabled] = await Promise.all([
    attendanceEnabled ? attendanceCorrectionsSubFeatureEnabled(env, companyId) : Promise.resolve(false),
    payrollEnabled ? settingsService.isPayrollSubFeatureEnabled(env, companyId, "payroll.payslips_enabled").catch(() => false) : Promise.resolve(false),
  ]);
  return {
    attendanceCorrectionsEnabled,
    payslipsEnabled: payrollEnabled && payslipsFeatureEnabled && payrollPayslipsEnabled,
  };
};

const safe = async <T>(factory: () => Promise<T> | T, fallback: T): Promise<T> => {
  try {
    const result = await factory();
    return (result ?? fallback) as T;
  } catch {
    return fallback;
  }
};
export const SELF_SERVICE_LINKED_EMPLOYEE_REQUIRED_MESSAGE =
  "Self-service is only available for accounts linked to an employee profile.";

const activeEmployee = (row: any) =>
  Boolean(
    row?.employee_id &&
    !row.deleted_at &&
    !row.archived_at &&
    !["inactive", "archived", "deleted", "terminated", "resigned"].includes(String(row.employment_status ?? "").toLowerCase()),
  );

const employeeProfilePhotoUrl = (row: any) =>
  row?.profile_photo_key
    ? `/api/v1/employees/${row.employee_id}/profile-photo${row.profile_photo_updated_at ? `?v=${encodeURIComponent(row.profile_photo_updated_at)}` : ""}`
    : null;

const employeeFromRow = (row: any): SelfProfile["employee"] => row?.employee_id ? ({
  id: row.employee_id,
  employee_code: row.employee_code ?? null,
  full_name: row.employee_name ?? null,
  profile_photo_url: employeeProfilePhotoUrl(row),
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

export const resolveEmployeeNavigation = (
  context: AuthActor,
  profile: SelfProfile,
  features: Set<string>,
  capabilities: SelfServiceCapabilities = {
    payslipsEnabled: feature(features, "payroll") && feature(features, "payslips"),
    attendanceCorrectionsEnabled: feature(features, "attendance"),
  },
): SelfNavigationItem[] => {
  const linked = profile.linked_employee;
  const item = (key: string, label: string, path: string, permission: string, enabled = true, reason?: string): SelfNavigationItem => ({
    key,
    label,
    path,
    enabled: linked && enabled && has(context, permission),
    reason: !linked ? "Employee profile not linked." : reason,
  });
  const itemAny = (key: string, label: string, path: string, permissions: string[], enabled = true, reason?: string): SelfNavigationItem => ({
    key,
    label,
    path,
    enabled: linked && enabled && hasAny(context, permissions),
    reason: !linked ? "Employee profile not linked." : reason,
  });
  const departmentDashboardEnabled = featuresAll(features, [["employees", "employee_management"], ["attendance"]]);
  return [
    item("dashboard", "Dashboard", "/self/dashboard", "self.dashboard.view"),
    item("profile", "My Profile", "/self/profile", "self.profile.view"),
    item("attendance", "My Attendance", "/self/attendance", "self.attendance.view", feature(features, "attendance"), "Attendance module is not enabled."),
    item("roster", "My Roster", "/self/roster", "self.roster.view", feature(features, "roster"), "Roster module is not enabled."),
    item("leave", "My Leave", "/self/leave", "self.leave.view", feature(features, "leave_management"), "Leave module is not enabled."),
    item("requests", "My Requests", "/self/requests", "self.requests.view"),
    item("documents", "My Documents / KYC", "/self/documents", "self.documents.view", feature(features, "documents") || feature(features, "kyc_update_requests"), "Documents/KYC module is not enabled."),
    item("payslips", "My Payslips", "/self/payslips", "self.payslips.view", capabilities.payslipsEnabled, "Payslips are not enabled."),
    item("pending-approvals", "My Pending Approvals", "/self/pending-approvals", "department.approvals.view", true),
    itemAny(
      "department-dashboard",
      "Department Dashboard",
      "/self/department-dashboard",
      ["department.dashboard.view", "departments.dashboard.viewTeam", "attendance.teamCalendar.view", "attendance.calendar.viewTeam", "employees.team.view"],
      departmentDashboardEnabled,
      "Employee management and Attendance modules must both be enabled.",
    ),
  ];
};

export const getSelfNavigation = async (env: Env, context: AuthActor) => {
  const [profile, enabledFeatures] = await Promise.all([
    getSelfProfile(env, context),
    repository.listEnabledFeatureKeys(env, context.companyId),
  ]);
  const featureSet = new Set(enabledFeatures);
  const capabilities = await resolveSelfServiceCapabilities(env, context.companyId, featureSet);
  return resolveEmployeeNavigation(context, profile, featureSet, capabilities);
};

const widget = (input: SelfDashboardWidget): SelfDashboardWidget => input;

export const getSelfRequests = async (env: Env, context: AuthActor) => {
  if (!has(context, "self.requests.view")) throw new PermissionError();
  const profile = await getSelfProfile(env, context);
  if (!profile.employee) return [];
  return repository.listSelfRequests(env, context.companyId, context.actorUserId, profile.employee.id);
};

const safeJson = (value?: string | null): Record<string, any> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
};

const safeApproverName = (name?: string | null) =>
  SHOW_APPROVER_NAMES_TO_EMPLOYEES ? name ?? null : null;

const humanizeResolver = (value?: string | null) =>
  String(value ?? "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Approver";

const resolverLabel = (step: any) => {
  const resolver = String(step.approver_resolver_type ?? "");
  if (step.required_role_name) return step.required_role_name;
  if (step.required_permission) return humanizeResolver(step.required_permission);
  if (resolver === "REQUESTER_MANAGER") return "Direct Manager";
  if (resolver === "DEPARTMENT_HEAD") return "Department Senior";
  if (resolver === "DEPARTMENT_LEVEL") return "Department level approver";
  if (resolver === "DEPARTMENT_ROLE") return "Department role approver";
  if (resolver === "HR_FINAL_APPROVER") return "HR approver";
  if (resolver === "FINANCE_FINAL_APPROVER") return "Finance approver";
  if (resolver === "SUPER_ADMIN") return "Super Admin";
  if (resolver === "MANUAL_ASSIGNMENT") return "Approval setup needs review by HR.";
  if (resolver === "OPERATION_OWNER") return "Operation owner";
  if (resolver === "SPECIFIC_USER") return "Assigned approver";
  return step.step_name ?? humanizeResolver(resolver);
};

const levelLabel = (step: any) => {
  const min = step.required_min_level;
  const max = step.required_max_level;
  if (min == null && max == null) return null;
  if (min != null && max != null) return min === max ? `Level ${min} approver` : `Level ${min}-${max} approver`;
  if (min != null) return `Level ${min}+ approver`;
  return `Up to level ${max} approver`;
};

const actionForStep = (actions: any[], step: any, actionNames: string[]) =>
  [...actions]
    .reverse()
    .find((action) =>
      (
        (action.approval_request_step_id && action.approval_request_step_id === step.id) ||
        (!action.approval_request_step_id && Number(action.step_order ?? 0) === Number(step.step_order ?? 0))
      ) &&
      actionNames.includes(String(action.action ?? "").toUpperCase()),
    );

const statusForStep = (request: any, step: any, index: number, currentIndex: number): SelfServiceApprovalChainStatus => {
  const requestStatus = String(request.status ?? "").toUpperCase();
  const stepStatus = String(step.status ?? "").toUpperCase();
  if (requestStatus === "CANCELLED") return stepStatus === "APPROVED" ? "approved" : "cancelled";
  if (stepStatus === "APPROVED") return "approved";
  if (stepStatus === "REJECTED") return "rejected";
  if (stepStatus === "SKIPPED") return "skipped";
  if (requestStatus === "REJECTED" && currentIndex >= 0 && index > currentIndex) return "not_required";
  if (stepStatus === "CANCELLED") return "cancelled";
  if (step.id === request.current_step_id || ["PENDING", "ESCALATED", "WAITING_FOR_APPROVER"].includes(stepStatus) && index === currentIndex) return "pending";
  return "waiting";
};

const buildPolicySummary = (leaveRequest: any | null): SelfServiceApprovalPolicySummary | null => {
  if (!leaveRequest) return null;
  const snapshot = safeJson(leaveRequest.policy_snapshot_json);
  const salaryDeductionRequired = Boolean(
    snapshot.salary_deduction_required ??
    snapshot.deduction_required ??
    snapshot.payroll_deduction_required ??
    leaveRequest.affects_payroll,
  );
  const deductionMode = snapshot.deduction_mode ?? snapshot.salary_deduction_mode ?? null;
  const sourceLabel = snapshot.deduction_source_label ?? snapshot.deduction_component_label ?? snapshot.deduction_component ?? null;
  return {
    leave_request_id: leaveRequest.id ?? null,
    leave_type_name: leaveRequest.leave_type_name ?? null,
    date_range: leaveRequest.start_date && leaveRequest.end_date ? `${leaveRequest.start_date} to ${leaveRequest.end_date}` : null,
    document_required: Boolean(leaveRequest.document_required ?? snapshot.document_required),
    document_status: leaveRequest.document_status ?? (snapshot.document_required ? "missing" : "not_required"),
    document_required_reason: leaveRequest.document_required_reason ?? snapshot.document_reason ?? snapshot.document_required_reason ?? null,
    salary_deduction_required: salaryDeductionRequired,
    deduction_mode: deductionMode,
    deduction_source_label: sourceLabel,
    paid_percentage: snapshot.paid_percentage == null ? null : Number(snapshot.paid_percentage),
    approval_required: snapshot.approval_required == null ? null : Boolean(snapshot.approval_required),
    approval_workflow_key: snapshot.approval_workflow_key ?? snapshot.workflow_key ?? null,
    payroll_impact_label: salaryDeductionRequired
      ? `Payroll impact: ${sourceLabel ? `deduction from ${sourceLabel}` : humanizeResolver(String(deductionMode ?? "configured deduction"))}`
      : "No salary deduction required by this leave policy.",
  };
};

const noApprovalStep = (request: any): SelfServiceApprovalChainStep => ({
  step_order: 1,
  step_key: "no_approval_required",
  step_label: String(request.status ?? "").toUpperCase() === "APPROVED" ? "Automatically approved" : "No approval required",
  status: "no_approval_required",
  resolver_type: "NO_APPROVAL_REQUIRED",
  approver_role_label: "No approval required",
  approver_level_label: null,
  approver_department_label: null,
  approver_display_name: null,
  approved_by_display_name: null,
  approved_at: request.approved_at ?? request.completed_at ?? null,
  rejected_by_display_name: null,
  rejected_at: null,
  comments_visible_to_employee: null,
  is_current_step: false,
  is_final_step: true,
});

export const getSelfApprovalChain = async (env: Env, context: AuthActor, requestId: string): Promise<SelfServiceApprovalChainResponse> => {
  if (!has(context, "self.requests.view")) throw new PermissionError();
  const [profile, enabledFeatures] = await Promise.all([
    getSelfProfile(env, context),
    repository.listEnabledFeatureKeys(env, context.companyId),
  ]);
  const employee = requireLinkedEmployeeForSelfService(profile);
  const request = await repository.findSelfApprovalRequest(env, context.companyId, requestId, context.actorUserId, employee.id);
  if (!request) throw new NotFoundError("Request not found.");

  const operationType = String(request.operation_type ?? "");
  if (operationType === "LEAVE_REQUEST" && !new Set(enabledFeatures).has("leave_management")) {
    throw new PermissionError("Leave Management is disabled. Enable it in Settings to use this module.", "FEATURE_DISABLED");
  }

  const [steps, actions, leaveRequest] = await Promise.all([
    repository.listSelfApprovalRequestSteps(env, context.companyId, request.id),
    repository.listSelfApprovalActions(env, context.companyId, request.id),
    operationType === "LEAVE_REQUEST"
      ? repository.findSelfLeaveRequestForApproval(env, context.companyId, request).catch(() => null)
      : Promise.resolve(null),
  ]);
  const policySummary = buildPolicySummary(leaveRequest);

  const currentIndex = steps.findIndex((step) => step.id === request.current_step_id);
  const rejectedIndex = steps.findIndex((step) => String(step.status ?? "").toUpperCase() === "REJECTED");
  const approvalChain = steps.length
    ? steps.map((step, index): SelfServiceApprovalChainStep => {
      const approvedAction = actionForStep(actions, step, ["APPROVE", "APPROVED"]);
      const rejectedAction = actionForStep(actions, step, ["REJECT", "REJECTED"]);
      const stepStatus = rejectedIndex >= 0 && index > rejectedIndex ? "not_required" : statusForStep(request, step, index, currentIndex);
      return {
        step_order: Number(step.step_order ?? index + 1),
        step_key: step.step_code ?? step.workflow_step_id ?? step.id,
        step_label: step.step_name ?? resolverLabel(step),
        status: stepStatus,
        resolver_type: humanizeResolver(step.approver_resolver_type),
        approver_role_label: resolverLabel(step),
        approver_level_label: levelLabel(step),
        approver_department_label: step.assigned_department_name ?? null,
        approver_display_name: safeApproverName(step.assigned_approver_name ?? step.assigned_employee_name),
        approved_by_display_name: safeApproverName(approvedAction?.actor_name),
        approved_at: step.approved_at ?? approvedAction?.created_at ?? null,
        rejected_by_display_name: safeApproverName(rejectedAction?.actor_name),
        rejected_at: step.rejected_at ?? rejectedAction?.created_at ?? null,
        comments_visible_to_employee: null,
        is_current_step: step.id === request.current_step_id && ["pending", "waiting"].includes(stepStatus),
        is_final_step: index === steps.length - 1,
      };
    })
    : [noApprovalStep(request)];

  const current = approvalChain.find((step) => step.is_current_step) ?? null;
  const manualAssignment = steps.some((step) =>
    String(step.approver_resolver_type ?? "") === "MANUAL_ASSIGNMENT" ||
    String(step.status ?? "").toUpperCase() === "WAITING_FOR_APPROVER",
  );

  return {
    request_id: request.id,
    request_type: operationType,
    request_status: request.status,
    title: request.title ?? operationType,
    summary: request.summary ?? null,
    current_step_key: current?.step_key ?? request.current_step_code ?? null,
    current_step_label: current?.step_label ?? request.current_step_name ?? null,
    approval_setup_message: manualAssignment ? "Approval setup needs review by HR." : null,
    policy_summary: policySummary,
    approval_chain: approvalChain,
  };
};

export const getSelfPendingApprovals = async (env: Env, context: AuthActor) => {
  if (!hasAny(context, ["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"])) throw new PermissionError();
  const profile = await getSelfProfile(env, context);
  const enabledApprovalOperationTypes = await getEnabledApprovalOperationTypes(env, context, APPROVAL_OPERATION_TYPES);
  return repository.listSelfPendingApprovals(env, context.companyId, context.actorUserId, profile.employee ? {
    id: profile.employee.id,
    department_id: profile.employee.department_id,
    level: profile.employee.level,
  } : null, context.permissions ?? [], 25, enabledApprovalOperationTypes);
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
    navigation: resolveEmployeeNavigation(
      context,
      profile,
      new Set(enabledFeatures),
      await resolveSelfServiceCapabilities(env, context.companyId, new Set(enabledFeatures)),
    ),
  };
};

export const getSelfDashboard = async (env: Env, context: AuthActor) => {
  if (!has(context, "self.dashboard.view")) throw new PermissionError();
  const [profile, enabledFeatures] = await Promise.all([
    getSelfProfile(env, context),
    repository.listEnabledFeatureKeys(env, context.companyId),
  ]);
  const featureSet = new Set(enabledFeatures);
  const capabilities = await resolveSelfServiceCapabilities(env, context.companyId, featureSet);
  const navigation = resolveEmployeeNavigation(context, profile, featureSet, capabilities);
  const employee = requireLinkedEmployeeForSelfService(profile);

  const today = todayIso();
  const attendanceEnabled = feature(featureSet, "attendance");
  const rosterEnabled = feature(featureSet, "roster");
  const leaveEnabled = feature(featureSet, "leave_management");
  const documentsEnabled = feature(featureSet, "documents") || feature(featureSet, "kyc_update_requests");
  const payslipsEnabled = capabilities.payslipsEnabled;
  const approvalsEnabled = feature(featureSet, "approvals");
  const lifecycleEnabled = feature(featureSet, "employee_lifecycle") || feature(featureSet, "resignation_offboarding");
  const disciplineEnabled = feature(featureSet, "employee_discipline") || feature(featureSet, "disciplinary_actions");
  const noAccessMessage = "You do not have access to this module.";
  const canViewAttendance = attendanceEnabled && has(context, "self.attendance.view");
  const canViewAttendanceCalendar = attendanceEnabled && hasAny(context, ["self.attendance.calendar.view", "self.attendance.view"]);
  const canViewAttendanceCorrections = canViewAttendance && capabilities.attendanceCorrectionsEnabled;
  const canRequestAttendanceCorrection = attendanceEnabled && capabilities.attendanceCorrectionsEnabled && hasAny(context, ["attendance.corrections.create", "attendance.corrections.createForOthers"]);
  const canViewRoster = rosterEnabled && has(context, "self.roster.view");
  const canViewLeave = leaveEnabled && has(context, "self.leave.view");
  const canViewDocuments = documentsEnabled && has(context, "self.documents.view");
  const canViewPayslips = payslipsEnabled && has(context, "self.payslips.view");
  const enabledApprovalOperationTypes = approvalsEnabled
    ? await getEnabledApprovalOperationTypes(env, context, APPROVAL_OPERATION_TYPES)
    : [];
  const [attendance, roster, leaveBalance, leaveCounts, correctionCounts, documents, notifications, payslip, requests, pendingApprovals] = await Promise.all([
    canViewAttendance ? repository.getTodayAttendance(env, context.companyId, employee.id, today).catch(() => null) : Promise.resolve(null),
    canViewRoster ? repository.getNextRosterShift(env, context.companyId, employee.id, today).catch(() => null) : Promise.resolve(null),
    canViewLeave ? repository.getLeaveBalanceSummary(env, context.companyId, employee.id).catch(() => null) : Promise.resolve(null),
    canViewLeave ? repository.getLeaveRequestCounts(env, context.companyId, employee.id).catch(() => null) : Promise.resolve(null),
    canViewAttendanceCorrections ? repository.getAttendanceCorrectionCounts(env, context.companyId, employee.id, context.actorUserId).catch(() => null) : Promise.resolve(null),
    canViewDocuments ? repository.getDocumentSummary(env, context.companyId, employee.id, today).catch(() => null) : Promise.resolve(null),
    repository.getUnreadNotificationCount(env, context.companyId, context.actorUserId).catch(() => null),
    canViewPayslips ? repository.getLatestPayslip(env, context.companyId, employee.id).catch(() => null) : Promise.resolve(null),
    has(context, "self.requests.view") ? repository.listSelfRequests(env, context.companyId, context.actorUserId, employee.id, 5).catch(() => []) : Promise.resolve([]),
    hasAny(context, ["department.approvals.view", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"])
      ? repository.listSelfPendingApprovals(env, context.companyId, context.actorUserId, {
        id: employee.id,
        department_id: employee.department_id,
        level: employee.level,
      }, context.permissions ?? [], 5, enabledApprovalOperationTypes).catch(() => [])
      : Promise.resolve([]),
  ]);

  const [
    attendanceCalendarPreview,
    upcomingRoster,
    leaveBalances,
    nextApprovedLeave,
    kycSummary,
    payslipSummary,
    offboardingStatus,
    offboardingTasks,
    acknowledgements,
    recentActivity,
  ] = await Promise.all([
    canViewAttendanceCalendar
      ? safe(() => attendanceCalendarService.getSelfAttendanceCalendar(env, context, { month: currentMonth() }), null as any)
      : Promise.resolve(null),
    canViewRoster ? safe(() => repository.listUpcomingRosterShifts(env, context.companyId, employee.id, today, 7), [] as any[]) : Promise.resolve([]),
    canViewLeave ? safe(() => repository.listLeaveBalanceRows(env, context.companyId, employee.id), [] as any[]) : Promise.resolve([]),
    canViewLeave ? safe(() => repository.getNextApprovedLeave(env, context.companyId, employee.id, today), null as any) : Promise.resolve(null),
    canViewDocuments ? safe(() => repository.getKycRequestSummary(env, context.companyId, employee.id), null as any) : Promise.resolve(null),
    canViewPayslips ? safe(() => repository.getPayslipSummary(env, context.companyId, employee.id), null as any) : Promise.resolve(null),
    lifecycleEnabled ? safe(() => repository.getOwnOffboardingStatus(env, context.companyId, employee.id), null as any) : Promise.resolve(null),
    lifecycleEnabled ? safe(() => repository.listOwnOffboardingTasks(env, context.companyId, employee.id, context.actorUserId, 5), [] as any[]) : Promise.resolve([]),
    disciplineEnabled ? safe(() => repository.listOwnDisciplinaryAcknowledgements(env, context.companyId, employee.id, 5), [] as any[]) : Promise.resolve([]),
    safe(() => repository.listSelfRecentActivity(env, context.companyId, context.actorUserId, employee.id, 8), [] as any[]),
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

  const quickAction = (
    key: string,
    label: string,
    href: string,
    enabled: boolean,
    module_code?: string,
    permission?: string,
  ): SelfDashboardQuickAction => ({ key, label, href, enabled, module_code, permission });

  const quick_actions = [
    quickAction("attendance-calendar", "View attendance calendar", "/self/attendance-calendar", canViewAttendanceCalendar, "attendance", "self.attendance.calendar.view"),
    quickAction("leave-request", "Request leave", "/self/leave", canViewLeave, "leave", "self.leave.view"),
    quickAction("attendance-correction", "Request attendance correction", "/self/attendance", canRequestAttendanceCorrection, "attendance", "attendance.corrections.create"),
    quickAction("roster", "View roster", "/self/roster", canViewRoster, "roster", "self.roster.view"),
    quickAction("payslips", "View payslips", "/self/payslips", canViewPayslips, "payslips", "self.payslips.view"),
    quickAction("documents", "Update documents / KYC", "/self/documents", canViewDocuments, "documents_kyc", "self.documents.view"),
    quickAction("requests", "View my requests", "/self/requests", has(context, "self.requests.view"), undefined, "self.requests.view"),
    quickAction("approvals", "View pending approvals", "/self/pending-approvals", approvalsEnabled && (pendingApprovals as unknown[]).length > 0, "approvals", "department.approvals.view"),
  ].filter((action) => action.enabled);

  const modern_widgets = {
    attendance_today: {
      visible: canViewAttendance,
      status: attendance?.status ?? null,
      check_in: attendance?.first_clock_in ?? null,
      check_out: attendance?.last_clock_out ?? null,
      late_minutes: Number(attendance?.late_minutes ?? 0),
      worked_minutes: Number(attendance?.worked_minutes ?? 0),
      warnings: attendance ? [] : ["No attendance record for today yet."],
      actions: quick_actions.filter((action) => ["attendance-calendar", "attendance-correction"].includes(action.key)),
    },
    attendance_calendar_preview: {
      visible: canViewAttendanceCalendar,
      payroll_period: attendanceCalendarPreview?.payroll_period ?? null,
      summary: attendanceCalendarPreview?.summary ?? null,
      days: (attendanceCalendarPreview?.days ?? []).slice(0, 14),
      warnings: attendanceCalendarPreview?.warnings ?? [],
      action: quick_actions.find((action) => action.key === "attendance-calendar") ?? null,
    },
    leave_balance: {
      visible: canViewLeave,
      balances: leaveBalances,
      summary: leaveBalance,
      pending_requests: leaveCounts?.pending ?? 0,
      next_approved_leave: nextApprovedLeave,
      actions: quick_actions.filter((action) => action.key === "leave-request"),
    },
    upcoming_roster: {
      visible: canViewRoster,
      today_shift: roster,
      next_shift: upcomingRoster[0] ?? roster ?? null,
      items: upcomingRoster,
      actions: quick_actions.filter((action) => action.key === "roster"),
    },
    pending_requests: {
      visible: has(context, "self.requests.view"),
      items: requests,
      count: (requests as unknown[]).length,
      action: quick_actions.find((action) => action.key === "requests") ?? null,
    },
    documents_kyc: {
      visible: canViewDocuments,
      metrics: {
        verified_count: documents?.uploaded ?? 0,
        expiring_soon: documents?.expiring_soon ?? 0,
        expired: documents?.expired ?? 0,
        pending_kyc_updates: kycSummary?.pending ?? 0,
      },
      latest_status: kycSummary?.latest_status ?? null,
      action: quick_actions.find((action) => action.key === "documents") ?? null,
    },
    payslips: {
      visible: canViewPayslips,
      latest: payslip ?? null,
      summary: payslipSummary,
      action: quick_actions.find((action) => action.key === "payslips") ?? null,
    },
    my_approvals: {
      visible: approvalsEnabled && (pendingApprovals as unknown[]).length > 0,
      items: pendingApprovals,
      count: (pendingApprovals as unknown[]).length,
      action: quick_actions.find((action) => action.key === "approvals") ?? null,
    },
    offboarding_status: {
      visible: lifecycleEnabled && Boolean(offboardingStatus || offboardingTasks.length),
      status: offboardingStatus,
      tasks: offboardingTasks,
    },
    acknowledgements: {
      visible: disciplineEnabled && acknowledgements.length > 0,
      items: acknowledgements,
      wording: "Acknowledged receipt",
    },
    recent_activity: {
      visible: true,
      items: recentActivity.map((item: any) => ({
        id: item.id,
        title: item.title ?? item.operation_type,
        description: item.summary ?? item.operation_type,
        timestamp: item.happened_at ?? null,
        status: item.status ?? null,
      })),
    },
  };

  return {
    profile,
    employee,
    header: {
      today,
      greeting_name: employee.full_name ?? profile.user.full_name,
      current_shift: roster ? {
        date: roster.shift_date ?? null,
        start_time: roster.start_time ?? null,
        end_time: roster.end_time ?? null,
        status: roster.status ?? null,
      } : null,
      today_status: attendance?.status ?? null,
      payroll_period: attendanceCalendarPreview?.payroll_period ?? null,
    },
    navigation,
    widgets,
    modern_widgets,
    quick_actions,
    warnings: [
      ...(attendanceCalendarPreview?.warnings ?? []),
      !attendanceEnabled ? "Attendance module is not enabled." : null,
      !leaveEnabled ? "Leave module is not enabled." : null,
      !rosterEnabled ? "Roster module is not enabled." : null,
      !documentsEnabled ? "Documents/KYC module is not enabled." : null,
      !payslipsEnabled ? "Payslips module is not enabled." : null,
    ].filter((warning): warning is string => Boolean(warning)),
    requests,
    pending_approvals: pendingApprovals,
  };
};
