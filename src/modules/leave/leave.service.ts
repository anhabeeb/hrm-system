import { LEAVE_AUDIT_ACTIONS, LOCKED_PAYROLL_STATUSES } from "./leave.constants";
import * as accrualService from "./leave-accrual.service";
import * as balanceService from "./leave-balance.service";
import * as calendarService from "./leave-calendar.service";
import * as policyService from "./leave-policy.service";
import * as repository from "./leave.repository";
import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import * as longLeaveCalculator from "../long-leave/long-leave-calculator.service";
import * as longLeaveRepository from "../long-leave/long-leave.repository";
import * as holidayCalculation from "../holidays/holiday-calculation.service";
import * as holidayService from "../holidays/holidays.service";
import type {
  LeaveActionInput,
  LeaveAccrualInput,
  LeaveApprovalStepRecord,
  LeaveBalanceAdjustInput,
  LeaveBalanceFilters,
  LeaveBalanceTransactionFilters,
  LeaveCarryForwardInput,
  LeaveCalendarFilters,
  LeaveExpiryInput,
  LeaveDelegateInput,
  LeaveListResult,
  LeaveOpeningBalanceInput,
  LeavePolicyFilters,
  LeavePolicyInput,
  LeavePolicyUpdateInput,
  LeavePolicyPreviewInput,
  LeaveRequestFilters,
  LeaveRequestInput,
  LeaveRequestRecord,
  LeaveRequestUpdateInput,
  LeaveTypeFilters,
  LeaveTypePolicyRuleUpdateInput,
  LeaveTypeUpdateInput,
} from "./leave.types";
import { createAuditLog } from "../../services/audit.service";
import { safeNotifyResolvedRecipients } from "../../services/notification.service";
import * as permissionService from "../../services/permission.service";
import { broadcastEvent } from "../../services/realtime.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import {
  AppError,
  ConflictError,
  LockedRecordError,
  NotFoundError,
  OutletAccessError,
  PermissionError,
  ValidationError,
} from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  page_size: pageSize,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

const scope = (context: AuthActor) => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

const ensureAudit = async (
  env: Env,
  context: AuthActor,
  input: {
    module?: string;
    action: string;
    entityType: string;
    entityId: string;
    employeeId?: string;
    outletId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: input.module ?? "leave",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) {
    throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
  }
};

const broadcast = async (env: Env, context: AuthActor, type: string, payload: Record<string, unknown>) =>
  broadcastEvent(env, {
    roomName: `company:${context.companyId}`,
    type,
    payload,
    triggeredBy: context.actorUserId,
  }).catch((error) => console.error("Leave realtime event failed", error));

const notifyLeaveEvent = (
  env: Env,
  context: AuthActor,
  event: string,
  request: Pick<LeaveRequestRecord, "id" | "employee_id" | "start_date" | "end_date" | "total_days" | "created_by"> & { outlet_id?: string | null },
  input: { title: string; message: string; priority?: "low" | "normal" | "high" | "urgent"; targetUserIds?: Array<string | null | undefined>; targetPermissionKeys?: string[]; targetRoleKeys?: string[] },
) =>
  safeNotifyResolvedRecipients(
    env,
    context.companyId,
    {
      userIds: input.targetUserIds?.filter((value): value is string => Boolean(value)),
      permissionKeys: input.targetPermissionKeys,
      roleKeys: input.targetRoleKeys,
      outletId: request.outlet_id,
      fallbackToAdmins: true,
    },
    {
      notification_type: event,
      category: "leave",
      priority: input.priority ?? "normal",
      title: input.title,
      message: input.message,
      action_url: `/leave?tab=approval-history&request_id=${encodeURIComponent(request.id)}`,
      action_label: "Open leave request",
      entity_type: "leave_request",
      entity_id: request.id,
      event_key: event,
      idempotency_key: `${event}:${request.id}`,
      outlet_id: request.outlet_id,
      recipient_employee_id: request.employee_id,
      metadata: {
        employee_id: request.employee_id,
        start_date: request.start_date,
        end_date: request.end_date,
        total_days: request.total_days,
      },
    },
    { actorId: context.actorUserId, excludeActor: true, requestId: context.requestId },
  );

const ensureEmployeeAccess = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return employee;
};

const assertEmployeeCanUseLeave = (employee: Awaited<ReturnType<typeof ensureEmployeeAccess>>) => {
  if (employee.deleted_at || ["archived", "resigned", "terminated", "retired", "inactive"].includes(employee.employment_status)) {
    throw new ConflictError("This employee cannot create a new leave request.");
  }
};

const LEAVE_CREATE_FOR_OTHERS_PERMISSIONS = [
  "leave.requests.create_for_employee",
  "approvals.requests.createForOthers",
];

const LEAVE_SUBMIT_FOR_OTHERS_PERMISSIONS = [
  ...LEAVE_CREATE_FOR_OTHERS_PERMISSIONS,
];

const LEAVE_CANCEL_FOR_OTHERS_PERMISSIONS = [
  "leave.requests.cancel_any",
  "leave.requests.override",
  "approvals.requests.cancelAny",
];

const LEAVE_GLOBAL_VIEW_PERMISSIONS = [
  "leave.requests.view_all",
  "leave.approvals.view",
  "leave.manage_balances",
  "leave.requests.create_for_employee",
  "approvals.requests.view",
];

const LEAVE_DEPARTMENT_VIEW_PERMISSIONS = [
  "approvals.department.view",
  "approvals.department.approve",
  "approvals.department.reject",
];

const LEAVE_HR_FINAL_VIEW_PERMISSIONS = [
  "approvals.hrFinal.view",
  "approvals.hrFinal.approve",
  "approvals.hrFinal.reject",
];

const LEAVE_FINANCE_FINAL_VIEW_PERMISSIONS = [
  "approvals.financeFinal.view",
  "approvals.financeFinal.approve",
  "approvals.financeFinal.reject",
];

const actorLeaveEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);

const isActiveLeaveEmployee = (employee: Awaited<ReturnType<typeof actorLeaveEmployee>> | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["archived", "resigned", "terminated", "retired", "inactive"].includes(employee.employment_status));

const hasLeaveGlobalView = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) || permissionService.hasAnyPermission(context, LEAVE_GLOBAL_VIEW_PERMISSIONS);

const hasLeaveCreateForOthers = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) || permissionService.hasAnyPermission(context, LEAVE_CREATE_FOR_OTHERS_PERMISSIONS);

export const canCreateLeaveForEmployee = async (env: Env, context: AuthActor, employeeId: string) => {
  if (hasLeaveCreateForOthers(context)) return true;
  const employee = await actorLeaveEmployee(env, context);
  return Boolean(isActiveLeaveEmployee(employee) && employee?.id === employeeId);
};

export const assertLeaveRequestSubjectAllowed = async (env: Env, context: AuthActor, employeeId: string) => {
  if (await canCreateLeaveForEmployee(env, context, employeeId)) return;
  const employee = await actorLeaveEmployee(env, context);
  if (!isActiveLeaveEmployee(employee)) {
    throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.");
  }
  throw new PermissionError("You can only create leave requests for your own employee profile.");
};

