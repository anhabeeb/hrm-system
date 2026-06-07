import { LEAVE_AUDIT_ACTIONS, LOCKED_PAYROLL_STATUSES } from "./leave.constants";
import * as balanceService from "./leave-balance.service";
import * as calendarService from "./leave-calendar.service";
import * as policyService from "./leave-policy.service";
import * as repository from "./leave.repository";
import * as longLeaveCalculator from "../long-leave/long-leave-calculator.service";
import * as longLeaveRepository from "../long-leave/long-leave.repository";
import type {
  LeaveActionInput,
  LeaveBalanceAdjustInput,
  LeaveBalanceFilters,
  LeaveCalendarFilters,
  LeaveListResult,
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
) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  assertEmployeeCanUseLeave(employee);
  const leaveType = await repository.findLeaveType(env, context.companyId, input.leave_type_id);
  if (!leaveType) throw new NotFoundError("Leave type could not be found.");
  if (leaveType.is_enabled !== 1) {
    throw new AppError("This leave type is currently disabled.", "LEAVE_TYPE_DISABLED", 400);
  }
  const holidayRules = await getExcludeHolidaysSetting(env, context.companyId);
  const totalDays = await calendarService.calculateLeaveDays(env, context.companyId, input.start_date, input.end_date, {
    excludeHolidays: holidayRules.excludeHolidays,
    enabledHolidayTypes: holidayRules.enabledHolidayTypes,
    outletSpecificEnabled: holidayRules.outletSpecificEnabled,
    outletId: employee.primary_outlet_id,
  });
  if (totalDays <= 0) throw new ValidationError("Total leave days must be greater than zero.");
  const overlap = await repository.findOverlappingRequest(env, context.companyId, employee.id, input.start_date, input.end_date, excludeRequestId);
  if (overlap) {
    throw new ConflictError("This employee already has a leave request overlapping this date range.");
  }
  const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, input.start_date);
  if (policyService.shouldCheckBalance(leaveType)) {
    const balance = await balanceService.initializeBalanceIfNeeded(
      env,
      context.companyId,
      employee,
      leaveType.id,
      Number(input.start_date.slice(0, 4)),
      policy,
    );
    balanceService.assertSufficientBalance(balance, totalDays, policy);
  }
  if (leaveType.affects_payroll === 1) {
    await assertPayrollUnlocked(env, context.companyId, input.start_date, input.end_date);
  }
  return { employee, leaveType, policy, totalDays };
};

const createApprovalRequestIfRequired = async (
  env: Env,
  context: AuthActor,
  request: LeaveRequestRecord,
  requiresApproval: boolean,
) => {
  if (!requiresApproval) return null;

  const workflow = await repository.findApprovalWorkflow(env, context.companyId, "leave_request");
  if (!workflow || workflow.is_enabled !== 1) {
    throw new ConflictError("Approval workflow is not configured for leave requests.");
  }

  const approvalRequestId = createPrefixedId("approval_req");
  await repository.createApprovalRequest(env, {
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
  });
  await repository.updateRequest(env, context.companyId, request.id, {
    approval_request_id: approvalRequestId,
  });
  return approvalRequestId;
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
    default_days: input.default_days,
    requires_attachment: input.requires_attachment === undefined ? undefined : input.requires_attachment ? 1 : 0,
    affects_payroll: input.affects_payroll === undefined ? undefined : input.affects_payroll ? 1 : 0,
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
  const existing = await repository.findBalance(env, context.companyId, employee.id, input.leave_type_id, input.year);
  const next = {
    id: existing?.id ?? createPrefixedId("leave_balance"),
    company_id: context.companyId,
    employee_id: employee.id,
    leave_type_id: input.leave_type_id,
    year: input.year,
    opening_balance: existing?.opening_balance ?? 0,
    accrued_days: existing?.accrued_days ?? leaveType.default_days ?? 0,
    used_days: existing?.used_days ?? 0,
    remaining_days: (existing?.remaining_days ?? leaveType.default_days ?? 0) + input.adjustment_days,
    updated_at: nowIso(),
  };
  await repository.upsertBalance(env, next);
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.balanceAdjusted,
    entityType: "leave_balance",
    entityId: next.id,
    employeeId: employee.id,
    outletId: employee.primary_outlet_id,
    oldValue: existing,
    newValue: next,
    reason: input.reason,
  });
  return { updated: true };
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

