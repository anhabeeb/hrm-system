import { LEAVE_AUDIT_ACTIONS, LOCKED_PAYROLL_STATUSES } from "./leave.constants";
import * as accrualService from "./leave-accrual.service";
import * as balanceService from "./leave-balance.service";
import * as calendarService from "./leave-calendar.service";
import * as policyService from "./leave-policy.service";
import * as repository from "./leave.repository";
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
  LeaveRequestFilters,
  LeaveRequestInput,
  LeaveRequestRecord,
  LeaveRequestUpdateInput,
  LeaveTypeFilters,
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
  const total = await repository.countRequests(env, context.companyId, filters, scope(context));
  return {
    rows: await repository.listRequests(env, context.companyId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequest(env, context.companyId, id);
  if (!request) throw new NotFoundError("Leave request could not be found.");
  if (!permissionService.hasOutletAccess(context, request.outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
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
  const requiresApproval = await settingsService.shouldRequireApproval(env, context.companyId, "leave_request", context);
  const canDirectApprove =
    !requiresApproval &&
    permissionService.isAdminOrSuperAdmin(context) &&
    permissionService.hasPermission(context, "leave.approve");
  const status = canDirectApprove ? "direct_approved" : requiresApproval ? "pending_approval" : "approved";
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
    approval_status: canDirectApprove || !requiresApproval ? "approved" : "pending",
    submitted_at: timestamp,
    submitted_by: context.actorUserId,
    approved_at: canDirectApprove || !requiresApproval ? timestamp : null,
    approved_by: canDirectApprove || !requiresApproval ? context.actorUserId : null,
    rejected_at: null,
    rejected_by: null,
    cancelled_at: null,
    cancelled_by: null,
    withdrawn_at: null,
    withdrawn_by: null,
    decision_reason: null,
    affects_payroll: validated.leaveType.affects_payroll,
    created_at: timestamp,
    updated_at: timestamp,
  };
  const approvalPlan = await buildLeaveApprovalWorkflowIfRequired(env, context, request, requiresApproval);
  request.approval_request_id = approvalPlan.approvalRequestId;
  const balanceEntry = await planRequestBalanceForCreation(env, context, validated, request);
  if (approvalPlan.approvalRequest || approvalPlan.steps.length > 0) {
    await repository.createLeaveRequestWithApprovalWorkflow(env, request, approvalPlan.approvalRequest, approvalPlan.steps, balanceEntry);
  } else if (balanceEntry) {
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
  await broadcast(env, context, requiresApproval ? "leave.request_submitted" : "leave.request_created", { id, employee_id: input.employee_id, status });
  if (requiresApproval) {
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
    long_leave_required: Boolean(longLeaveRecord),
    long_leave_record_id: longLeaveRecord?.id,
  };
};

export const updateRequest = async (env: Env, context: AuthActor, id: string, input: LeaveRequestUpdateInput) => {
  const existing = await getRequest(env, context, id);
  if (!["pending", "pending_approval", "submitted", "partially_approved", "returned_for_more_info"].includes(existing.status)) {
    throw new ConflictError("Approved, rejected, or cancelled leave requests must use the proper action endpoint.");
  }
  const nextInput: LeaveRequestInput = {
    employee_id: existing.employee_id,
    leave_type_id: input.leave_type_id ?? existing.leave_type_id,
    start_date: input.start_date ?? existing.start_date,
    end_date: input.end_date ?? existing.end_date,
    reason: input.reason ?? existing.reason,
  };
  if ((input.start_date || input.end_date || input.leave_type_id) && !input.reason) {
    throw new ValidationError("A reason is required for this leave change.");
  }
  const validated = await validateRequestBusinessRules(env, context, nextInput, id);
  const updatedRequest: LeaveRequestRecord = {
    ...existing,
    leave_type_id: nextInput.leave_type_id,
    start_date: nextInput.start_date,
    end_date: nextInput.end_date,
    total_days: validated.totalDays,
    reason: nextInput.reason ?? null,
    affects_payroll: validated.leaveType.affects_payroll,
    updated_at: nowIso(),
  };
  const rebalanceEntries = await planPendingRequestUpdateRebalance(env, context, existing, updatedRequest, validated, input.reason ?? "Leave request updated.");
  const requestUpdate = {
    leave_type_id: nextInput.leave_type_id,
    start_date: nextInput.start_date,
    end_date: nextInput.end_date,
    total_days: validated.totalDays,
    reason: nextInput.reason ?? null,
    affects_payroll: validated.leaveType.affects_payroll,
  };
  if (rebalanceEntries.length > 0) {
    await repository.updatePendingLeaveRequestWithRebalance(env, context.companyId, id, requestUpdate, rebalanceEntries);
  } else {
    await repository.updateRequest(env, context.companyId, id, {
      leave_type_id: nextInput.leave_type_id,
      start_date: nextInput.start_date,
      end_date: nextInput.end_date,
      total_days: validated.totalDays,
      reason: nextInput.reason ?? null,
      affects_payroll: validated.leaveType.affects_payroll,
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
    long_leave_required: Boolean(longLeaveRecord),
    long_leave_record_id: longLeaveRecord?.id,
  };
};

export const submitRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  if (["pending", "pending_approval", "partially_approved"].includes(request.status)) {
    const existingSteps = await repository.countApprovalSteps(env, context.companyId, id);
    if (existingSteps > 0 || request.status === "partially_approved") {
      return { submitted: true, already_applied: true };
    }
  }
  if (!["draft", "submitted", "returned_for_more_info"].includes(request.status)) {
    throw new AppError("This leave request cannot be submitted.", "LEAVE_APPROVAL_INVALID_TRANSITION", 409);
  }
  const validated = await validateRequestBusinessRules(env, context, {
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    start_date: request.start_date,
    end_date: request.end_date,
    reason: request.reason,
  }, id);
  const requiresApproval = await settingsService.shouldRequireApproval(env, context.companyId, "leave_request", context);
  const submittedAt = nowIso();
  const existingGenericApproval = request.approval_request_id
    ? null
    : await repository.findGenericApprovalRequestByEntity(env, context.companyId, "leave_request", id);
  const nextRequest: LeaveRequestRecord = {
    ...request,
    total_days: validated.totalDays,
    status: requiresApproval ? "pending_approval" : "approved",
    approval_status: requiresApproval ? "pending" : "approved",
    approval_request_id: request.approval_request_id ?? existingGenericApproval?.id ?? null,
    submitted_at: submittedAt,
    submitted_by: context.actorUserId,
    approved_at: requiresApproval ? request.approved_at ?? null : submittedAt,
    approved_by: requiresApproval ? request.approved_by ?? null : context.actorUserId,
    decision_reason: input.reason,
    affects_payroll: validated.leaveType.affects_payroll,
    updated_at: submittedAt,
  };
  const approvalPlan = await buildLeaveApprovalWorkflowIfRequired(
    env,
    context,
    nextRequest,
    requiresApproval,
    { existingApprovalRequestId: nextRequest.approval_request_id },
  );
  nextRequest.approval_request_id = approvalPlan.approvalRequestId ?? nextRequest.approval_request_id;
  const idempotencyKey = requiresApproval ? `leave_request:${request.id}:reserved` : `leave_request:${request.id}:used`;
  const existingBalanceTransaction = await repository.findTransactionByIdempotencyKey(env, context.companyId, idempotencyKey);
  const balanceEntry = existingBalanceTransaction ? null : await planRequestBalanceForCreation(env, context, validated, nextRequest);
  const requestValues = {
    status: nextRequest.status,
    approval_request_id: nextRequest.approval_request_id,
    approval_status: nextRequest.approval_status,
    submitted_at: submittedAt,
    submitted_by: context.actorUserId,
    approved_at: nextRequest.approved_at,
    approved_by: nextRequest.approved_by,
    decision_reason: input.reason,
    total_days: validated.totalDays,
    affects_payroll: validated.leaveType.affects_payroll,
  };
  if (requiresApproval) {
    await repository.submitLeaveRequestWithApprovalWorkflow(
      env,
      context.companyId,
      id,
      requestValues,
      approvalPlan.approvalRequest,
      approvalPlan.steps,
      balanceEntry,
    );
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
  if (request.affects_payroll === 1) {
    await assertPayrollUnlocked(env, context.companyId, request.start_date, request.end_date);
  }
  if (["cancelled", "withdrawn"].includes(request.status)) return { cancelled: true, already_applied: true };
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
  };
  const genericApprovalUpdate = approvalRequestSync(request, "cancelled", null);
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
  if (!pendingStatuses.includes(request.status)) {
    if (request.status === "withdrawn") return { withdrawn: true, already_applied: true };
    throw new AppError("Only pending leave requests can be withdrawn.", "LEAVE_APPROVAL_INVALID_TRANSITION", 409);
  }
  if (request.created_by !== context.actorUserId && !permissionService.hasAnyPermission(context, ["leave.requests.withdraw", "leave.cancel", "leave.edit"])) {
    throw new PermissionError("You do not have permission to withdraw this leave request.");
  }
  const entry = await planReleasePendingBalance(env, context, request, input.reason, "withdrawn_released");
  const withdrawnAt = nowIso();
  const requestValues: Partial<LeaveRequestRecord> = {
    status: "withdrawn",
    approval_status: "withdrawn",
    withdrawn_at: withdrawnAt,
    withdrawn_by: context.actorUserId,
    decision_reason: input.reason,
  };
  const genericApprovalUpdate = approvalRequestSync(request, "withdrawn", null);
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
  const rows = await repository.listApprovalInbox(env, context.companyId, filters, scope(context), context.actorUserId, context.permissions ?? []);
  return {
    rows,
    pagination: pagination(filters.page, filters.page_size, rows.length),
  };
};

export const listApprovalHistory = async (env: Env, context: AuthActor, filters: LeaveRequestFilters): Promise<LeaveListResult<any>> => {
  const total = await repository.countRequests(env, context.companyId, filters, scope(context));
  return {
    rows: await repository.listApprovalHistory(env, context.companyId, filters, scope(context)),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};

export const getApprovalDetail = async (env: Env, context: AuthActor, requestId: string) => {
  const request = await getRequest(env, context, requestId);
  const steps = await repository.listApprovalSteps(env, context.companyId, requestId);
  const transactions = await repository.listLeaveRequestTransactions(env, context.companyId, requestId);
  const genericApproval = request.approval_request_id
    ? await repository.findGenericApprovalRequestByEntity(env, context.companyId, "leave_request", requestId)
    : null;
  return {
    leave_request: request,
    generic_approval_request: genericApproval,
    approval_steps: steps,
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
      ...steps.map((step) => ({
        type: `approval_step_${step.status}`,
        at: step.decision_at ?? step.created_at,
        by: step.decision_by ?? step.delegated_to ?? step.approver_user_id,
        note: step.decision_note,
        step_order: step.step_order,
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