export const buildLeaveRequestVisibilityFilter = async (env: Env, context: AuthActor): Promise<repository.LeaveRequestVisibilityFilter> => {
  if (hasLeaveGlobalView(context)) return { values: [] };
  const clauses: string[] = [];
  const values: unknown[] = [];
  const employee = await actorLeaveEmployee(env, context);

  if (isActiveLeaveEmployee(employee)) {
    clauses.push("r.employee_id = ?");
    values.push(employee!.id);
  }

  if (isActiveLeaveEmployee(employee) && employee?.department_id && permissionService.hasAnyPermission(context, LEAVE_DEPARTMENT_VIEW_PERMISSIONS)) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM approval_requests ar
        JOIN approval_request_steps s ON s.company_id = ar.company_id AND s.approval_request_id = ar.id
       WHERE ar.company_id = r.company_id
         AND ar.operation_type = 'LEAVE_REQUEST'
         AND ar.subject_type = 'LEAVE_REQUEST'
         AND ar.subject_id = r.id
         AND ar.department_id = ?
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND (s.assigned_approver_user_id IS NULL OR s.assigned_approver_user_id = ?)
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    )`);
    values.push(employee.department_id, context.actorUserId, employee.level ?? 0, employee.level ?? 99);
  }

  if (permissionService.hasAnyPermission(context, LEAVE_HR_FINAL_VIEW_PERMISSIONS)) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM approval_requests ar
        JOIN approval_request_steps s ON s.company_id = ar.company_id AND s.approval_request_id = ar.id
       WHERE ar.company_id = r.company_id
         AND ar.operation_type = 'LEAVE_REQUEST'
         AND ar.subject_type = 'LEAVE_REQUEST'
         AND ar.subject_id = r.id
         AND s.approver_resolver_type = 'HR_FINAL_APPROVER'
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }

  if (permissionService.hasAnyPermission(context, LEAVE_FINANCE_FINAL_VIEW_PERMISSIONS)) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM approval_requests ar
        JOIN approval_request_steps s ON s.company_id = ar.company_id AND s.approval_request_id = ar.id
       WHERE ar.company_id = r.company_id
         AND ar.operation_type = 'LEAVE_REQUEST'
         AND ar.subject_type = 'LEAVE_REQUEST'
         AND ar.subject_id = r.id
         AND s.approver_resolver_type = 'FINANCE_FINAL_APPROVER'
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }

  return clauses.length > 0 ? { extra: `(${clauses.join(" OR ")})`, values } : { extra: "1 = 0", values: [] };
};

export const canViewLeaveRequest = async (env: Env, context: AuthActor, request: LeaveRequestRecord) => {
  if (hasLeaveGlobalView(context)) return true;
  const employee = await actorLeaveEmployee(env, context);
  if (isActiveLeaveEmployee(employee) && employee?.id === request.employee_id) return true;
  const engineApproval = await findLeaveEngineApproval(env, context, request);
  if (!engineApproval) return false;
  try {
    await approvalEngineService.getTimeline(env, context, engineApproval.id);
    return true;
  } catch (error) {
    if (error instanceof PermissionError || (error instanceof AppError && error.statusCode === 403)) return false;
    throw error;
  }
};

const assertLeaveRequestOwnerOrDelegate = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
  action: "submit" | "cancel" | "withdraw",
) => {
  const employee = await actorLeaveEmployee(env, context);
  const ownsRequest = isActiveLeaveEmployee(employee) && employee?.id === request.employee_id;
  if (ownsRequest) return;
  if (permissionService.isSuperAdmin(context)) return;
  const permissions = action === "submit" ? LEAVE_SUBMIT_FOR_OTHERS_PERMISSIONS : LEAVE_CANCEL_FOR_OTHERS_PERMISSIONS;
  if (permissionService.hasAnyPermission(context, permissions)) return;
  throw new PermissionError(`You can only ${action} leave requests for your own employee profile.`);
};

const assertPayrollUnlocked = async (
  env: Env,
  companyId: string,
  startDate: string,
  endDate: string,
  message = "This leave affects a locked payroll period.",
) => {
  for (const month of calendarService.listMonthsBetween(startDate, endDate)) {
    const payrollRun = await repository.findPayrollRunForMonth(env, companyId, month);
    if (payrollRun && LOCKED_PAYROLL_STATUSES.includes(payrollRun.status as any)) {
      throw new LockedRecordError(message);
    }
  }
};

const getExcludeHolidaysSetting = async (env: Env, companyId: string) => {
  const settings = await repository.getHolidaySettings(env, companyId);
  if (!settings) {
    return {
      excludeHolidays: false,
      enabledHolidayTypes: ["public", "company", "other"],
      outletSpecificEnabled: true,
    };
  }
  if (
    settings.holiday_module_enabled !== 1 ||
    settings.holiday_leave_rules_enabled !== 1 ||
    settings.exclude_holidays_from_leave !== 1
  ) {
    return {
      excludeHolidays: false,
      enabledHolidayTypes: ["public", "company", "other"],
      outletSpecificEnabled: settings.outlet_specific_holidays_enabled === 1,
    };
  }

  const enabledHolidayTypes: string[] = [];
  if (settings.public_holidays_enabled === 1) enabledHolidayTypes.push("public");
  if (settings.company_holidays_enabled === 1) enabledHolidayTypes.push("company");
  if (settings.other_holidays_enabled === 1) enabledHolidayTypes.push("other");
  return {
    excludeHolidays: true,
    enabledHolidayTypes,
    outletSpecificEnabled: settings.outlet_specific_holidays_enabled === 1,
  };
};

const validateRequestBusinessRules = async (
  env: Env,
  context: AuthActor,
  input: LeaveRequestInput,
  excludeRequestId?: string,
  options: { skipBalanceAvailabilityCheck?: boolean } = {},
) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  assertEmployeeCanUseLeave(employee);
  const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  if (leaveType.is_enabled !== 1) {
    throw new AppError("This leave type is currently disabled.", "LEAVE_TYPE_DISABLED", 400);
  }
  const holidaySettings = await holidayService.getHolidaySettings(env, context.companyId);
  const holidayImpact = await holidayCalculation.calculateLeaveWorkingDays(
    env,
    context.companyId,
    employee.id,
    input.start_date,
    input.end_date,
    leaveType.id,
    { isPaidLeave: leaveType.is_paid === 1, settings: holidaySettings },
  );
  const totalDays = holidayImpact.days;
  if (totalDays <= 0) throw new ValidationError("Total leave days must be greater than zero.");
  const overlap = await repository.findOverlappingRequest(env, context.companyId, employee.id, input.start_date, input.end_date, excludeRequestId);
  if (overlap) {
    throw new ConflictError("This employee already has a leave request overlapping this date range.");
  }
  const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, input.start_date);
  if (policyService.shouldCheckBalance(leaveType) && !options.skipBalanceAvailabilityCheck) {
    const balance = await balanceService.initializeBalanceIfNeeded(
      env,
      context.companyId,
      employee,
      leaveType.id,
      Number(input.start_date.slice(0, 4)),
      policy,
      leaveType,
    );
    balanceService.assertSufficientBalance(balance, totalDays, policy, leaveType);
  }
  if (leaveType.affects_payroll === 1) {
    await assertPayrollUnlocked(env, context.companyId, input.start_date, input.end_date);
  }
  return { employee, leaveType, policy, totalDays, holidayImpact };
};

const buildLeaveApprovalWorkflowIfRequired = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
  requiresApproval: boolean,
  options: { existingApprovalRequestId?: string | null } = {},
) => {
  if (!requiresApproval) return { approvalRequestId: null, approvalRequest: null, steps: [] as LeaveApprovalStepRecord[] };

  const workflow = await repository.findApprovalWorkflow(env, context.companyId, "leave_request");
  if (!workflow || workflow.is_enabled !== 1) {
    throw new ConflictError("Approval workflow is not configured for leave requests.");
  }

  const approvalRequestId = options.existingApprovalRequestId ?? createPrefixedId("approval_req");
  const approvalRequest = options.existingApprovalRequestId ? null : {
    id: approvalRequestId,
    companyId: context.companyId,
    workflowId: workflow.id,
    module: "leave",
    entityType: "leave_request",
    entityId: request.id,
    employeeId: request.employee_id,
    requestedBy: context.actorUserId,
    summary: "Leave request needs approval.",
    payloadJson: JSON.stringify({
      leave_request_id: request.id,
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      start_date: request.start_date,
      end_date: request.end_date,
      total_days: request.total_days,
    }),
  };
  const workflowSteps = await repository.listWorkflowSteps(env, context.companyId, workflow.id);
  const configuredSteps = workflowSteps.length > 0
    ? workflowSteps
    : [{ step_order: 1, approver_role_key: "hr_admin", required_permission_key: "leave.approvals.approve", approval_type: "single" }];
  const timestamp = nowIso();
  const steps: LeaveApprovalStepRecord[] = configuredSteps.map((step) => ({
    id: createPrefixedId("leave_step"),
    company_id: context.companyId,
    leave_request_id: request.id,
    step_order: step.step_order,
    approver_type: step.approver_role_key ? "role" : "super_admin_fallback",
    approver_user_id: null,
    approver_role_id: null,
    approver_role_key: step.approver_role_key,
    required_permission_key: step.required_permission_key ?? "leave.approvals.approve",
    status: "pending",
    decision_by: null,
    decision_at: null,
    decision_note: null,
    delegated_to: null,
    delegated_by: null,
    delegated_at: null,
    due_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  return { approvalRequestId, approvalRequest, steps };
};

const approvalRequestSync = (
  request: LeaveRequestRecord,
  status: string,
  currentStep?: number | null,
) =>
  request.approval_request_id
    ? { id: request.approval_request_id, status, current_step: currentStep ?? null }
    : null;

const LEAVE_APPROVAL_OPERATION = "LEAVE_REQUEST" as const;
const LEAVE_APPROVAL_SUBJECT_TYPE = "LEAVE_REQUEST";

const approvalStatusFromEngine = (status?: string | null) => {
  if (!status) return "pending";
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED") return "approved";
  if (normalized === "REJECTED") return "rejected";
  if (normalized === "CANCELLED") return "cancelled";
  if (normalized === "DRAFT") return "draft";
  if (normalized === "NEEDS_MANUAL_ASSIGNMENT") return "needs_manual_assignment";
  if (normalized === "ESCALATED") return "escalated";
  return "pending";
};

type LeaveApprovalEngineSnapshot = {
  id: string;
  status?: string | null;
  current_step_id?: string | null;
  current_step_name?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
};

const leaveSnapshotFromEngine = (approval: LeaveApprovalEngineSnapshot | null | undefined): Partial<LeaveRequestRecord> => ({
  approval_request_id: approval?.id ?? null,
  approval_status: approvalStatusFromEngine(approval?.status),
  approval_current_step: approval?.current_step_name ?? approval?.current_step_id ?? null,
  approval_submitted_at: approval?.submitted_at ?? null,
  approval_completed_at: approval?.completed_at ?? approval?.approved_at ?? approval?.rejected_at ?? approval?.cancelled_at ?? null,
});

const hasSupportingDocument = (input: Pick<LeaveRequestInput, "supporting_document_id" | "supporting_document_attached">) =>
  Boolean(input.supporting_document_attached || input.supporting_document_id);

const policySnapshotJson = (policyPreview: unknown) => JSON.stringify(policyPreview);

const createLeaveEngineApprovalDraft = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
) =>
  approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: LEAVE_APPROVAL_OPERATION,
    subject_type: LEAVE_APPROVAL_SUBJECT_TYPE,
    subject_id: request.id,
    requester_employee_id: request.employee_id,
    subject_employee_id: request.employee_id,
    title: `Leave request ${request.start_date} to ${request.end_date}`,
    summary: `Leave request for ${request.total_days} day${request.total_days === 1 ? "" : "s"}.`,
    payload_json: {
      leave_request_id: request.id,
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      start_date: request.start_date,
      end_date: request.end_date,
      total_days: request.total_days,
      affects_payroll: request.affects_payroll,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "leave.requests.create_for_employee",
    moduleOperationType: LEAVE_APPROVAL_OPERATION,
  });

const submitLeaveEngineApproval = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
) => {
  const existing = await repository.findEngineApprovalRequestForLeave(env, context.companyId, request.id, request.approval_request_id);
  const draft = existing ?? await createLeaveEngineApprovalDraft(env, context, request);
  if (!draft) throw new ConflictError("Approval workflow is not configured for leave requests.");
  if (draft.status === "DRAFT") {
    return approvalEngineService.submitApprovalRequest(env, context, draft.id);
  }
  return draft;
};

const findLeaveEngineApproval = (env: Env, context: AuthActor, request: LeaveRequestRecord) =>
  repository.findEngineApprovalRequestForLeave(env, context.companyId, request.id, request.approval_request_id);

const leaveTimelineSnapshotFromEngine = async (
  env: Env,
  context: AuthActor,
  approvalRequestId: string,
): Promise<Partial<LeaveRequestRecord>> => {
  const timeline = await approvalEngineService.getTimeline(env, context, approvalRequestId);
  const departmentStep = timeline.steps.find(
    (step) =>
      step.status === "APPROVED" &&
      ["DEPARTMENT_HEAD", "DEPARTMENT_LEVEL", "DEPARTMENT_ROLE"].includes(step.approver_resolver_type),
  );
  const hrStep = timeline.steps.find((step) => step.status === "APPROVED" && step.approver_resolver_type === "HR_FINAL_APPROVER");
  return {
    approval_current_step: timeline.request.current_step_name ?? timeline.request.current_step_id ?? null,
    ...(departmentStep ? {
      department_approved_at: departmentStep.approved_at ?? null,
      department_approved_by: departmentStep.assigned_approver_user_id ?? context.actorUserId,
    } : {}),
    ...(hrStep ? {
      hr_approved_at: hrStep.approved_at ?? null,
      hr_approved_by: hrStep.assigned_approver_user_id ?? context.actorUserId,
    } : {}),
  };
};

const assertLongLeaveImpactMonthsUnlocked = async (env: Env, companyId: string, rows: Array<{ payroll_month: string }>) => {
  for (const row of rows) {
    const payrollRun = await longLeaveRepository.findPayrollRunForMonth(env, companyId, row.payroll_month);
    if (payrollRun && LOCKED_PAYROLL_STATUSES.includes(payrollRun.status as any)) {
      throw new LockedRecordError("This long leave affects a locked payroll period.");
    }
  }
};

const upsertLongLeaveImpactPreview = async (
  env: Env,
  record: Awaited<ReturnType<typeof longLeaveRepository.findLongLeaveByLeaveRequestId>>,
) => {
  if (!record) return;
  const rows = await longLeaveCalculator.calculateLongLeaveSalaryImpact(env, record);
  await assertLongLeaveImpactMonthsUnlocked(env, record.company_id, rows);
  for (const row of rows) {
    const existing = await longLeaveRepository.findImpactByMonth(env, record.company_id, record.id, row.payroll_month);
    await longLeaveRepository.upsertImpact(env, {
      id: existing?.id ?? createPrefixedId("long_leave_impact"),
      company_id: record.company_id,
      employee_id: record.employee_id,
      long_leave_record_id: record.id,
      payroll_month: row.payroll_month,
      monthly_salary_amount: row.monthly_salary_amount,
      salary_calculation_days: row.salary_calculation_days,
      worked_days: row.worked_days,
      long_leave_days: row.long_leave_days,
      daily_salary_amount: row.daily_salary_amount,
      estimated_payable_amount: row.estimated_payable_amount,
      final_payable_amount: existing?.final_payable_amount ?? null,
      override_amount: existing?.override_amount ?? null,
      override_reason: existing?.override_reason ?? null,
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso(),
    });
  }
};

const ensureLongLeaveForRequest = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
  employee: Awaited<ReturnType<typeof ensureEmployeeAccess>>,
) => {
  const settings = await longLeaveRepository.getLongLeaveSettings(env, context.companyId);
  const triggerDays = settings?.trigger_days ?? 30;
  const longLeaveEnabled = await settingsService.isFeatureEnabled(env, context.companyId, "long_leave", context);
  if (!longLeaveEnabled || request.total_days < triggerDays) {
    return null;
  }

  const existing = await longLeaveRepository.findLongLeaveByLeaveRequestId(env, context.companyId, request.id);
  if (existing) {
    await upsertLongLeaveImpactPreview(env, existing);
    return existing;
  }

  const record = {
    id: createPrefixedId("long_leave"),
    company_id: context.companyId,
    employee_id: request.employee_id,
    leave_request_id: request.id,
    start_date: request.start_date,
    expected_return_date: request.end_date,
    actual_return_date: null,
    total_days: Math.trunc(request.total_days),
    status: "pending",
    salary_impact_confirmed: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  await longLeaveRepository.createLongLeave(env, record);
  const requiresApproval = await settingsService.shouldRequireApproval(env, context.companyId, "long_leave_request", context);
  if (requiresApproval) {
    const workflow = await longLeaveRepository.findApprovalWorkflow(env, context.companyId, "long_leave_request");
    if (!workflow || workflow.is_enabled !== 1) {
      throw new ConflictError("Approval workflow is not configured for long leave requests.");
    }
    await longLeaveRepository.createApprovalRequest(env, {
      id: createPrefixedId("approval_req"),
      companyId: context.companyId,
      workflowId: workflow.id,
      module: "long_leave",
      entityType: "long_leave_record",
      entityId: record.id,
      employeeId: record.employee_id,
      requestedBy: context.actorUserId,
      summary: "Long leave request needs approval.",
      payloadJson: JSON.stringify({
        long_leave_record_id: record.id,
        leave_request_id: request.id,
        employee_id: record.employee_id,
        start_date: record.start_date,
        expected_return_date: record.expected_return_date,
        total_days: record.total_days,
      }),
    });
  }
  await upsertLongLeaveImpactPreview(env, record);
  await ensureAudit(env, context, {
    module: "long_leave",
    action: "long_leave_created",
    entityType: "long_leave_record",
    entityId: record.id,
    employeeId: record.employee_id,
    outletId: employee.primary_outlet_id,
    newValue: record,
    reason: request.reason,
  });
  return record;
};

export const listLeaveTypes = async (env: Env, context: AuthActor, filters: LeaveTypeFilters): Promise<LeaveListResult<any>> => {
  const total = await repository.countLeaveTypes(env, context.companyId, filters);
  return {
    rows: await repository.listLeaveTypes(env, context.companyId, filters),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const updateLeaveType = async (env: Env, context: AuthActor, id: string, input: LeaveTypeUpdateInput) => {
  const existing = await repository.findLeaveType(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Leave type could not be found.");
  if (
    existing.is_statutory === 1 &&
    input.is_enabled !== undefined &&
    !permissionService.hasPermission(context, "leave_types.enable_disable_statutory")
  ) {
    throw new PermissionError("You do not have permission to enable or disable statutory leave types.");
  }
  const update = {
    is_enabled: input.is_enabled === undefined ? undefined : input.is_enabled ? 1 : 0,
    is_paid: input.is_paid === undefined ? undefined : input.is_paid ? 1 : 0,
    default_days: input.default_days,
    requires_attachment: input.requires_attachment === undefined ? undefined : input.requires_attachment ? 1 : 0,
    affects_payroll: input.affects_payroll === undefined ? undefined : input.affects_payroll ? 1 : 0,
    requires_balance: input.requires_balance === undefined ? undefined : input.requires_balance ? 1 : 0,
    allow_negative_balance: input.allow_negative_balance === undefined ? undefined : input.allow_negative_balance ? 1 : 0,
    max_negative_balance: input.max_negative_balance,
    accrual_enabled: input.accrual_enabled === undefined ? undefined : input.accrual_enabled ? 1 : 0,
    accrual_frequency: input.accrual_frequency,
    annual_entitlement_days: input.annual_entitlement_days,
    accrual_amount: input.accrual_amount,
    prorate_on_joining: input.prorate_on_joining === undefined ? undefined : input.prorate_on_joining ? 1 : 0,
    prorate_on_termination: input.prorate_on_termination === undefined ? undefined : input.prorate_on_termination ? 1 : 0,
    carry_forward_enabled: input.carry_forward_enabled === undefined ? undefined : input.carry_forward_enabled ? 1 : 0,
    carry_forward_limit_days: input.carry_forward_limit_days,
    carry_forward_expiry_month: input.carry_forward_expiry_month,
    carry_forward_expiry_day: input.carry_forward_expiry_day,
    half_day_enabled: input.half_day_enabled === undefined ? undefined : input.half_day_enabled ? 1 : 0,
    sort_order: input.sort_order,
  };
  await repository.updateLeaveType(env, context.companyId, id, update);
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.typeUpdated,
    entityType: "leave_type",
    entityId: id,
    oldValue: existing,
    newValue: update,
    reason: input.reason,
  });
  return { updated: true };
};

export const listPolicies = async (env: Env, context: AuthActor, filters: LeavePolicyFilters): Promise<LeaveListResult<any>> => {
  const total = await repository.countPolicies(env, context.companyId, filters);
  return {
    rows: await repository.listPolicies(env, context.companyId, filters),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const createPolicy = async (env: Env, context: AuthActor, input: LeavePolicyInput) => {
  const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  const id = createPrefixedId("leave_policy");
  await repository.createPolicy(env, id, context.companyId, input);
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.policyCreated,
    entityType: "leave_policy",
    entityId: id,
    newValue: input,
    reason: input.reason,
  });
  return { policy: await repository.findPolicy(env, context.companyId, id) };
};

export const updatePolicy = async (env: Env, context: AuthActor, id: string, input: LeavePolicyUpdateInput) => {
  const existing = await repository.findPolicy(env, context.companyId, id);
  if (!existing) throw new NotFoundError("Leave policy could not be found.");
  if (input.leave_type_id) {
    const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
    if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  }
  await repository.updatePolicy(env, context.companyId, id, input);
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.policyUpdated,
    entityType: "leave_policy",
    entityId: id,
    oldValue: existing,
    newValue: input,
    reason: input.reason,
  });
  return { updated: true };
};

export const listBalances = async (env: Env, context: AuthActor, filters: LeaveBalanceFilters): Promise<LeaveListResult<any>> => {
  const total = await repository.countBalances(env, context.companyId, filters, scope(context));
  return {
    rows: await repository.listBalances(env, context.companyId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getEmployeeBalances = async (env: Env, context: AuthActor, employeeId: string) => {
  await ensureEmployeeAccess(env, context, employeeId);
  return repository.listEmployeeBalances(env, context.companyId, employeeId);
};

export const adjustBalance = async (env: Env, context: AuthActor, employeeId: string, input: LeaveBalanceAdjustInput) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, `${input.year}-01-01`);
  const existing = await balanceService.initializeBalanceIfNeeded(env, context.companyId, employee, input.leave_type_id, input.year, policy, leaveType);
  const result = await balanceService.addManualAdjustment(env, {
    balance: existing,
    leaveType,
    policy,
    adjustmentDays: input.adjustment_days,
    reason: input.reason,
    effectiveDate: `${input.year}-01-01`,
    actorId: context.actorUserId,
  });
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.balanceAdjusted,
    entityType: "leave_balance",
    entityId: existing.id,
    employeeId: employee.id,
    outletId: employee.primary_outlet_id,
    oldValue: existing,
    newValue: result.balance,
    reason: input.reason,
  });
  return { updated: true, balance: result.balance, transaction: result.transaction };
};

export const setOpeningBalance = async (env: Env, context: AuthActor, input: LeaveOpeningBalanceInput) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, `${input.year}-01-01`);
  const balance = await balanceService.initializeBalanceIfNeeded(env, context.companyId, employee, leaveType.id, input.year, policy, leaveType);
  const result = await balanceService.setOpeningBalance(env, {
    balance,
    leaveType,
    policy,
    openingBalance: input.opening_balance,
    reason: input.reason,
    effectiveDate: `${input.year}-01-01`,
    actorId: context.actorUserId,
  });
  await ensureAudit(env, context, {
    action: "leave_opening_balance_set",
    entityType: "leave_balance",
    entityId: balance.id,
    employeeId: employee.id,
    outletId: employee.primary_outlet_id,
    oldValue: balance,
    newValue: result.balance,
    reason: input.reason,
  });
  return { balance: result.balance, transaction: result.transaction };
};

export const listBalanceTransactions = async (
  env: Env,
  context: AuthActor,
  filters: LeaveBalanceTransactionFilters,
): Promise<LeaveListResult<any>> => {
  await ensureEmployeeAccess(env, context, filters.employee_id);
  const total = await repository.countBalanceTransactions(env, context.companyId, filters, scope(context));
  return {
    rows: await repository.listBalanceTransactions(env, context.companyId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const previewAccrual = (env: Env, context: AuthActor, input: LeaveAccrualInput) =>
  accrualService.previewCompanyAccrual(env, context, input);

export const applyAccrual = (env: Env, context: AuthActor, input: LeaveAccrualInput) =>
  accrualService.applyCompanyAccrual(env, context, input);

export const applyCarryForward = async (env: Env, context: AuthActor, input: LeaveCarryForwardInput) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  if ((leaveType.carry_forward_enabled ?? 0) !== 1) {
    return { applied: false, skipped_reason: "Carry-forward is not enabled for this leave type." };
  }
  const sourceBalance = await repository.findBalance(env, context.companyId, employee.id, leaveType.id, input.source_year);
  if (!sourceBalance) throw new NotFoundError("Leave balance could not be found.");
  const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, `${input.source_year}-12-31`);
  const destinationBalance = await balanceService.initializeBalanceIfNeeded(env, context.companyId, employee, leaveType.id, input.destination_year, policy, leaveType);
  const unused = Math.max(0, balanceService.availableDays(sourceBalance));
  const amount = Math.min(unused, Number(leaveType.carry_forward_limit_days ?? policy?.carry_forward_days ?? unused));
  const result = await balanceService.applyCarryForward(env, {
    sourceBalance,
    destinationBalance,
    leaveType,
    policy,
    amount,
    sourceYear: input.source_year,
    destinationYear: input.destination_year,
    reason: input.reason,
    actorId: context.actorUserId,
  });
  await ensureAudit(env, context, {
    action: "leave_carry_forward_applied",
    entityType: "leave_balance",
    entityId: destinationBalance.id,
    employeeId: employee.id,
    outletId: employee.primary_outlet_id,
    newValue: result,
    reason: input.reason,
  });
  return result;
};

export const applyExpiry = async (env: Env, context: AuthActor, input: LeaveExpiryInput) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, input.effective_date);
  const balance = await balanceService.initializeBalanceIfNeeded(env, context.companyId, employee, leaveType.id, input.year, policy, leaveType);
  const result = await balanceService.applyExpiry(env, {
    balance,
    leaveType,
    policy,
    amount: input.expiry_days,
    effectiveDate: input.effective_date,
    reason: input.reason,
    actorId: context.actorUserId,
  });
  await ensureAudit(env, context, {
    action: "leave_expired",
    entityType: "leave_balance",
    entityId: balance.id,
    employeeId: employee.id,
    outletId: employee.primary_outlet_id,
    newValue: result,
    reason: input.reason,
  });
  return result;
};

export const rebuildEmployeeLeaveBalances = async (env: Env, context: AuthActor, employeeId: string, year: number) => {
  const employee = await ensureEmployeeAccess(env, context, employeeId);
  const balances = await repository.listEmployeeBalances(env, context.companyId, employeeId);
  const rebuilt = [];

  for (const existing of balances.filter((row) => Number(row.year) === Number(year))) {
    const leaveType = await repository.findLeaveType(env, context.companyId, existing.leave_type_id);
    if (!leaveType) continue;
    const transactions = await repository.listBalanceTransactionsForRebuild(env, context.companyId, employeeId, existing.leave_type_id, year);
    const aggregate = transactions.reduce(
      (state, transaction) => {
        const quantity = Number(transaction.quantity_days ?? 0);
        switch (transaction.transaction_type) {
          case "opening_balance":
            state.opening_balance += quantity;
            break;
          case "accrual":
            state.accrued_days += quantity;
            break;
          case "request_reserved":
            state.pending_days += Math.abs(quantity);
            break;
          case "request_released":
            state.pending_days = Math.max(0, state.pending_days - Math.abs(quantity));
            break;
          case "leave_used":
            state.pending_days = Math.max(0, state.pending_days - Math.abs(quantity));
            state.used_days += Math.abs(quantity);
            break;
          case "manual_adjustment":
          case "correction":
            state.adjusted_days += quantity;
            break;
          case "carry_forward":
            state.carried_forward_days += quantity;
            break;
          case "expiry":
            state.expired_days += Math.abs(quantity);
            break;
          case "reversal":
            state.used_days = Math.max(0, state.used_days - Math.abs(quantity));
            break;
        }
        return state;
      },
      {
        opening_balance: 0,
        accrued_days: 0,
        used_days: 0,
        pending_days: 0,
        adjusted_days: 0,
        carried_forward_days: 0,
        expired_days: 0,
      },
    );
    const next = balanceService.normalizeBalance({
      ...existing,
      ...aggregate,
      updated_at: nowIso(),
    });
    await repository.upsertBalance(env, next);
    rebuilt.push({ leave_type_id: existing.leave_type_id, balance_id: existing.id, transactions: transactions.length, balance: next });
  }

  await ensureAudit(env, context, {
    action: "leave_balance_rebuild_applied",
    entityType: "leave_balance",
    entityId: `${employeeId}:${year}`,
    employeeId,
    outletId: employee.primary_outlet_id,
    newValue: { year, rebuilt: rebuilt.length },
    reason: "Rebuilt from immutable leave balance transaction ledger.",
  });
  return { rebuilt: true, employee_id: employeeId, year, rows: rebuilt };
};

export const listRequests = async (env: Env, context: AuthActor, filters: LeaveRequestFilters): Promise<LeaveListResult<any>> => {
  const visibility = await buildLeaveRequestVisibilityFilter(env, context);
  const total = await repository.countRequests(env, context.companyId, filters, scope(context), visibility);
  return {
    rows: await repository.listRequests(env, context.companyId, filters, scope(context), visibility),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const listLeaveTypePolicyRules = async (env: Env, context: AuthActor) => {
  if (!permissionService.hasAnyPermission(context, ["leave.settings.view", "leave_settings.view", "leave.settings.manage", "leave_settings.manage", "leave.view"])) {
    throw new PermissionError("You do not have permission to view leave policy rules.");
  }
  return { rows: await repository.listLeaveTypePolicyRules(env, context.companyId) };
};

export const updateLeaveTypePolicyRule = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: LeaveTypePolicyRuleUpdateInput,
) => {
  if (!permissionService.hasAnyPermission(context, ["leave.settings.manage", "leave_settings.manage", "leave_policy_rules.manage", "leave_policy_limits.edit"])) {
    throw new PermissionError("You do not have permission to manage leave policy rules.");
  }
  const before = (await repository.listLeaveTypePolicyRules(env, context.companyId)).find((rule) => rule.id === id);
  if (!before) throw new NotFoundError("Leave policy rule could not be found.");
  const normalizedInput: LeaveTypePolicyRuleUpdateInput = {
    ...input,
    document_requirement: input.document_required_mode ?? input.document_requirement,
    document_required_mode: input.document_required_mode ?? input.document_requirement,
    document_after_days: input.document_required_after_consecutive_days ?? input.document_after_days,
    document_required_after_consecutive_days: input.document_required_after_consecutive_days ?? input.document_after_days,
    document_after_used_days: input.document_required_after_used_days ?? input.document_after_used_days,
    document_required_after_used_days: input.document_required_after_used_days ?? input.document_after_used_days,
    deduction_component_keys_json: input.deduction_pay_component_keys ?? input.deduction_component_keys_json,
    deduction_pay_component_keys: input.deduction_pay_component_keys ?? input.deduction_component_keys_json,
    updated_by: context.actorUserId,
  };
  await repository.updateLeaveTypePolicyRule(env, context.companyId, id, normalizedInput);
  const after = (await repository.listLeaveTypePolicyRules(env, context.companyId)).find((rule) => rule.id === id);
  await ensureAudit(env, context, {
    action: "leave_policy_rule_updated",
    entityType: "leave_type_policy_rule",
    entityId: id,
    oldValue: before,
    newValue: after,
    reason: input.reason,
  });
  return { updated: true, policy_rule: after };
};

export const resetLeaveTypePolicyRule = async (
  env: Env,
  context: AuthActor,
  id: string,
  input: { reason?: string | null },
) => {
  if (!permissionService.hasAnyPermission(context, ["leave.settings.manage", "leave_settings.manage", "leave_policy_rules.manage", "leave_policy_limits.edit"])) {
    throw new PermissionError("You do not have permission to manage leave policy rules.");
  }
  const before = (await repository.listLeaveTypePolicyRules(env, context.companyId)).find((rule) => rule.id === id);
  if (!before) throw new NotFoundError("Leave policy rule could not be found.");
  const leaveType = await repository.findLeaveType(env, context.companyId, before.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  const defaults = policyService.defaultPolicyRuleForLeaveType(leaveType);
  const asBoolean = (value: boolean | number | null | undefined) => value === true || value === 1;
  await repository.updateLeaveTypePolicyRule(env, context.companyId, id, {
    annual_entitlement_days: defaults.annual_entitlement_days,
    paid_status: defaults.paid_status as LeaveTypePolicyRuleUpdateInput["paid_status"],
    paid_percentage: defaults.paid_percentage,
    payroll_impact_enabled: asBoolean(defaults.payroll_impact_enabled),
    document_requirement: defaults.document_requirement as LeaveTypePolicyRuleUpdateInput["document_requirement"],
    document_required_mode: defaults.document_required_mode as LeaveTypePolicyRuleUpdateInput["document_required_mode"],
    document_after_days: defaults.document_after_days,
    document_required_after_consecutive_days: defaults.document_required_after_consecutive_days,
    document_after_used_days: defaults.document_after_used_days,
    document_required_after_used_days: defaults.document_required_after_used_days,
    allow_no_document_until_used_days: defaults.allow_no_document_until_used_days,
    require_document_for_backdated_request: asBoolean(defaults.require_document_for_backdated_request),
    require_document_for_extension: asBoolean(defaults.require_document_for_extension),
    approval_required: asBoolean(defaults.approval_required),
    approval_workflow_key: defaults.approval_workflow_key,
    salary_deduction_enabled: asBoolean(defaults.salary_deduction_enabled),
    deduction_mode: defaults.deduction_mode,
    deduction_component: defaults.deduction_component,
    deduction_component_keys_json: defaults.deduction_component_keys_json,
    deduction_pay_component_keys: defaults.deduction_pay_component_keys,
    deduction_daily_rate_method: defaults.deduction_daily_rate_method,
    deduction_custom_divisor: defaults.deduction_custom_divisor,
    payroll_source_label: defaults.payroll_source_label,
    allow_half_day: asBoolean(defaults.allow_half_day),
    allow_carry_forward: asBoolean(defaults.allow_carry_forward),
    carry_forward_limit_days: defaults.carry_forward_limit_days,
    reset_period: defaults.reset_period,
    count_weekends: asBoolean(defaults.count_weekends),
    count_public_holidays: asBoolean(defaults.count_public_holidays),
    notes: defaults.notes,
    is_enabled: asBoolean(defaults.is_enabled),
    updated_by: context.actorUserId,
    reason: input.reason ?? "Reset leave policy rule to default.",
  });
  const after = (await repository.listLeaveTypePolicyRules(env, context.companyId)).find((rule) => rule.id === id);
  await ensureAudit(env, context, {
    action: "leave_policy_rule_reset_to_default",
    entityType: "leave_type_policy_rule",
    entityId: id,
    oldValue: before,
    newValue: after,
    reason: input.reason,
  });
  return { reset: true, policy_rule: after };
};

export const previewLeavePolicy = async (env: Env, context: AuthActor, input: LeavePolicyPreviewInput) => {
  await assertLeaveRequestSubjectAllowed(env, context, input.employee_id);
  return { policy_preview: await policyService.evaluateLeavePolicy(env, context.companyId, input) };
};

export const getRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequest(env, context.companyId, id);
  if (!request) throw new NotFoundError("Leave request could not be found.");
  if (!await canViewLeaveRequest(env, context, request)) {
    if (!permissionService.hasOutletAccess(context, request.outlet_id)) {
      throw new OutletAccessError("You do not have access to this employee's outlet.");
    }
    throw new PermissionError("You do not have permission to view this leave request.");
  }
  return request;
};

const planRequestBalanceForCreation = async (
  env: Env,
  context: AuthActor,
  validated: Awaited<ReturnType<typeof validateRequestBusinessRules>>,
  request: LeaveRequestRecord,
) => {
  if (!policyService.shouldCheckBalance(validated.leaveType)) return null;
  const balance = await balanceService.initializeBalanceIfNeeded(
    env,
    context.companyId,
    validated.employee,
    validated.leaveType.id,
    Number(request.start_date.slice(0, 4)),
    validated.policy,
    validated.leaveType,
  );
  if (["approved", "direct_approved"].includes(request.status)) {
    return balanceService.planBalanceTransaction({
      balance,
      leaveType: validated.leaveType,
      policy: validated.policy,
      type: "leave_used",
      quantityDays: -request.total_days,
      effectiveDate: request.start_date,
      source: "leave_request",
      reason: request.reason ?? "Direct-approved leave request.",
      leaveRequestId: request.id,
      idempotencyKey: `leave_request:${request.id}:used`,
      createdBy: context.actorUserId,
      mutate: (current) => ({
        ...current,
        pending_days: Math.max(0, (current.pending_days ?? 0) - request.total_days),
        used_days: current.used_days + request.total_days,
      }),
    });
  }
  if (["pending", "pending_approval", "submitted", "partially_approved"].includes(request.status)) {
    return balanceService.planBalanceTransaction({
      balance,
      leaveType: validated.leaveType,
      policy: validated.policy,
      type: "request_reserved",
      quantityDays: request.total_days,
      effectiveDate: request.start_date,
      source: "leave_request",
      reason: request.reason,
      leaveRequestId: request.id,
      idempotencyKey: `leave_request:${request.id}:reserved`,
      createdBy: context.actorUserId,
      mutate: (current) => ({ ...current, pending_days: (current.pending_days ?? 0) + request.total_days }),
    });
  }
  return null;
};

const pendingRequestBalanceChanged = (existing: LeaveRequestRecord, next: LeaveRequestRecord) =>
  existing.leave_type_id !== next.leave_type_id ||
  existing.start_date !== next.start_date ||
  existing.end_date !== next.end_date ||
  Number(existing.total_days) !== Number(next.total_days);

const planPendingRequestUpdateRebalance = async (
  env: Env,
  context: AuthActor,
  existing: LeaveRequestRecord,
  next: LeaveRequestRecord,
  validated: Awaited<ReturnType<typeof validateRequestBusinessRules>>,
  reason: string,
) => {
  if (!["pending", "pending_approval", "submitted", "partially_approved"].includes(existing.status) || !pendingRequestBalanceChanged(existing, next)) return [];
  const entries: repository.LeaveBalanceBatchEntry[] = [];
  const oldLeaveType = await repository.findLeaveType(env, context.companyId, existing.leave_type_id);
  const oldEmployee = await ensureEmployeeAccess(env, context, existing.employee_id);
  const oldPolicy = oldLeaveType
    ? await policyService.findApplicablePolicy(env, context.companyId, oldEmployee, oldLeaveType.id, existing.start_date)
    : null;
  const oldBalance = oldLeaveType && policyService.shouldCheckBalance(oldLeaveType)
    ? await repository.findBalance(env, context.companyId, existing.employee_id, existing.leave_type_id, Number(existing.start_date.slice(0, 4)))
    : null;
  const changeKey = `${existing.leave_type_id}:${existing.start_date}:${existing.end_date}:${existing.total_days}->${next.leave_type_id}:${next.start_date}:${next.end_date}:${next.total_days}`;

  if (oldLeaveType && oldBalance) {
    entries.push(balanceService.planBalanceTransaction({
      balance: oldBalance,
      leaveType: oldLeaveType,
      policy: oldPolicy,
      type: "request_released",
      quantityDays: existing.total_days,
      effectiveDate: existing.start_date,
      source: "leave_request",
      reason,
      leaveRequestId: existing.id,
      idempotencyKey: `leave_request:${existing.id}:update:${changeKey}:released_old`,
      createdBy: context.actorUserId,
      mutate: (current) => ({ ...current, pending_days: Math.max(0, (current.pending_days ?? 0) - existing.total_days) }),
    }));
  }

  if (!policyService.shouldCheckBalance(validated.leaveType)) return entries;
  const nextBalance = await balanceService.initializeBalanceIfNeeded(
    env,
    context.companyId,
    validated.employee,
    validated.leaveType.id,
    Number(next.start_date.slice(0, 4)),
    validated.policy,
    validated.leaveType,
  );
  entries.push(balanceService.planBalanceTransaction({
    balance: nextBalance,
    leaveType: validated.leaveType,
    policy: validated.policy,
    type: "request_reserved",
    quantityDays: next.total_days,
    effectiveDate: next.start_date,
    source: "leave_request",
    reason: next.reason,
    leaveRequestId: next.id,
    idempotencyKey: `leave_request:${existing.id}:update:${changeKey}:reserved_new`,
    createdBy: context.actorUserId,
    mutate: (current) => ({ ...current, pending_days: (current.pending_days ?? 0) + next.total_days }),
  }));
  return entries;
};

export const createRequest = async (env: Env, context: AuthActor, input: LeaveRequestInput) => {
  const validated = await validateRequestBusinessRules(env, context, input);
  await assertLeaveRequestSubjectAllowed(env, context, validated.employee.id);
  const requiresApproval = await settingsService.shouldRequireApproval(env, context.companyId, "leave_request", context);
  const canDirectApprove =
    !requiresApproval &&
    permissionService.isAdminOrSuperAdmin(context) &&
    permissionService.hasPermission(context, "leave.approve");
  const policyPreview = await policyService.evaluateLeavePolicy(env, context.companyId, {
    ...input,
    total_days: validated.totalDays,
  });
  const missingRequiredDocument = policyPreview.document_required && !hasSupportingDocument(input);
  const status = missingRequiredDocument ? "pending_document" : canDirectApprove ? "direct_approved" : requiresApproval ? "pending_approval" : "approved";
  const id = createPrefixedId("leave_req");
  const timestamp = nowIso();
  const request: LeaveRequestRecord = {
    id,
    company_id: context.companyId,
    employee_id: input.employee_id,
    leave_type_id: input.leave_type_id,
    start_date: input.start_date,
    end_date: input.end_date,
    total_days: validated.totalDays,
    reason: input.reason ?? null,
    status,
    created_by: context.actorUserId,
    approval_request_id: null,
    approval_status: missingRequiredDocument ? "pending_document" : canDirectApprove || !requiresApproval ? "approved" : "pending",
    submitted_at: timestamp,
    submitted_by: context.actorUserId,
    approved_at: !missingRequiredDocument && (canDirectApprove || !requiresApproval) ? timestamp : null,
    approved_by: !missingRequiredDocument && (canDirectApprove || !requiresApproval) ? context.actorUserId : null,
    rejected_at: null,
    rejected_by: null,
    cancelled_at: null,
    cancelled_by: null,
    withdrawn_at: null,
    withdrawn_by: null,
    decision_reason: null,
    affects_payroll: policyPreview.salary_deduction_required ? 1 : validated.leaveType.affects_payroll,
    document_required: policyPreview.document_required ? 1 : 0,
    document_status: policyPreview.document_required ? hasSupportingDocument(input) ? "submitted" : "missing" : "not_required",
    document_required_reason: policyPreview.document_reason,
    policy_rule_id: policyPreview.rule_id,
    policy_snapshot_json: policySnapshotJson(policyPreview),
    created_at: timestamp,
    updated_at: timestamp,
  };
  const engineApproval = !missingRequiredDocument && requiresApproval ? await submitLeaveEngineApproval(env, context, request) : null;
  if (engineApproval) {
    Object.assign(request, leaveSnapshotFromEngine(engineApproval));
  }
  const balanceEntry = await planRequestBalanceForCreation(env, context, validated, request);
  if (balanceEntry) {
    await repository.createLeaveRequestWithBalanceTransaction(env, request, balanceEntry);
  } else {
    await repository.createRequest(env, request);
  }
  const longLeaveRecord = await ensureLongLeaveForRequest(env, context, request, validated.employee);
  await ensureAudit(env, context, {
    action: requiresApproval ? LEAVE_AUDIT_ACTIONS.requestSubmitted : LEAVE_AUDIT_ACTIONS.requestCreated,
    entityType: "leave_request",
    entityId: id,
    employeeId: input.employee_id,
    outletId: validated.employee.primary_outlet_id,
    newValue: request,
    reason: input.reason,
  });
  await broadcast(env, context, !missingRequiredDocument && requiresApproval ? "leave.request_submitted" : "leave.request_created", { id, employee_id: input.employee_id, status });
  if (!missingRequiredDocument && requiresApproval) {
    void notifyLeaveEvent(env, context, "leave_request_submitted", request, {
      title: "Leave request needs approval",
      message: "A leave request has been submitted and is waiting for review.",
      priority: "high",
      targetPermissionKeys: ["leave.approvals.approve"],
      targetRoleKeys: ["hr_admin", "admin"],
    });
  } else if (status === "approved" || status === "direct_approved") {
    void notifyLeaveEvent(env, context, "leave_request_auto_approved", request, {
      title: "Leave request approved",
      message: "Your leave request was approved.",
      targetUserIds: [request.created_by],
    });
  }
  return {
    leave_request: await repository.findRequest(env, context.companyId, id),
    policy_preview: policyPreview,
    long_leave_required: Boolean(longLeaveRecord),
    long_leave_record_id: longLeaveRecord?.id,
  };
};

export const updateRequest = async (env: Env, context: AuthActor, id: string, input: LeaveRequestUpdateInput) => {
  const existing = await getRequest(env, context, id);
  if (!["pending", "pending_approval", "submitted", "partially_approved", "returned_for_more_info", "pending_document"].includes(existing.status)) {
    throw new ConflictError("Approved, rejected, or cancelled leave requests must use the proper action endpoint.");
  }
  const nextInput: LeaveRequestInput = {
    employee_id: existing.employee_id,
    leave_type_id: input.leave_type_id ?? existing.leave_type_id,
    start_date: input.start_date ?? existing.start_date,
    end_date: input.end_date ?? existing.end_date,
    reason: input.reason ?? existing.reason,
    supporting_document_id: input.supporting_document_id,
    supporting_document_attached: input.supporting_document_attached,
  };
  if ((input.start_date || input.end_date || input.leave_type_id) && !input.reason) {
    throw new ValidationError("A reason is required for this leave change.");
  }
  const validated = await validateRequestBusinessRules(env, context, nextInput, id);
  const policyPreview = await policyService.evaluateLeavePolicy(env, context.companyId, {
    ...nextInput,
    total_days: validated.totalDays,
    exclude_request_id: id,
  });
  const documentSubmitted = hasSupportingDocument(nextInput) || existing.document_status === "submitted" || existing.document_status === "approved";
  const missingRequiredDocument = policyPreview.document_required && !documentSubmitted;
  const updatedRequest: LeaveRequestRecord = {
    ...existing,
    leave_type_id: nextInput.leave_type_id,
    start_date: nextInput.start_date,
    end_date: nextInput.end_date,
    total_days: validated.totalDays,
    reason: nextInput.reason ?? null,
    status: missingRequiredDocument ? "pending_document" : existing.status,
    approval_status: missingRequiredDocument ? "pending_document" : existing.approval_status,
    affects_payroll: policyPreview.salary_deduction_required ? 1 : validated.leaveType.affects_payroll,
    document_required: policyPreview.document_required ? 1 : 0,
    document_status: policyPreview.document_required ? documentSubmitted ? "submitted" : "missing" : "not_required",
    document_required_reason: policyPreview.document_reason,
    policy_rule_id: policyPreview.rule_id,
    policy_snapshot_json: policySnapshotJson(policyPreview),
    updated_at: nowIso(),
  };
  const rebalanceEntries = await planPendingRequestUpdateRebalance(env, context, existing, updatedRequest, validated, input.reason ?? "Leave request updated.");
  const requestUpdate = {
    status: updatedRequest.status,
    approval_status: updatedRequest.approval_status,
    leave_type_id: nextInput.leave_type_id,
    start_date: nextInput.start_date,
    end_date: nextInput.end_date,
    total_days: validated.totalDays,
    reason: nextInput.reason ?? null,
    affects_payroll: policyPreview.salary_deduction_required ? 1 : validated.leaveType.affects_payroll,
    document_required: updatedRequest.document_required,
    document_status: updatedRequest.document_status,
    document_required_reason: updatedRequest.document_required_reason,
    policy_rule_id: updatedRequest.policy_rule_id,
    policy_snapshot_json: updatedRequest.policy_snapshot_json,
  };
  if (rebalanceEntries.length > 0) {
    await repository.updatePendingLeaveRequestWithRebalance(env, context.companyId, id, requestUpdate, rebalanceEntries);
  } else {
    await repository.updateRequest(env, context.companyId, id, {
      ...requestUpdate,
    });
  }
  const longLeaveRecord = await ensureLongLeaveForRequest(
    env,
    context,
    updatedRequest,
    validated.employee,
  );
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.requestUpdated,
    entityType: "leave_request",
    entityId: id,
    employeeId: existing.employee_id,
    outletId: existing.outlet_id,
    oldValue: existing,
    newValue: nextInput,
    reason: input.reason,
  });
  return {
    updated: true,
    policy_preview: policyPreview,
    long_leave_required: Boolean(longLeaveRecord),
    long_leave_record_id: longLeaveRecord?.id,
  };
};

export const submitRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  await assertLeaveRequestOwnerOrDelegate(env, context, request, "submit");
  if (["pending", "pending_approval", "partially_approved"].includes(request.status)) {
    const existingEngineApproval = await findLeaveEngineApproval(env, context, request);
    if (existingEngineApproval) {
      return {
        submitted: true,
        already_submitted: true,
        already_applied: true,
        approval_request_id: existingEngineApproval.id,
        approval_status: approvalStatusFromEngine(existingEngineApproval.status),
        approval_current_step: existingEngineApproval.current_step_name ?? existingEngineApproval.current_step_id ?? null,
      };
    }
    const existingSteps = await repository.countApprovalSteps(env, context.companyId, id);
    if (existingSteps > 0 || request.status === "partially_approved") {
      return { submitted: true, already_submitted: true, already_applied: true };
    }
  }
  if (!["draft", "submitted", "returned_for_more_info", "pending_document"].includes(request.status)) {
    throw new AppError("This leave request cannot be submitted.", "LEAVE_APPROVAL_INVALID_TRANSITION", 409);
  }
  const validated = await validateRequestBusinessRules(env, context, {
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    start_date: request.start_date,
    end_date: request.end_date,
    reason: request.reason,
  }, id);
  const policyPreview = await policyService.evaluateLeavePolicy(env, context.companyId, {
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    start_date: request.start_date,
    end_date: request.end_date,
    reason: request.reason,
    total_days: validated.totalDays,
    exclude_request_id: id,
  });
  const documentSubmitted = request.document_status === "submitted" || request.document_status === "approved";
  if (policyPreview.document_required && !documentSubmitted) {
    await repository.updateRequest(env, context.companyId, id, {
      status: "pending_document",
      approval_status: "pending_document",
      document_required: 1,
      document_status: "missing",
      document_required_reason: policyPreview.document_reason,
      policy_rule_id: policyPreview.rule_id,
      policy_snapshot_json: policySnapshotJson(policyPreview),
      affects_payroll: policyPreview.salary_deduction_required ? 1 : validated.leaveType.affects_payroll,
    });
    throw new AppError(
      "Supporting document is required for this leave request because it exceeds the configured policy threshold.",
      "LEAVE_DOCUMENT_REQUIRED",
      400,
    );
  }
  const requiresApproval = await settingsService.shouldRequireApproval(env, context.companyId, "leave_request", context);
  const submittedAt = nowIso();
  const nextRequest: LeaveRequestRecord = {
    ...request,
    total_days: validated.totalDays,
    status: requiresApproval ? "pending_approval" : "approved",
    approval_status: requiresApproval ? "pending" : "approved",
    submitted_at: submittedAt,
    submitted_by: context.actorUserId,
    approved_at: requiresApproval ? request.approved_at ?? null : submittedAt,
    approved_by: requiresApproval ? request.approved_by ?? null : context.actorUserId,
    decision_reason: input.reason,
    affects_payroll: policyPreview.salary_deduction_required ? 1 : validated.leaveType.affects_payroll,
    document_required: policyPreview.document_required ? 1 : 0,
    document_status: policyPreview.document_required ? "submitted" : "not_required",
    document_required_reason: policyPreview.document_reason,
    policy_rule_id: policyPreview.rule_id,
    policy_snapshot_json: policySnapshotJson(policyPreview),
    updated_at: submittedAt,
  };
  const engineApproval = requiresApproval ? await submitLeaveEngineApproval(env, context, nextRequest) : null;
  if (engineApproval) {
    Object.assign(nextRequest, leaveSnapshotFromEngine(engineApproval));
  }
  const idempotencyKey = requiresApproval ? `leave_request:${request.id}:reserved` : `leave_request:${request.id}:used`;
  const existingBalanceTransaction = await repository.findTransactionByIdempotencyKey(env, context.companyId, idempotencyKey);
  const balanceEntry = existingBalanceTransaction ? null : await planRequestBalanceForCreation(env, context, validated, nextRequest);
  const requestValues = {
    status: nextRequest.status,
    approval_request_id: nextRequest.approval_request_id,
    approval_status: nextRequest.approval_status,
    approval_current_step: nextRequest.approval_current_step ?? null,
    approval_submitted_at: nextRequest.approval_submitted_at ?? submittedAt,
    approval_completed_at: nextRequest.approval_completed_at ?? null,
    submitted_at: submittedAt,
    submitted_by: context.actorUserId,
    approved_at: nextRequest.approved_at,
    approved_by: nextRequest.approved_by,
    decision_reason: input.reason,
    total_days: validated.totalDays,
    affects_payroll: policyPreview.salary_deduction_required ? 1 : validated.leaveType.affects_payroll,
    document_required: nextRequest.document_required,
    document_status: nextRequest.document_status,
    document_required_reason: nextRequest.document_required_reason,
    policy_rule_id: nextRequest.policy_rule_id,
    policy_snapshot_json: nextRequest.policy_snapshot_json,
  };
  if (requiresApproval) {
    if (balanceEntry) {
      await repository.updateLeaveRequestStatusWithBalanceTransaction(env, context.companyId, id, requestValues, balanceEntry, null);
    } else {
      await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, null);
    }
  } else if (balanceEntry) {
    await repository.updateLeaveRequestStatusWithBalanceTransaction(
      env,
      context.companyId,
      id,
      requestValues,
      balanceEntry,
      approvalRequestSync(nextRequest, "approved", null),
    );
  } else {
    await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, approvalRequestSync(nextRequest, "approved", null));
  }
  await ensureAudit(env, context, {
    action: requiresApproval ? LEAVE_AUDIT_ACTIONS.requestSubmitted : LEAVE_AUDIT_ACTIONS.requestAutoApproved,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    oldValue: request,
    newValue: { status: nextRequest.status, approval_request_id: nextRequest.approval_request_id },
    reason: input.reason,
  });
  void notifyLeaveEvent(env, context, requiresApproval ? "leave_request_submitted" : "leave_request_auto_approved", nextRequest, requiresApproval
    ? {
        title: "Leave request needs approval",
        message: "A leave request has been submitted and is waiting for review.",
        priority: "high",
        targetPermissionKeys: ["leave.approvals.approve"],
        targetRoleKeys: ["hr_admin", "admin"],
      }
    : {
        title: "Leave request approved",
        message: "Your leave request was approved.",
        targetUserIds: [request.created_by],
      });
  return { submitted: true, auto_approved: !requiresApproval };
};

const pendingStatuses = ["pending", "pending_approval", "submitted", "partially_approved"];

export const assertApprovalStepActionable = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
  reason: string,
) => {
  if (!pendingStatuses.includes(request.status)) {
    throw new AppError("This leave request is not pending approval.", "LEAVE_APPROVAL_INVALID_TRANSITION", 409);
  }
  const isSuperAdminOverride = permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, "leave.approvals.override");
  if (request.created_by === context.actorUserId && !isSuperAdminOverride) {
    throw new AppError("You cannot approve your own leave request.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  if (isSuperAdminOverride && !reason?.trim()) {
    throw new AppError("A reason is required for Super Admin approval override.", "LEAVE_APPROVAL_REASON_REQUIRED", 400);
  }
  const actor = await repository.findUser(env, context.companyId, context.actorUserId);
  if (actor && (actor.status !== "active" || actor.is_active === 0)) {
    throw new AppError("Inactive users cannot approve leave requests.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  const currentStep = await repository.findCurrentApprovalStep(env, context.companyId, request.id);
  if (!currentStep) {
    if (isSuperAdminOverride || permissionService.hasPermission(context, "leave.requests.override")) {
      return null;
    }
    throw new AppError("There is no pending approval step for this request.", "LEAVE_APPROVAL_STEP_NOT_PENDING", 409);
  }
  const delegated = currentStep.delegated_to === context.actorUserId;
  if (currentStep.delegated_to && !delegated && !isSuperAdminOverride) {
    throw new AppError("Only the delegated approver can act on this approval step.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  const assigned = currentStep.approver_user_id === context.actorUserId;
  if (currentStep.approver_user_id && !assigned && !delegated && !isSuperAdminOverride) {
    throw new AppError("Only the assigned approver can act on this approval step.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  const employee = await ensureEmployeeAccess(env, context, request.employee_id);
  const hasRoleKey = currentStep.approver_role_key
    ? context.roleKeys.includes(currentStep.approver_role_key) &&
      await repository.actorHasRoleKey(env, context.companyId, context.actorUserId, currentStep.approver_role_key)
    : true;
  if (currentStep.approver_role_key && !hasRoleKey && !delegated && !assigned && !isSuperAdminOverride) {
    throw new AppError("Your role is not authorized for this approval step.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  if (["manager", "direct_manager"].includes(currentStep.approver_type) && !context.roleKeys.includes("manager") && !assigned && !delegated && !isSuperAdminOverride) {
    throw new AppError("Only the employee's manager can approve this step.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  if (currentStep.approver_type === "outlet_manager" && (!context.roleKeys.includes("outlet_manager") || !permissionService.hasOutletAccess(context, employee.primary_outlet_id)) && !assigned && !delegated && !isSuperAdminOverride) {
    throw new AppError("Outlet managers can only approve employees in their outlet scope.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  if (currentStep.approver_type === "department_manager" && !context.roleKeys.includes("department_manager") && !assigned && !delegated && !isSuperAdminOverride) {
    throw new AppError("Department managers can only approve employees in their department scope.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  const hasRequiredPermission = currentStep.required_permission_key
    ? permissionService.hasPermission(context, currentStep.required_permission_key)
    : permissionService.hasAnyPermission(context, ["leave.approvals.approve", "leave.approve"]);
  if (!delegated && !assigned && !hasRequiredPermission && !isSuperAdminOverride) {
    throw new AppError("You are not authorized to approve this leave request.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  return currentStep;
};

const planReleasePendingBalance = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
  reason: string,
  idempotencySuffix: string,
) => {
  const leaveType = await repository.findLeaveType(env, context.companyId, request.leave_type_id);
  if (!leaveType || !policyService.shouldCheckBalance(leaveType)) return null;
  const employee = await ensureEmployeeAccess(env, context, request.employee_id);
  const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, request.start_date);
  const balance = await repository.findBalance(env, context.companyId, request.employee_id, request.leave_type_id, Number(request.start_date.slice(0, 4)));
  if (!balance) return null;
  return balanceService.planBalanceTransaction({
    balance,
    leaveType,
    policy,
    type: "request_released",
    quantityDays: request.total_days,
    effectiveDate: request.start_date,
    source: "leave_request",
    reason,
    leaveRequestId: request.id,
    idempotencyKey: `leave_request:${request.id}:${idempotencySuffix}`,
    createdBy: context.actorUserId,
    mutate: (current) => ({ ...current, pending_days: Math.max(0, (current.pending_days ?? 0) - request.total_days) }),
  });
};

export const approveRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  if (["approved", "direct_approved", "finalized", "taken"].includes(request.status)) {
    return { approved: true, already_applied: true };
  }
  const engineApprovalLink = await findLeaveEngineApproval(env, context, request);
  if (engineApprovalLink) {
    const validated = await validateRequestBusinessRules(env, context, {
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      start_date: request.start_date,
      end_date: request.end_date,
      reason: request.reason,
    }, id, { skipBalanceAvailabilityCheck: true });
    const longLeaveRecord = await ensureLongLeaveForRequest(env, context, request, validated.employee);
    const engineApproval = await approvalEngineService.approveStep(env, context, engineApprovalLink.id, input.reason, { allowModuleBoundAction: true });
    const isFinalApproval = engineApproval?.status === "APPROVED";
    let entry: repository.LeaveBalanceBatchEntry | null = null;
    if (isFinalApproval && policyService.shouldCheckBalance(validated.leaveType)) {
      const balanceBeforeApproval = await balanceService.initializeBalanceIfNeeded(
        env,
        context.companyId,
        validated.employee,
        validated.leaveType.id,
        Number(request.start_date.slice(0, 4)),
        validated.policy,
        validated.leaveType,
      );
      entry = balanceService.planBalanceTransaction({
        balance: balanceBeforeApproval,
        leaveType: validated.leaveType,
        policy: validated.policy,
        type: "leave_used",
        quantityDays: -request.total_days,
        effectiveDate: request.start_date,
        source: "leave_request",
        reason: input.reason,
        leaveRequestId: request.id,
        idempotencyKey: `leave_request:${request.id}:used`,
        createdBy: context.actorUserId,
        mutate: (current) => ({
          ...current,
          pending_days: Math.max(0, (current.pending_days ?? 0) - request.total_days),
          used_days: current.used_days + request.total_days,
        }),
      });
    }
    const approvedAt = nowIso();
    const engineSnapshot = {
      ...leaveSnapshotFromEngine(engineApproval),
      ...await leaveTimelineSnapshotFromEngine(env, context, engineApprovalLink.id),
    };
    const requestValues: Partial<LeaveRequestRecord> = isFinalApproval
      ? {
          status: "approved",
          approval_status: "approved",
          approved_at: approvedAt,
          approved_by: context.actorUserId,
          decision_reason: input.reason,
          ...engineSnapshot,
        }
      : {
          status: "partially_approved",
          approval_status: engineSnapshot.approval_status ?? approvalStatusFromEngine(engineApproval?.status),
          decision_reason: input.reason,
          ...engineSnapshot,
        };
    if (entry) {
      await repository.updateLeaveRequestStatusWithBalanceTransaction(env, context.companyId, id, requestValues, entry, null);
    } else {
      await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, null);
    }
    await ensureAudit(env, context, {
      action: isFinalApproval ? LEAVE_AUDIT_ACTIONS.approvalStepApproved : LEAVE_AUDIT_ACTIONS.approvalStepApproved,
      entityType: "leave_request",
      entityId: id,
      employeeId: request.employee_id,
      outletId: request.outlet_id,
      oldValue: request,
      newValue: { status: requestValues.status, approval_request_id: engineApprovalLink.id, approval_current_step: requestValues.approval_current_step },
      reason: input.reason,
    });
    await broadcast(env, context, isFinalApproval ? "leave.request_approved" : "leave.approval_step_approved", { id, employee_id: request.employee_id });
    void notifyLeaveEvent(env, context, isFinalApproval ? "leave_request_approved" : "leave_approval_assigned", request, isFinalApproval
      ? {
          title: "Leave request approved",
          message: "A leave request has been approved.",
          targetUserIds: [request.created_by],
        }
      : {
          title: "Leave approval moved to the next step",
          message: "A leave approval step was completed and the request is waiting for the next reviewer.",
          priority: "high",
          targetPermissionKeys: ["approvals.hrFinal.approve", "leave.approvals.approve"],
          targetRoleKeys: ["hr_admin", "admin"],
        });
    return {
      approved: isFinalApproval,
      partially_approved: !isFinalApproval,
      long_leave_required: Boolean(longLeaveRecord),
      long_leave_record_id: longLeaveRecord?.id,
    };
  }
  const currentStep = await assertApprovalStepActionable(env, context, request, input.reason);
  const validated = await validateRequestBusinessRules(env, context, {
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    start_date: request.start_date,
    end_date: request.end_date,
    reason: request.reason,
  }, id, { skipBalanceAvailabilityCheck: true });
  const longLeaveRecord = await ensureLongLeaveForRequest(env, context, request, validated.employee);
  const remainingSteps = currentStep ? await repository.countPendingApprovalSteps(env, context.companyId, request.id) : 1;
  const isFinalApproval = remainingSteps <= 1 || !currentStep;
  let entry: repository.LeaveBalanceBatchEntry | null = null;
  if (isFinalApproval && policyService.shouldCheckBalance(validated.leaveType)) {
    const balanceBeforeApproval = await balanceService.initializeBalanceIfNeeded(
      env,
      context.companyId,
      validated.employee,
      validated.leaveType.id,
      Number(request.start_date.slice(0, 4)),
      validated.policy,
      validated.leaveType,
    );
    entry = balanceService.planBalanceTransaction({
      balance: balanceBeforeApproval,
      leaveType: validated.leaveType,
      policy: validated.policy,
      type: "leave_used",
      quantityDays: -request.total_days,
      effectiveDate: request.start_date,
      source: "leave_request",
      reason: input.reason,
      leaveRequestId: request.id,
      idempotencyKey: `leave_request:${request.id}:used`,
      createdBy: context.actorUserId,
      mutate: (current) => ({
        ...current,
        pending_days: Math.max(0, (current.pending_days ?? 0) - request.total_days),
        used_days: current.used_days + request.total_days,
      }),
    });
  }
  const approvedAt = nowIso();
  const requestValues: Partial<LeaveRequestRecord> = isFinalApproval
    ? { status: "approved", approval_status: "approved", approved_at: approvedAt, approved_by: context.actorUserId, decision_reason: input.reason }
    : { status: "partially_approved", approval_status: "pending", decision_reason: input.reason };
  const genericApprovalUpdate = approvalRequestSync(
    request,
    isFinalApproval ? "approved" : "in_progress",
    isFinalApproval ? currentStep?.step_order ?? null : (currentStep?.step_order ?? 1) + 1,
  );
  if (currentStep) {
    await repository.updateLeaveApprovalStepAndRequestStatus(
      env,
      context.companyId,
      id,
      currentStep.id,
      { status: "approved", decision_by: context.actorUserId, decision_at: approvedAt, decision_note: input.reason },
      requestValues,
      entry,
      genericApprovalUpdate,
    );
  } else if (entry) {
    await repository.updateLeaveRequestStatusWithBalanceTransaction(env, context.companyId, id, requestValues, entry, genericApprovalUpdate);
  } else {
    await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, genericApprovalUpdate);
  }
  await ensureAudit(env, context, {
    action: currentStep ? LEAVE_AUDIT_ACTIONS.approvalStepApproved : LEAVE_AUDIT_ACTIONS.approvalOverride,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    oldValue: request,
    newValue: { status: requestValues.status, current_step_id: currentStep?.id },
    reason: input.reason,
  });
  if (genericApprovalUpdate) {
    await ensureAudit(env, context, {
      action: "leave_generic_approval_status_updated",
      entityType: "approval_request",
      entityId: genericApprovalUpdate.id,
      employeeId: request.employee_id,
      outletId: request.outlet_id,
      newValue: genericApprovalUpdate,
      reason: input.reason,
    });
  }
  await broadcast(env, context, isFinalApproval ? "leave.request_approved" : "leave.approval_step_approved", { id, employee_id: request.employee_id });
  void notifyLeaveEvent(env, context, isFinalApproval ? "leave_request_approved" : "leave_approval_assigned", request, isFinalApproval
    ? {
        title: "Leave request approved",
        message: "A leave request has been approved.",
        targetUserIds: [request.created_by],
      }
    : {
        title: "Leave approval moved to the next step",
        message: "A leave approval step was completed and the request is waiting for the next reviewer.",
        priority: "high",
        targetPermissionKeys: ["leave.approvals.approve"],
        targetRoleKeys: ["hr_admin", "admin"],
      });
  return {
    approved: isFinalApproval,
    partially_approved: !isFinalApproval,
    long_leave_required: Boolean(longLeaveRecord),
    long_leave_record_id: longLeaveRecord?.id,
  };
};

export const rejectRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  if (request.status === "rejected") return { rejected: true, already_applied: true };
  const engineApprovalLink = await findLeaveEngineApproval(env, context, request);
  if (engineApprovalLink) {
    const engineApproval = await approvalEngineService.rejectStep(env, context, engineApprovalLink.id, input.reason, input.reason, { allowModuleBoundAction: true });
    const entry = await planReleasePendingBalance(env, context, request, input.reason, "released");
    const rejectedAt = nowIso();
    const requestValues: Partial<LeaveRequestRecord> = {
      status: "rejected",
      approval_status: "rejected",
      rejected_at: rejectedAt,
      rejected_by: context.actorUserId,
      rejection_reason: input.reason,
      decision_reason: input.reason,
      ...leaveSnapshotFromEngine(engineApproval),
      ...await leaveTimelineSnapshotFromEngine(env, context, engineApprovalLink.id),
    };
    if (entry) {
      await repository.updateLeaveRequestStatusWithBalanceTransaction(env, context.companyId, id, requestValues, entry, null);
    } else {
      await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, null);
    }
    await ensureAudit(env, context, {
      action: LEAVE_AUDIT_ACTIONS.approvalStepRejected,
      entityType: "leave_request",
      entityId: id,
      employeeId: request.employee_id,
      outletId: request.outlet_id,
      oldValue: request,
      newValue: { status: "rejected", approval_request_id: engineApprovalLink.id },
      reason: input.reason,
    });
    await broadcast(env, context, "leave.request_rejected", { id, employee_id: request.employee_id });
    void notifyLeaveEvent(env, context, "leave_request_rejected", request, {
      title: "Leave request rejected",
      message: "A leave request was rejected. Open it to review the reason.",
      priority: "high",
      targetUserIds: [request.created_by],
    });
    return { rejected: true };
  }
  const currentStep = await assertApprovalStepActionable(env, context, request, input.reason);
  const entry = await planReleasePendingBalance(env, context, request, input.reason, "released");
  const rejectedAt = nowIso();
  const requestValues: Partial<LeaveRequestRecord> = {
    status: "rejected",
    approval_status: "rejected",
    rejected_at: rejectedAt,
    rejected_by: context.actorUserId,
    decision_reason: input.reason,
  };
  const genericApprovalUpdate = approvalRequestSync(request, "rejected", currentStep?.step_order ?? null);
  if (currentStep) {
    await repository.updateLeaveApprovalStepAndRequestStatus(
      env,
      context.companyId,
      id,
      currentStep.id,
      { status: "rejected", decision_by: context.actorUserId, decision_at: rejectedAt, decision_note: input.reason },
      requestValues,
      entry,
      genericApprovalUpdate,
    );
  } else if (entry) {
    await repository.updateLeaveRequestStatusWithBalanceTransaction(env, context.companyId, id, requestValues, entry, genericApprovalUpdate);
  } else {
    await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, genericApprovalUpdate);
  }
  await ensureAudit(env, context, {
    action: currentStep ? LEAVE_AUDIT_ACTIONS.approvalStepRejected : LEAVE_AUDIT_ACTIONS.requestRejected,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    oldValue: request,
    newValue: { status: "rejected" },
    reason: input.reason,
  });
  if (genericApprovalUpdate) {
    await ensureAudit(env, context, {
      action: "leave_generic_approval_status_updated",
      entityType: "approval_request",
      entityId: genericApprovalUpdate.id,
      employeeId: request.employee_id,
      outletId: request.outlet_id,
      newValue: genericApprovalUpdate,
      reason: input.reason,
    });
  }
  await broadcast(env, context, "leave.request_rejected", { id, employee_id: request.employee_id });
  void notifyLeaveEvent(env, context, "leave_request_rejected", request, {
    title: "Leave request rejected",
    message: "A leave request was rejected. Open it to review the reason.",
    priority: "high",
    targetUserIds: [request.created_by],
  });
  return { rejected: true };
};

export const cancelRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  await assertLeaveRequestOwnerOrDelegate(env, context, request, "cancel");
  if (request.affects_payroll === 1) {
    await assertPayrollUnlocked(env, context.companyId, request.start_date, request.end_date);
  }
  if (["cancelled", "withdrawn"].includes(request.status)) return { cancelled: true, already_applied: true };
  const engineApprovalLink = pendingStatuses.includes(request.status)
    ? await findLeaveEngineApproval(env, context, request)
    : null;
  const engineApproval = engineApprovalLink
    ? await approvalEngineService.cancelRequest(env, context, engineApprovalLink.id, input.reason, { allowModuleBoundAction: true })
    : null;
  let entry: repository.LeaveBalanceBatchEntry | null = null;
  if (["approved", "direct_approved"].includes(request.status)) {
    const employee = await ensureEmployeeAccess(env, context, request.employee_id);
    const balance = await repository.findBalance(env, context.companyId, request.employee_id, request.leave_type_id, Number(request.start_date.slice(0, 4)));
    const leaveType = await repository.findLeaveType(env, context.companyId, request.leave_type_id);
    const policy = leaveType ? await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, request.start_date) : null;
    if (balance && leaveType) {
      entry = balanceService.planBalanceTransaction({
        balance,
        leaveType,
        policy,
        type: "reversal",
        quantityDays: request.total_days,
        effectiveDate: request.start_date,
        source: "leave_request",
        reason: input.reason,
        leaveRequestId: request.id,
        idempotencyKey: `leave_request:${request.id}:cancel_used_reversal`,
        createdBy: context.actorUserId,
        mutate: (current) => ({ ...current, used_days: Math.max(0, current.used_days - request.total_days) }),
      });
    }
    void employee;
  } else if (pendingStatuses.includes(request.status)) {
    entry = await planReleasePendingBalance(env, context, request, input.reason, "released");
  }
  const cancelledAt = nowIso();
  const requestValues: Partial<LeaveRequestRecord> = {
    status: "cancelled",
    approval_status: "cancelled",
    cancelled_at: cancelledAt,
    cancelled_by: context.actorUserId,
    decision_reason: input.reason,
    ...(engineApproval ? leaveSnapshotFromEngine(engineApproval) : {}),
  };
  const genericApprovalUpdate = engineApprovalLink ? null : approvalRequestSync(request, "cancelled", null);
  if (entry) {
    await repository.updateLeaveRequestStatusWithBalanceTransaction(env, context.companyId, id, requestValues, entry, genericApprovalUpdate);
  } else {
    await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, genericApprovalUpdate);
  }
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.requestCancelled,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    oldValue: request,
    newValue: { status: "cancelled" },
    reason: input.reason,
  });
  if (genericApprovalUpdate) {
    await ensureAudit(env, context, {
      action: "leave_generic_approval_status_updated",
      entityType: "approval_request",
      entityId: genericApprovalUpdate.id,
      employeeId: request.employee_id,
      outletId: request.outlet_id,
      newValue: genericApprovalUpdate,
      reason: input.reason,
    });
  }
  await broadcast(env, context, "leave.request_cancelled", { id, employee_id: request.employee_id });
  void notifyLeaveEvent(env, context, "leave_request_cancelled", request, {
    title: "Leave request cancelled",
    message: "A leave request was cancelled.",
    targetUserIds: [request.created_by],
    targetPermissionKeys: ["leave.approvals.view"],
  });
  return { cancelled: true };
};

export const withdrawRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  await assertLeaveRequestOwnerOrDelegate(env, context, request, "withdraw");
  if (!pendingStatuses.includes(request.status)) {
    if (request.status === "withdrawn") return { withdrawn: true, already_applied: true };
    throw new AppError("Only pending leave requests can be withdrawn.", "LEAVE_APPROVAL_INVALID_TRANSITION", 409);
  }
  const employee = await actorLeaveEmployee(env, context);
  const ownsByEmployee = isActiveLeaveEmployee(employee) && employee?.id === request.employee_id;
  if (request.created_by !== context.actorUserId && !ownsByEmployee && !permissionService.hasAnyPermission(context, LEAVE_CANCEL_FOR_OTHERS_PERMISSIONS)) {
    throw new PermissionError("You do not have permission to withdraw this leave request.");
  }
  const engineApprovalLink = await findLeaveEngineApproval(env, context, request);
  const engineApproval = engineApprovalLink
    ? await approvalEngineService.cancelRequest(env, context, engineApprovalLink.id, input.reason, { allowModuleBoundAction: true })
    : null;
  const entry = await planReleasePendingBalance(env, context, request, input.reason, "withdrawn_released");
  const withdrawnAt = nowIso();
  const requestValues: Partial<LeaveRequestRecord> = {
    status: "withdrawn",
    approval_status: "withdrawn",
    withdrawn_at: withdrawnAt,
    withdrawn_by: context.actorUserId,
    decision_reason: input.reason,
    ...(engineApproval ? leaveSnapshotFromEngine(engineApproval) : {}),
  };
  const genericApprovalUpdate = engineApprovalLink ? null : approvalRequestSync(request, "withdrawn", null);
  if (entry) {
    await repository.updateLeaveRequestStatusWithBalanceTransaction(env, context.companyId, id, requestValues, entry, genericApprovalUpdate);
  } else {
    await repository.updateLeaveRequestStatus(env, context.companyId, id, requestValues, genericApprovalUpdate);
  }
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.requestWithdrawn,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    oldValue: request,
    newValue: requestValues,
    reason: input.reason,
  });
  if (genericApprovalUpdate) {
    await ensureAudit(env, context, {
      action: "leave_generic_approval_status_updated",
      entityType: "approval_request",
      entityId: genericApprovalUpdate.id,
      employeeId: request.employee_id,
      outletId: request.outlet_id,
      newValue: genericApprovalUpdate,
      reason: input.reason,
    });
  }
  await broadcast(env, context, "leave.request_withdrawn", { id, employee_id: request.employee_id });
  void notifyLeaveEvent(env, context, "leave_request_withdrawn", request, {
    title: "Leave request withdrawn",
    message: "A pending leave request was withdrawn.",
    targetPermissionKeys: ["leave.approvals.view"],
  });
  return { withdrawn: true };
};

export const listApprovalInbox = async (env: Env, context: AuthActor, filters: LeaveRequestFilters): Promise<LeaveListResult<any>> => {
  const enginePending = await approvalEngineService.getMyPending(env, context, {
    operation_type: LEAVE_APPROVAL_OPERATION,
    status: filters.approval_status,
    department_id: filters.department_id,
    search: undefined,
    page: filters.page,
    page_size: filters.page_size,
  });
  const leaveIds = enginePending.rows
    .map((row) => row.subject_id)
    .filter((id): id is string => Boolean(id));
  const leaveRows = await repository.listRequestsByIds(env, context.companyId, leaveIds);
  const byId = new Map(leaveRows.map((row) => [row.id, row]));
  const rows = enginePending.rows
    .map((approval) => {
      const leave = byId.get(approval.subject_id);
      if (!leave) return null;
      return {
        ...leave,
        approval_request_id: approval.id,
        approval_status: approvalStatusFromEngine(approval.status),
        approval_current_step: approval.current_step_name ?? approval.current_step_id ?? null,
        current_step_id: approval.current_step_id ?? null,
        current_step_order: null,
        approver_type: approval.current_step_name ?? "Approval step",
        required_permission_key: null,
        submitted_at: approval.submitted_at ?? leave.submitted_at,
      };
    })
    .filter(Boolean);
  return {
    rows,
    pagination: enginePending.pagination,
  };
};

export const listApprovalHistory = async (env: Env, context: AuthActor, filters: LeaveRequestFilters): Promise<LeaveListResult<any>> => {
  const visibility = await buildLeaveRequestVisibilityFilter(env, context);
  const total = await repository.countRequests(env, context.companyId, filters, scope(context), visibility);
  return {
    rows: await repository.listApprovalHistory(env, context.companyId, filters, scope(context), visibility),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getApprovalDetail = async (env: Env, context: AuthActor, requestId: string) => {
  const request = await getRequest(env, context, requestId);
  const steps = await repository.listApprovalSteps(env, context.companyId, requestId);
  const transactions = await repository.listLeaveRequestTransactions(env, context.companyId, requestId);
  const engineApproval = await findLeaveEngineApproval(env, context, request);
  const engineTimeline = engineApproval ? await approvalEngineService.getTimeline(env, context, engineApproval.id) : null;
  const genericApproval = !engineApproval && request.approval_request_id
    ? await repository.findGenericApprovalRequestByEntity(env, context.companyId, "leave_request", requestId)
    : null;
  const engineSteps: LeaveApprovalStepRecord[] = (engineTimeline?.steps ?? []).map((step) => ({
    id: step.id,
    company_id: step.company_id,
    leave_request_id: request.id,
    step_order: step.step_order,
    approver_type: step.approver_resolver_type,
    approver_user_id: step.assigned_approver_user_id,
    approver_role_id: step.required_role_id,
    approver_role_key: null,
    required_permission_key: step.required_permission,
    status: step.status.toLowerCase(),
    decision_by: step.assigned_approver_user_id,
    decision_at: step.approved_at ?? step.rejected_at ?? step.skipped_at ?? step.escalated_at,
    decision_note: step.fallback_applied,
    delegated_to: null,
    delegated_by: null,
    delegated_at: null,
    due_at: step.due_at,
    created_at: step.created_at,
    updated_at: step.updated_at,
  }));
  return {
    leave_request: request,
    generic_approval_request: engineTimeline
      ? {
          id: engineTimeline.request.id,
          status: approvalStatusFromEngine(engineTimeline.request.status),
          current_step: engineTimeline.request.current_step_name ?? engineTimeline.request.current_step_id,
        }
      : genericApproval,
    engine_approval_request: engineTimeline?.request ?? null,
    approval_steps: engineSteps.length > 0 ? engineSteps : steps,
    balance_transactions: transactions,
    holiday_impact: await (async () => {
      const leaveType = await repository.findLeaveType(env, context.companyId, request.leave_type_id).catch(() => null);
      const settings = await holidayService.getHolidaySettings(env, context.companyId).catch(() => null);
      if (!leaveType || !settings) return null;
      return holidayCalculation.calculateLeaveWorkingDays(
        env,
        context.companyId,
        request.employee_id,
        request.start_date,
        request.end_date,
        request.leave_type_id,
        { isPaidLeave: leaveType.is_paid === 1, settings },
      ).catch(() => null);
    })(),
    timeline: [
      { type: "request_created", at: request.created_at, by: request.created_by, note: request.reason },
      ...(genericApproval ? [{
        type: `generic_approval_${genericApproval.status}`,
        at: request.updated_at,
        by: request.submitted_by ?? request.created_by,
        note: `Generic approval request ${genericApproval.id} is ${genericApproval.status}.`,
        current_step: genericApproval.current_step,
      }] : []),
      ...(engineTimeline ? [{
        type: `approval_engine_${approvalStatusFromEngine(engineTimeline.request.status)}`,
        at: engineTimeline.request.updated_at,
        by: engineTimeline.request.requester_user_id,
        note: `Approval engine request ${engineTimeline.request.id} is ${engineTimeline.request.status}.`,
      }] : []),
      ...(engineSteps.length > 0 ? engineSteps : steps).map((step) => ({
        type: `approval_step_${step.status}`,
        at: step.decision_at ?? step.created_at,
        by: step.decision_by ?? step.delegated_to ?? step.approver_user_id,
        note: step.decision_note,
        step_order: step.step_order,
      })),
      ...(engineTimeline?.actions ?? []).map((action) => ({
        type: `approval_action_${action.action.toLowerCase()}`,
        at: action.created_at,
        by: action.actor_user_id,
        note: action.reason ?? action.comment,
      })),
      ...transactions.map((transaction) => ({
        type: `balance_${transaction.transaction_type}`,
        at: transaction.created_at,
        by: transaction.created_by,
        note: transaction.reason,
        quantity_days: transaction.quantity_days,
        balance_after: transaction.balance_after,
      })),
    ],
  };
};

export const delegateRequest = async (env: Env, context: AuthActor, id: string, input: LeaveDelegateInput) => {
  const request = await getRequest(env, context, id);
  const currentStep = await assertApprovalStepActionable(env, context, request, input.reason);
  if (!currentStep) throw new AppError("There is no approval step to delegate.", "LEAVE_APPROVAL_STEP_NOT_PENDING", 409);
  const target = await repository.findUser(env, context.companyId, input.delegated_to);
  if (!target || target.status !== "active" || target.is_active === 0) {
    throw new AppError("The delegated approver is not active in this company.", "LEAVE_APPROVER_NOT_AUTHORIZED", 403);
  }
  const delegatedAt = nowIso();
  await repository.updateLeaveApprovalStep(env, context.companyId, currentStep.id, {
    status: "delegated",
    delegated_to: target.id,
    delegated_by: context.actorUserId,
    delegated_at: delegatedAt,
    decision_note: input.reason,
  });
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.approvalDelegated,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    newValue: { step_id: currentStep.id, delegated_to: target.id },
    reason: input.reason,
  });
  await broadcast(env, context, "leave.approval_delegated", { id, delegated_to: target.id });
  void notifyLeaveEvent(env, context, "leave_approval_delegated", request, {
    title: "Leave approval delegated to you",
    message: "A leave approval has been delegated to you.",
    priority: "high",
    targetUserIds: [target.id],
  });
  return { delegated: true };
};

export const escalateRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  const currentStep = await repository.findCurrentApprovalStep(env, context.companyId, id);
  if (!currentStep) throw new AppError("There is no pending approval step to escalate.", "LEAVE_APPROVAL_STEP_NOT_PENDING", 409);
  if (!permissionService.hasAnyPermission(context, ["leave.approvals.escalate", "leave.approvals.override"]) && !permissionService.isSuperAdmin(context)) {
    throw new PermissionError("You do not have permission to escalate this leave approval.");
  }
  await repository.updateLeaveApprovalStep(env, context.companyId, currentStep.id, {
    approver_type: "super_admin_fallback",
    required_permission_key: "leave.approvals.override",
    decision_note: input.reason,
  } as any);
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.approvalEscalated,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    newValue: { step_id: currentStep.id, required_permission_key: "leave.approvals.override" },
    reason: input.reason,
  });
  void notifyLeaveEvent(env, context, "leave_approval_escalated", request, {
    title: "Leave approval escalated",
    message: "A leave approval was escalated for review.",
    priority: "high",
    targetPermissionKeys: ["leave.approvals.override"],
    targetRoleKeys: ["super_admin", "admin"],
  });
  return { escalated: true };
};

export const calendar = async (env: Env, context: AuthActor, filters: LeaveCalendarFilters) =>
  repository.calendar(env, context.companyId, filters, scope(context));

export { assertPayrollUnlocked };
