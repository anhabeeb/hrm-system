import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import { resolveOperationResponsibility } from "../operation-ownership/operation-ownership.service";
import * as permissionService from "../../services/permission.service";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import * as repository from "./payroll-adjustments.repository";
import {
  PAYROLL_ADJUSTMENT_OPERATION,
  PAYROLL_ADJUSTMENT_SUBJECT_TYPE,
  type PayrollAdjustmentActionInput,
  type PayrollAdjustmentEmployeeRecord,
  type PayrollAdjustmentFilters,
  type PayrollAdjustmentInput,
  type PayrollAdjustmentRequestRecord,
} from "./payroll-adjustments.types";
import type { OperationResolutionResult } from "../operation-ownership/operation-ownership.types";

const terminalStatuses = ["APPLIED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"] as const;
const activeEmployee = (employee: PayrollAdjustmentEmployeeRecord | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted"].includes(employee.employment_status ?? "active"));

const actorEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);

const pagination = (filters: PayrollAdjustmentFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const audit = async (
  env: Env,
  context: AuthActor,
  input: { action: string; entityId: string; reason?: string | null; details?: Record<string, unknown>; employeeId?: string | null },
) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "payroll",
    action: input.action,
    entityType: "payroll_adjustment_request",
    entityId: input.entityId,
    employeeId: input.employeeId ?? undefined,
    actorId: context.actorUserId,
    reason: input.reason ?? undefined,
    details: input.details,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
};

const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);

const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (!permissionService.hasOutletAccess(context, outletId)) {
    throw new PermissionError("You do not have access to this employee's outlet.");
  }
};

const actorHasRequiredRole = async (env: Env, context: AuthActor, requiredRoleId?: string | null) => {
  if (!requiredRoleId || permissionService.isSuperAdmin(context)) return true;
  if (context.roleKeys.includes(requiredRoleId) || context.roles.includes(requiredRoleId)) return true;
  const roles = await permissionService.getUserRoles(env, context.companyId, context.actorUserId);
  return roles.some((role) => role.id === requiredRoleId || role.role_key === requiredRoleId || role.role_name === requiredRoleId);
};

const executionHoldStatuses = new Set(["HOLD_FOR_MANUAL_ASSIGNMENT", "UNASSIGNED", "SKIPPED"]);

export const assertPayrollAdjustmentExecutionAllowed = async (
  env: Env,
  context: AuthActor,
  adjustment: PayrollAdjustmentRequestRecord,
  resolution: OperationResolutionResult,
) => {
  if (resolution.status === "BLOCKED") {
    throw new PermissionError(resolution.message || "Payroll adjustment execution is blocked by Operation Ownership.");
  }
  if (executionHoldStatuses.has(resolution.status)) {
    return { allowed: false as const, manualReviewMessage: resolution.message || "Payroll adjustment execution needs manual assignment." };
  }
  if (resolution.status === "USE_SUPER_ADMIN" && !permissionService.isSuperAdmin(context)) {
    throw new PermissionError("Only Super Admin can execute this payroll adjustment fallback.");
  }
  if (permissionService.isSuperAdmin(context)) return { allowed: true as const };

  if (resolution.resolved_user_id && resolution.resolved_user_id !== context.actorUserId) {
    throw new PermissionError("Operation Ownership assigns payroll adjustment execution to another user.");
  }

  const employee = await actorEmployee(env, context);
  if (resolution.resolved_department_id) {
    if (!activeEmployee(employee)) throw new PermissionError("Your linked employee profile is not active for payroll adjustment execution.");
    if (employee?.department_id !== resolution.resolved_department_id) {
      throw new PermissionError("Operation Ownership assigns payroll adjustment execution to another department.");
    }
  }
  if (resolution.min_level != null || resolution.max_level != null) {
    if (!activeEmployee(employee) || employee?.level == null) throw new PermissionError("Your employee level is required for payroll adjustment execution.");
    if (resolution.min_level != null && employee.level < resolution.min_level) throw new PermissionError("Your employee level is below the execution level configured for this operation.");
    if (resolution.max_level != null && employee.level > resolution.max_level) throw new PermissionError("Your employee level is above the execution level configured for this operation.");
  }
  const requiredPermission = resolution.required_permission ?? "payroll.adjustments.apply";
  if (!permissionService.hasPermission(context, requiredPermission)) {
    throw new PermissionError("You do not have permission to apply this payroll adjustment.");
  }
  if (!(await actorHasRequiredRole(env, context, resolution.required_role_id))) {
    throw new PermissionError("Your role is not allowed to execute this payroll adjustment.");
  }
  assertOutletAccess(context, adjustment.outlet_id);
  return { allowed: true as const };
};