export const createRequest = async (env: Env, context: AuthActor, input: LeaveRequestInput) => {
  const validated = await validateRequestBusinessRules(env, context, input);
  const requiresApproval = await settingsService.shouldRequireApproval(env, context.companyId, "leave_request", context);
  const canDirectApprove =
    !requiresApproval &&
    permissionService.isAdminOrSuperAdmin(context) &&
    permissionService.hasPermission(context, "leave.approve");
  const status = canDirectApprove ? "direct_approved" : "pending";
  const id = createPrefixedId("leave_req");
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
    affects_payroll: validated.leaveType.affects_payroll,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await repository.createRequest(env, request);
  const approvalRequestId = await createApprovalRequestIfRequired(env, context, request, requiresApproval);
  if (approvalRequestId) {
    request.approval_request_id = approvalRequestId;
  }
  if (["approved", "direct_approved"].includes(status) && policyService.shouldCheckBalance(validated.leaveType)) {
    const balance = await balanceService.initializeBalanceIfNeeded(
      env,
      context.companyId,
      validated.employee,
      validated.leaveType.id,
      Number(input.start_date.slice(0, 4)),
      validated.policy,
    );
    await balanceService.deductBalance(env, balance, validated.totalDays);
  }
  const longLeaveRecord = await ensureLongLeaveForRequest(env, context, request, validated.employee);
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.requestCreated,
    entityType: "leave_request",
    entityId: id,
    employeeId: input.employee_id,
    outletId: validated.employee.primary_outlet_id,
    newValue: request,
    reason: input.reason,
  });
  await broadcast(env, context, "leave.request_created", { id, employee_id: input.employee_id, status });
  return {
    leave_request: await repository.findRequest(env, context.companyId, id),
    long_leave_required: Boolean(longLeaveRecord),
    long_leave_record_id: longLeaveRecord?.id,
  };
};

export const updateRequest = async (env: Env, context: AuthActor, id: string, input: LeaveRequestUpdateInput) => {
  const existing = await getRequest(env, context, id);
  if (!["pending", "returned_for_more_info"].includes(existing.status)) {
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
  await repository.updateRequest(env, context.companyId, id, {
    leave_type_id: nextInput.leave_type_id,
    start_date: nextInput.start_date,
    end_date: nextInput.end_date,
    total_days: validated.totalDays,
    reason: nextInput.reason ?? null,
    affects_payroll: validated.leaveType.affects_payroll,
  });
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

export const approveRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  if (request.status !== "pending") throw new ConflictError("Only pending leave requests can be approved.");
  const validated = await validateRequestBusinessRules(env, context, {
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    start_date: request.start_date,
    end_date: request.end_date,
    reason: request.reason,
  }, id);
  const longLeaveRecord = await ensureLongLeaveForRequest(env, context, request, validated.employee);
  await repository.updateRequest(env, context.companyId, id, { status: "approved" } as any);
  if (policyService.shouldCheckBalance(validated.leaveType)) {
    const balance = await balanceService.initializeBalanceIfNeeded(
      env,
      context.companyId,
      validated.employee,
      validated.leaveType.id,
      Number(request.start_date.slice(0, 4)),
      validated.policy,
    );
    await balanceService.deductBalance(env, balance, request.total_days);
  }
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.requestApproved,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    oldValue: request,
    newValue: { status: "approved" },
    reason: input.reason,
  });
  await broadcast(env, context, "leave.request_approved", { id, employee_id: request.employee_id });
  return {
    approved: true,
    long_leave_required: Boolean(longLeaveRecord),
    long_leave_record_id: longLeaveRecord?.id,
  };
};

export const rejectRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  if (request.status !== "pending") throw new ConflictError("Only pending leave requests can be rejected.");
  await repository.updateRequest(env, context.companyId, id, { status: "rejected" } as any);
  await ensureAudit(env, context, {
    action: LEAVE_AUDIT_ACTIONS.requestRejected,
    entityType: "leave_request",
    entityId: id,
    employeeId: request.employee_id,
    outletId: request.outlet_id,
    oldValue: request,
    newValue: { status: "rejected" },
    reason: input.reason,
  });
  await broadcast(env, context, "leave.request_rejected", { id, employee_id: request.employee_id });
  return { rejected: true };
};

export const cancelRequest = async (env: Env, context: AuthActor, id: string, input: LeaveActionInput) => {
  const request = await getRequest(env, context, id);
  if (request.affects_payroll === 1) {
    await assertPayrollUnlocked(env, context.companyId, request.start_date, request.end_date);
  }
  await repository.updateRequest(env, context.companyId, id, { status: "cancelled" } as any);
  if (["approved", "direct_approved"].includes(request.status)) {
    const employee = await ensureEmployeeAccess(env, context, request.employee_id);
    const balance = await repository.findBalance(env, context.companyId, request.employee_id, request.leave_type_id, Number(request.start_date.slice(0, 4)));
    if (balance) await balanceService.restoreBalance(env, balance, request.total_days);
    void employee;
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
  await broadcast(env, context, "leave.request_cancelled", { id, employee_id: request.employee_id });
  return { cancelled: true };
};

export const calendar = async (env: Env, context: AuthActor, filters: LeaveCalendarFilters) =>
  repository.calendar(env, context.companyId, filters, scope(context));

export { assertPayrollUnlocked };