export const canCreatePayrollAdjustmentForEmployee = async (env: Env, context: AuthActor, employeeId?: string | null) => {
  const requesterEmployee = await actorEmployee(env, context);
  const subjectEmployeeId = employeeId ?? requesterEmployee?.id ?? null;
  if (!subjectEmployeeId) {
    throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.", "EMPLOYEE_PROFILE_NOT_LINKED");
  }
  if (!has(context, "payroll.adjustments.create") && !has(context, "payroll.adjustments.createForOthers")) {
    throw new PermissionError("You do not have permission to create payroll adjustment requests.");
  }
  const subject = await repository.findEmployee(env, context.companyId, subjectEmployeeId);
  if (!activeEmployee(subject)) throw new ValidationError("Please choose an active employee for this payroll adjustment.");
  assertOutletAccess(context, subject?.primary_outlet_id);
  const canCreateForOthers = has(context, "payroll.adjustments.createForOthers");
  if (!canCreateForOthers && requesterEmployee?.id !== subjectEmployeeId) {
    throw new PermissionError("You cannot create payroll adjustment requests for another employee.");
  }
  if (!canCreateForOthers && !activeEmployee(requesterEmployee)) {
    throw new PermissionError("Your employee profile is not active. Please contact HR.");
  }
  return { requesterEmployee, subject: subject! };
};

const validatePayrollReferences = async (env: Env, context: AuthActor, subject: PayrollAdjustmentEmployeeRecord, input: PayrollAdjustmentInput) => {
  const item = input.payroll_item_id ? await repository.findPayrollItem(env, context.companyId, input.payroll_item_id) : null;
  if (input.payroll_item_id && (!item || item.employee_id !== subject.id)) {
    throw new ValidationError("The selected payroll item does not belong to the selected employee.");
  }
  const payslip = input.payslip_id ? await repository.findPayslip(env, context.companyId, input.payslip_id) : null;
  if (input.payslip_id && (!payslip || payslip.employee_id !== subject.id)) {
    throw new ValidationError("The selected payslip does not belong to the selected employee.");
  }
  const runId = input.payroll_run_id ?? item?.payroll_run_id ?? payslip?.payroll_run_id ?? null;
  const run = runId ? await repository.findPayrollRun(env, context.companyId, runId) : null;
  if (runId && !run) throw new ValidationError("The selected payroll run could not be found.");
  if (item?.outlet_id) assertOutletAccess(context, item.outlet_id);
  return {
    run,
    payrollRunId: runId,
    payrollItemId: item?.id ?? input.payroll_item_id ?? null,
    payslipId: payslip?.id ?? input.payslip_id ?? null,
    outletId: item?.outlet_id ?? subject.primary_outlet_id ?? null,
    effectivePayrollMonth: input.effective_payroll_month ?? run?.payroll_month ?? null,
  };
};

const approvalStatusToPayrollStatus = (approval: any): PayrollAdjustmentRequestRecord["status"] => {
  if (!approval) return "PENDING";
  if (approval.status === "NEEDS_MANUAL_ASSIGNMENT" || approval.status === "ESCALATED") return "PENDING_MANUAL_REVIEW";
  if (approval.status === "APPROVED") return "PENDING_EXECUTION";
  if (approval.status === "REJECTED") return "REJECTED";
  if (approval.status === "CANCELLED") return "CANCELLED";
  if (approval.current_step_name?.toLowerCase().includes("final")) return "PENDING_FINAL_APPROVAL";
  return "PENDING_OWNER_REVIEW";
};

export const buildPayrollAdjustmentVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (
    permissionService.isSuperAdmin(context) ||
    has(context, "payroll.adjustments.view") ||
    has(context, "approvals.requests.view")
  ) return { sql: undefined, values: [] as unknown[] };

  const clauses = ["par.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (employee?.id) {
    clauses.push("par.employee_id = ?", "par.requester_employee_id = ?");
    values.push(employee.id, employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject"])) {
    clauses.push(`(par.department_id = ? AND EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = par.company_id AND s.approval_request_id = par.approval_request_id
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE', 'OPERATION_OWNER')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    ))`);
    values.push(employee.department_id, employee.level ?? 0, employee.level ?? 99);
  }
  if (permissionService.hasAnyPermission(context, ["approvals.financeFinal.view", "approvals.financeFinal.approve", "approvals.financeFinal.reject", "payroll.adjustments.finalApprove"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = par.company_id AND s.approval_request_id = par.approval_request_id
         AND s.approver_resolver_type IN ('FINANCE_FINAL_APPROVER', 'OPERATION_FINAL_APPROVER')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }
  if (permissionService.hasAnyPermission(context, ["payroll.adjustments.apply"])) {
    clauses.push("par.status IN ('APPROVED', 'PENDING_EXECUTION')");
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

export const canViewPayrollAdjustment = async (env: Env, context: AuthActor, adjustment: PayrollAdjustmentRequestRecord) => {
  if (permissionService.isSuperAdmin(context) || has(context, "payroll.adjustments.view")) return true;
  if (adjustment.requester_user_id === context.actorUserId) return true;
  const employee = await actorEmployee(env, context);
  if (employee?.id && (employee.id === adjustment.employee_id || employee.id === adjustment.requester_employee_id)) return true;
  if (adjustment.approval_request_id) {
    try {
      await approvalEngineService.getTimeline(env, context, adjustment.approval_request_id);
      return true;
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  if (["APPROVED", "PENDING_EXECUTION"].includes(adjustment.status) && permissionService.hasPermission(context, "payroll.adjustments.apply")) {
    const resolution = await resolveOperationResponsibility(env, context, {
      operation_code: PAYROLL_ADJUSTMENT_OPERATION,
      responsibility_type: "EXECUTION",
      requester_employee_id: adjustment.requester_employee_id,
      subject_employee_id: adjustment.employee_id,
      department_id: adjustment.department_id,
      fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
    });
    const execution = await assertPayrollAdjustmentExecutionAllowed(env, context, adjustment, resolution);
    if (execution.allowed) return true;
  }
  throw new PermissionError("You do not have access to this payroll adjustment request.");
};

export const listPayrollAdjustments = async (env: Env, context: AuthActor, filters: PayrollAdjustmentFilters) => {
  const visibility = await buildPayrollAdjustmentVisibilityFilter(env, context);
  const result = await repository.listAdjustments(env, context.companyId, filters, visibility.sql, visibility.values);
  const visibleRows: PayrollAdjustmentRequestRecord[] = [];
  for (const row of result.rows) {
    try {
      await canViewPayrollAdjustment(env, context, row);
      visibleRows.push(row);
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  return { rows: visibleRows, pagination: pagination(filters, visibleRows.length) };
};

export const getPayrollAdjustment = async (env: Env, context: AuthActor, id: string) => {
  const adjustment = await repository.findAdjustmentById(env, context.companyId, id);
  if (!adjustment) throw new NotFoundError("The requested payroll adjustment could not be found.");
  await canViewPayrollAdjustment(env, context, adjustment);
  return { payroll_adjustment: adjustment };
};

export const createPayrollAdjustment = async (env: Env, context: AuthActor, input: PayrollAdjustmentInput) => {
  const { requesterEmployee, subject } = await canCreatePayrollAdjustmentForEmployee(env, context, input.employee_id);
  const refs = await validatePayrollReferences(env, context, subject, input);
  const duplicate = await repository.findDuplicatePendingAdjustment(env, {
    companyId: context.companyId,
    employeeId: subject.id,
    adjustmentType: input.adjustment_type,
    effectivePayrollMonth: refs.effectivePayrollMonth,
    payrollRunId: refs.payrollRunId,
    payrollItemId: refs.payrollItemId,
  });
  if (duplicate) throw new ConflictError("A pending payroll adjustment already exists for this employee and payroll period.");
  const id = createPrefixedId("payroll_adj");
  await repository.createAdjustment(env, {
    id,
    companyId: context.companyId,
    actorUserId: context.actorUserId,
    payload: {
      employee_id: subject.id,
      requester_employee_id: requesterEmployee?.id ?? null,
      requester_user_id: context.actorUserId,
      department_id: subject.department_id,
      position_id: subject.position_id,
      level: subject.level,
      outlet_id: refs.outletId,
      payroll_run_id: refs.payrollRunId,
      payroll_item_id: refs.payrollItemId,
      payslip_id: refs.payslipId,
      adjustment_type: input.adjustment_type,
      adjustment_direction: input.adjustment_direction,
      amount: input.amount ?? null,
      currency: input.currency ?? "MVR",
      effective_payroll_month: refs.effectivePayrollMonth,
      reason: input.reason,
      current_value_json: input.current_value_json ? JSON.stringify(input.current_value_json) : null,
      requested_value_json: input.requested_value_json ? JSON.stringify(input.requested_value_json) : null,
    },
  });
  await audit(env, context, { action: "payroll_adjustment_created", entityId: id, employeeId: subject.id, reason: input.reason });
  return getPayrollAdjustment(env, context, id);
};

export const submitPayrollAdjustmentForApproval = async (env: Env, context: AuthActor, id: string) => {
  const adjustment = (await getPayrollAdjustment(env, context, id)).payroll_adjustment;
  if (terminalStatuses.includes(adjustment.status as any)) {
    throw new ConflictError("This payroll adjustment request has already been completed.");
  }
  if (adjustment.approval_request_id) {
    return { payroll_adjustment: adjustment, already_submitted: true };
  }
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: PAYROLL_ADJUSTMENT_OPERATION,
    subject_type: PAYROLL_ADJUSTMENT_SUBJECT_TYPE,
    subject_id: adjustment.id,
    requester_employee_id: adjustment.requester_employee_id,
    subject_employee_id: adjustment.employee_id,
    department_id: adjustment.department_id,
    position_id: adjustment.position_id,
    level: adjustment.level,
    title: `Payroll adjustment ${adjustment.adjustment_type}`,
    summary: adjustment.reason,
    payload_json: {
      payroll_adjustment_request_id: adjustment.id,
      adjustment_type: adjustment.adjustment_type,
      amount: adjustment.amount,
      currency: adjustment.currency,
      effective_payroll_month: adjustment.effective_payroll_month,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "payroll.adjustments.createForOthers",
    moduleOperationType: PAYROLL_ADJUSTMENT_OPERATION,
  });
  if (!draft) throw new ValidationError("No active payroll adjustment approval workflow is configured.");
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const status = approvalStatusToPayrollStatus(submitted);
  await repository.updateAdjustmentApprovalLink(env, context.companyId, adjustment.id, {
    approvalRequestId: draft.id,
    approvalStatus: submitted?.status ?? "IN_REVIEW",
    currentStepId: submitted?.current_step_id ?? null,
    status,
    actorUserId: context.actorUserId,
  });
  const updated = await repository.findAdjustmentById(env, context.companyId, adjustment.id);
  await audit(env, context, { action: "payroll_adjustment_submitted_for_approval", entityId: adjustment.id, employeeId: adjustment.employee_id, reason: adjustment.reason, details: { approval_request_id: draft.id, status } });
  return { payroll_adjustment: updated, already_submitted: false };
};

export const approvePayrollAdjustmentStep = async (env: Env, context: AuthActor, id: string, input: PayrollAdjustmentActionInput) => {
  const adjustment = (await getPayrollAdjustment(env, context, id)).payroll_adjustment;
  if (!adjustment.approval_request_id) throw new ConflictError("This payroll adjustment has not been submitted for approval.");
  const approval = await approvalEngineService.approveStep(env, context, adjustment.approval_request_id, input.reason, { allowModuleBoundAction: true, moduleOperationType: PAYROLL_ADJUSTMENT_OPERATION });
  const status = approvalStatusToPayrollStatus(approval);
  const update: Record<string, unknown> = {
    approval_status: approval?.status ?? null,
    approval_current_step: approval?.current_step_id ?? null,
    status,
    updated_by: context.actorUserId,
  };
  if (status === "PENDING_FINAL_APPROVAL") {
    update.owner_reviewed_at = new Date().toISOString();
    update.owner_reviewed_by = context.actorUserId;
  }
  if (approval?.status === "APPROVED") {
    update.final_approved_at = new Date().toISOString();
    update.final_approved_by = context.actorUserId;
    update.approval_completed_at = new Date().toISOString();
  }
  await repository.updateAdjustmentStatus(env, context.companyId, adjustment.id, update);
  return { payroll_adjustment: await repository.findAdjustmentById(env, context.companyId, adjustment.id), approval_request: approval };
};

export const rejectPayrollAdjustmentStep = async (env: Env, context: AuthActor, id: string, input: PayrollAdjustmentActionInput) => {
  const adjustment = (await getPayrollAdjustment(env, context, id)).payroll_adjustment;
  if (!adjustment.approval_request_id) throw new ConflictError("This payroll adjustment has not been submitted for approval.");
  const approval = await approvalEngineService.rejectStep(env, context, adjustment.approval_request_id, input.reason, input.reason, { allowModuleBoundAction: true, moduleOperationType: PAYROLL_ADJUSTMENT_OPERATION });
  await repository.updateAdjustmentStatus(env, context.companyId, adjustment.id, {
    status: "REJECTED",
    approval_status: approval?.status ?? "REJECTED",
    approval_current_step: null,
    rejected_at: new Date().toISOString(),
    rejected_by: context.actorUserId,
    rejection_reason: input.reason,
    approval_completed_at: new Date().toISOString(),
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "payroll_adjustment_rejected", entityId: adjustment.id, employeeId: adjustment.employee_id, reason: input.reason });
  return { payroll_adjustment: await repository.findAdjustmentById(env, context.companyId, adjustment.id), approval_request: approval };
};

export const cancelPayrollAdjustment = async (env: Env, context: AuthActor, id: string, input: PayrollAdjustmentActionInput) => {
  const adjustment = (await getPayrollAdjustment(env, context, id)).payroll_adjustment;
  if (terminalStatuses.includes(adjustment.status as any)) {
    throw new ConflictError("This payroll adjustment request has already been completed.");
  }
  const approval = adjustment.approval_request_id
    ? await approvalEngineService.cancelRequest(env, context, adjustment.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleCancelPermission: "payroll.adjustments.cancel",
      moduleCancelAnyPermission: "payroll.adjustments.cancelAny",
      moduleOperationType: PAYROLL_ADJUSTMENT_OPERATION,
    })
    : null;
  await repository.updateAdjustmentStatus(env, context.companyId, adjustment.id, {
    status: "CANCELLED",
    approval_status: approval?.status ?? "CANCELLED",
    approval_current_step: null,
    cancelled_at: new Date().toISOString(),
    cancelled_by: context.actorUserId,
    cancellation_reason: input.reason,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "payroll_adjustment_cancelled", entityId: adjustment.id, employeeId: adjustment.employee_id, reason: input.reason });
  return { payroll_adjustment: await repository.findAdjustmentById(env, context.companyId, adjustment.id), approval_request: approval };
};

const payrollRecordLocked = async (env: Env, adjustment: PayrollAdjustmentRequestRecord) => {
  const run = adjustment.payroll_run_id ? await repository.findPayrollRun(env, adjustment.company_id, adjustment.payroll_run_id) : null;
  if (run && (run.locked_at || run.finalized_at || ["locked", "finalized", "paid", "closed"].includes(run.status))) return "The linked payroll run is locked or finalized.";
  const payslip = adjustment.payslip_id ? await repository.findPayslip(env, adjustment.company_id, adjustment.payslip_id) : null;
  if (payslip && ["published", "paid", "locked", "finalized"].includes(payslip.status)) return "The linked payslip is already published or locked.";
  return null;
};

export const applyApprovedPayrollAdjustment = async (env: Env, context: AuthActor, id: string, input: PayrollAdjustmentActionInput) => {
  const adjustment = (await getPayrollAdjustment(env, context, id)).payroll_adjustment;
  if (!["APPROVED", "PENDING_EXECUTION"].includes(adjustment.status)) {
    throw new ConflictError("Only approved payroll adjustments can be applied.");
  }
  if (await repository.findAppliedLedger(env, context.companyId, adjustment.id)) {
    return { payroll_adjustment: adjustment, already_applied: true };
  }
  const resolution = await resolveOperationResponsibility(env, context, {
    operation_code: PAYROLL_ADJUSTMENT_OPERATION,
    responsibility_type: "EXECUTION",
    requester_employee_id: adjustment.requester_employee_id,
    subject_employee_id: adjustment.employee_id,
    department_id: adjustment.department_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });
  const execution = await assertPayrollAdjustmentExecutionAllowed(env, context, adjustment, resolution);
  if (!execution.allowed) {
    await repository.updateAdjustmentStatus(env, context.companyId, adjustment.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "PAYROLL_ADJUSTMENT_EXECUTION_NEEDS_MANUAL_ASSIGNMENT",
      apply_error_message: execution.manualReviewMessage,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "payroll_adjustment_execution_held", entityId: adjustment.id, employeeId: adjustment.employee_id, reason: input.reason, details: { message: execution.manualReviewMessage, execution_resolution: resolution.status } });
    return { payroll_adjustment: await repository.findAdjustmentById(env, context.companyId, adjustment.id), manual_review_required: true };
  }
  const lockedReason = await payrollRecordLocked(env, adjustment);
  if (lockedReason) {
    await repository.updateAdjustmentStatus(env, context.companyId, adjustment.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "PAYROLL_ADJUSTMENT_REQUIRES_MANUAL_REVIEW",
      apply_error_message: lockedReason,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "payroll_adjustment_apply_deferred", entityId: adjustment.id, employeeId: adjustment.employee_id, reason: input.reason, details: { message: lockedReason } });
    return { payroll_adjustment: await repository.findAdjustmentById(env, context.companyId, adjustment.id), manual_review_required: true };
  }
  try {
    await repository.updateAdjustmentStatus(env, context.companyId, adjustment.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "PAYROLL_ADJUSTMENT_APPROVED_NOT_APPLIED",
      apply_error_message: "Adjustment approved but not applied to payroll totals yet.",
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "payroll_adjustment_apply_deferred", entityId: adjustment.id, employeeId: adjustment.employee_id, reason: input.reason, details: { message: "Adjustment approved but not applied to payroll totals yet.", execution_resolution: resolution.status } });
    return { payroll_adjustment: await repository.findAdjustmentById(env, context.companyId, adjustment.id), manual_review_required: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payroll adjustment could not be applied.";
    await repository.updateAdjustmentStatus(env, context.companyId, adjustment.id, {
      status: "FAILED_TO_APPLY",
      apply_error_code: error instanceof AppError ? error.code : "PAYROLL_ADJUSTMENT_APPLY_FAILED",
      apply_error_message: message,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "payroll_adjustment_apply_failed", entityId: adjustment.id, employeeId: adjustment.employee_id, reason: input.reason, details: { error: message } });
    throw error;
  }
};

export const getPayrollAdjustmentTimeline = async (env: Env, context: AuthActor, id: string) => {
  const adjustment = (await getPayrollAdjustment(env, context, id)).payroll_adjustment;
  if (!adjustment.approval_request_id) return { payroll_adjustment: adjustment, request: null, steps: [], actions: [] };
  const timeline = await approvalEngineService.getTimeline(env, context, adjustment.approval_request_id);
  return { payroll_adjustment: adjustment, ...timeline };
};
