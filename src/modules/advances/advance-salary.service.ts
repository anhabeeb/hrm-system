import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import { resolveOperationResponsibility } from "../operation-ownership/operation-ownership.service";
import { assertPayrollMonthUnlocked } from "../payroll/payroll-lock.service";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { ConflictError, PermissionError, ValidationError, NotFoundError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import * as repository from "./advance-salary.repository";
import {
  ADVANCE_SALARY_PAYMENT_OPERATION,
  ADVANCE_SALARY_REQUEST_OPERATION,
  ADVANCE_SALARY_SUBJECT_TYPE,
  type AdvanceSalaryActionInput,
  type AdvanceSalaryEmployeeRecord,
  type AdvanceSalaryFilters,
  type AdvanceSalaryInput,
  type AdvanceSalaryPaymentInput,
  type AdvanceSalaryRequestRecord,
} from "./advance-salary.types";
import type { OperationResolutionResult } from "../operation-ownership/operation-ownership.types";

const terminalStatuses = ["PAID", "REJECTED", "CANCELLED", "FULLY_DEDUCTED", "FAILED_TO_PAY"] as const;
const activeEmployee = (employee: AdvanceSalaryEmployeeRecord | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted"].includes(employee.employment_status ?? "active"));

const actorEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);
const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);
const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (!permissionService.hasOutletAccess(context, outletId)) throw new PermissionError("You do not have access to this employee's outlet.");
};
const pagination = (filters: AdvanceSalaryFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const audit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; reason?: string | null; details?: Record<string, unknown>; employeeId?: string | null }) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "advances",
    action: input.action,
    entityType: "advance_salary_request",
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

const actorHasRequiredRole = async (env: Env, context: AuthActor, requiredRoleId?: string | null) => {
  if (!requiredRoleId || permissionService.isSuperAdmin(context)) return true;
  if (context.roleKeys.includes(requiredRoleId) || context.roles.includes(requiredRoleId)) return true;
  const roles = await permissionService.getUserRoles(env, context.companyId, context.actorUserId);
  return roles.some((role) => role.id === requiredRoleId || role.role_key === requiredRoleId || role.role_name === requiredRoleId);
};

export const canCreateAdvanceSalaryForEmployee = async (env: Env, context: AuthActor, employeeId?: string | null) => {
  const requesterEmployee = await actorEmployee(env, context);
  const subjectEmployeeId = employeeId ?? requesterEmployee?.id ?? null;
  if (!subjectEmployeeId) throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.", "EMPLOYEE_PROFILE_NOT_LINKED");
  if (!has(context, "advanceSalary.requests.create") && !has(context, "advanceSalary.requests.createForOthers")) {
    throw new PermissionError("You do not have permission to create advance salary requests.");
  }
  const subject = await repository.findEmployee(env, context.companyId, subjectEmployeeId);
  if (!activeEmployee(subject)) throw new ValidationError("Please choose an active employee for this advance salary request.");
  assertOutletAccess(context, subject?.primary_outlet_id);
  const canCreateForOthers = has(context, "advanceSalary.requests.createForOthers");
  if (!canCreateForOthers && requesterEmployee?.id !== subjectEmployeeId) {
    throw new PermissionError("You cannot create advance salary requests for another employee.");
  }
  if (!canCreateForOthers && !activeEmployee(requesterEmployee)) {
    throw new PermissionError("Your employee profile is not active. Please contact HR.");
  }
  return { requesterEmployee, subject: subject! };
};

const approvalStatusToAdvanceStatus = (approval: any): AdvanceSalaryRequestRecord["status"] => {
  if (!approval) return "PENDING";
  if (approval.status === "NEEDS_MANUAL_ASSIGNMENT" || approval.status === "ESCALATED") return "PENDING_MANUAL_REVIEW";
  if (approval.status === "APPROVED") return "PENDING_PAYMENT";
  if (approval.status === "REJECTED") return "REJECTED";
  if (approval.status === "CANCELLED") return "CANCELLED";
  if (approval.current_step_name?.toLowerCase().includes("final")) return "PENDING_FINAL_APPROVAL";
  return "PENDING_OWNER_REVIEW";
};

export const buildAdvanceSalaryVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (permissionService.isSuperAdmin(context) || has(context, "advanceSalary.requests.view") || has(context, "advances.view") || has(context, "approvals.requests.view")) {
    return { sql: undefined, values: [] as unknown[] };
  }
  const clauses = ["asr.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (employee?.id) {
    clauses.push("asr.employee_id = ?", "asr.requester_employee_id = ?");
    values.push(employee.id, employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject", "advanceSalary.requests.review"])) {
    clauses.push(`(asr.department_id = ? AND EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = asr.company_id AND s.approval_request_id = asr.approval_request_id
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE', 'OPERATION_OWNER')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    ))`);
    values.push(employee.department_id, employee.level ?? 0, employee.level ?? 99);
  }
  if (permissionService.hasAnyPermission(context, ["advanceSalary.requests.finalApprove", "advanceSalary.requests.approve"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = asr.company_id AND s.approval_request_id = asr.approval_request_id
         AND s.approver_resolver_type IN ('OPERATION_FINAL_APPROVER', 'FINANCE_FINAL_APPROVER')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }
  if (permissionService.hasAnyPermission(context, ["advanceSalary.payments.execute", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"])) {
    clauses.push("asr.status IN ('APPROVED', 'PENDING_PAYMENT')");
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

export const canViewAdvanceSalaryRequest = async (env: Env, context: AuthActor, request: AdvanceSalaryRequestRecord) => {
  if (permissionService.isSuperAdmin(context) || has(context, "advanceSalary.requests.view") || has(context, "advances.view")) return true;
  if (request.requester_user_id === context.actorUserId) return true;
  const employee = await actorEmployee(env, context);
  if (employee?.id && (employee.id === request.employee_id || employee.id === request.requester_employee_id)) return true;
  if (request.approval_request_id) {
    try {
      await approvalEngineService.getTimeline(env, context, request.approval_request_id);
      return true;
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  if (["APPROVED", "PENDING_PAYMENT"].includes(request.status) && permissionService.hasAnyPermission(context, ["advanceSalary.payments.execute", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"])) {
    const resolution = await resolvePaymentExecution(env, context, request);
    const execution = await assertAdvanceSalaryPaymentExecutionAllowed(env, context, request, resolution, { purpose: "view" });
    if (execution.allowed) return true;
  }
  throw new PermissionError("You do not have access to this advance salary request.");
};

export const listAdvanceSalaryRequests = async (env: Env, context: AuthActor, filters: AdvanceSalaryFilters) => {
  const visibility = await buildAdvanceSalaryVisibilityFilter(env, context);
  const result = await repository.listRequests(env, context.companyId, filters, visibility.sql, visibility.values);
  const visibleRows: AdvanceSalaryRequestRecord[] = [];
  for (const row of result.rows) {
    try {
      await canViewAdvanceSalaryRequest(env, context, row);
      visibleRows.push(row);
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  return { rows: visibleRows, pagination: pagination(filters, visibleRows.length) };
};

export const getAdvanceSalaryRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested advance salary request could not be found.");
  await canViewAdvanceSalaryRequest(env, context, request);
  return { advance_salary_request: request };
};

const monthParts = (month?: string | null) => {
  if (!month) return { month: null, year: null };
  return { month, year: Number(month.slice(0, 4)) || null };
};

export const createAdvanceSalaryRequest = async (env: Env, context: AuthActor, input: AdvanceSalaryInput) => {
  const { requesterEmployee, subject } = await canCreateAdvanceSalaryForEmployee(env, context, input.employee_id);
  const repayment = monthParts(input.repayment_start_month);
  if (input.repayment_start_month) await assertPayrollMonthUnlocked(env, context.companyId, input.repayment_start_month);
  const duplicate = await repository.findDuplicatePendingRequest(env, {
    companyId: context.companyId,
    employeeId: subject.id,
    requestType: input.request_type,
    payrollMonth: input.repayment_start_month ?? null,
    requestedPaymentDate: input.requested_payment_date ?? null,
  });
  if (duplicate) throw new ConflictError("A pending advance request already exists for this employee.");
  const repaymentMonths = input.repayment_months ?? 1;
  const amountPerMonth = Math.ceil(input.requested_amount / repaymentMonths);
  const id = createPrefixedId("advance_salary");
  await repository.createRequest(env, {
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
      outlet_id: subject.primary_outlet_id ?? null,
      payroll_month: repayment.month,
      payroll_year: repayment.year,
      request_type: input.request_type,
      requested_amount: input.requested_amount,
      currency: input.currency ?? "MVR",
      requested_payment_date: input.requested_payment_date ?? null,
      repayment_start_month: repayment.month,
      repayment_start_year: repayment.year,
      repayment_months: repaymentMonths,
      repayment_amount_per_month: amountPerMonth,
      repayment_policy_json: input.repayment_policy_json ? JSON.stringify(input.repayment_policy_json) : null,
      reason: input.reason,
      employee_note: input.employee_note ?? null,
    },
  });
  await audit(env, context, { action: "advance_salary_request_created", entityId: id, employeeId: subject.id, reason: input.reason });
  return getAdvanceSalaryRequest(env, context, id);
};

export const submitAdvanceSalaryForApproval = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getAdvanceSalaryRequest(env, context, id)).advance_salary_request;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This advance salary request has already been completed.");
  if (request.approval_request_id) return { advance_salary_request: request, already_submitted: true };
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: ADVANCE_SALARY_REQUEST_OPERATION,
    subject_type: ADVANCE_SALARY_SUBJECT_TYPE,
    subject_id: request.id,
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.department_id,
    position_id: request.position_id,
    level: request.level,
    title: `Advance salary ${request.request_type}`,
    summary: request.reason,
    payload_json: {
      advance_salary_request_id: request.id,
      request_type: request.request_type,
      requested_amount: request.requested_amount,
      currency: request.currency,
      repayment_start_month: request.repayment_start_month,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "advanceSalary.requests.createForOthers",
    moduleOperationType: ADVANCE_SALARY_REQUEST_OPERATION,
  });
  if (!draft) throw new ValidationError("No active advance salary approval workflow is configured.");
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const status = approvalStatusToAdvanceStatus(submitted);
  await repository.updateApprovalLink(env, context.companyId, request.id, {
    approvalRequestId: draft.id,
    approvalStatus: submitted?.status ?? "IN_REVIEW",
    currentStepId: submitted?.current_step_id ?? null,
    status,
    actorUserId: context.actorUserId,
  });
  const updated = await repository.findRequestById(env, context.companyId, request.id);
  await audit(env, context, { action: "advance_salary_submitted_for_approval", entityId: request.id, employeeId: request.employee_id, reason: request.reason, details: { approval_request_id: draft.id, status } });
  return { advance_salary_request: updated, already_submitted: false };
};

export const approveAdvanceSalaryStep = async (env: Env, context: AuthActor, id: string, input: AdvanceSalaryActionInput) => {
  const request = (await getAdvanceSalaryRequest(env, context, id)).advance_salary_request;
  if (!request.approval_request_id) throw new ConflictError("This advance salary request has not been submitted for approval.");
  const approval = await approvalEngineService.approveStep(env, context, request.approval_request_id, input.reason, { allowModuleBoundAction: true, moduleOperationType: ADVANCE_SALARY_REQUEST_OPERATION });
  const status = approvalStatusToAdvanceStatus(approval);
  const update: Record<string, unknown> = {
    approval_status: approval?.status ?? null,
    approval_current_step: approval?.current_step_id ?? null,
    status,
    payment_status: status === "PENDING_PAYMENT" ? "PENDING_PAYMENT" : undefined,
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
    update.approved_amount = request.requested_amount;
  }
  await repository.updateRequestStatus(env, context.companyId, request.id, update);
  return { advance_salary_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const rejectAdvanceSalaryStep = async (env: Env, context: AuthActor, id: string, input: AdvanceSalaryActionInput) => {
  const request = (await getAdvanceSalaryRequest(env, context, id)).advance_salary_request;
  if (!request.approval_request_id) throw new ConflictError("This advance salary request has not been submitted for approval.");
  const approval = await approvalEngineService.rejectStep(env, context, request.approval_request_id, input.reason, input.reason, { allowModuleBoundAction: true, moduleOperationType: ADVANCE_SALARY_REQUEST_OPERATION });
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: "REJECTED",
    payment_status: "CANCELLED",
    deduction_status: "CANCELLED",
    approval_status: approval?.status ?? "REJECTED",
    approval_current_step: null,
    rejected_at: new Date().toISOString(),
    rejected_by: context.actorUserId,
    rejection_reason: input.reason,
    approval_completed_at: new Date().toISOString(),
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "advance_salary_rejected", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { advance_salary_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const cancelAdvanceSalaryRequest = async (env: Env, context: AuthActor, id: string, input: AdvanceSalaryActionInput) => {
  const request = (await getAdvanceSalaryRequest(env, context, id)).advance_salary_request;
  if (["PAID", "PARTIALLY_DEDUCTED", "FULLY_DEDUCTED", "REJECTED", "CANCELLED"].includes(request.status)) {
    throw new ConflictError("This advance salary request cannot be cancelled.");
  }
  const approval = request.approval_request_id
    ? await approvalEngineService.cancelRequest(env, context, request.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleCancelPermission: "advanceSalary.requests.cancel",
      moduleCancelAnyPermission: "advanceSalary.requests.cancelAny",
      moduleOperationType: ADVANCE_SALARY_REQUEST_OPERATION,
    })
    : null;
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: "CANCELLED",
    payment_status: "CANCELLED",
    deduction_status: "CANCELLED",
    approval_status: approval?.status ?? "CANCELLED",
    approval_current_step: null,
    cancelled_at: new Date().toISOString(),
    cancelled_by: context.actorUserId,
    cancellation_reason: input.reason,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "advance_salary_cancelled", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { advance_salary_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

const resolvePaymentExecution = (env: Env, context: AuthActor, request: AdvanceSalaryRequestRecord) =>
  resolveOperationResponsibility(env, context, {
    operation_code: ADVANCE_SALARY_PAYMENT_OPERATION,
    responsibility_type: "EXECUTION",
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.department_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });

export const addMonthsToPayrollMonth = (payrollMonth: string, offset: number) => {
  const match = /^(\d{4})-(\d{2})$/.exec(payrollMonth);
  if (!match) throw new ValidationError("Repayment start month must use YYYY-MM format.");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1 + offset;
  const nextYear = year + Math.floor(monthIndex / 12);
  const nextMonth = ((monthIndex % 12) + 12) % 12 + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
};

export const buildAdvanceSalaryDeductionSchedule = (request: AdvanceSalaryRequestRecord, paidAmount: number, startMonth: string) => {
  const repaymentMonths = Math.max(1, Number(request.repayment_months ?? 1));
  const totalCents = Math.round(paidAmount * 100);
  const baseCents = Math.floor(totalCents / repaymentMonths);
  const rows = Array.from({ length: repaymentMonths }, (_, index) => {
    const payrollMonth = addMonthsToPayrollMonth(startMonth, index);
    const amountCents = index === repaymentMonths - 1 ? totalCents - baseCents * (repaymentMonths - 1) : baseCents;
    return {
      id: createPrefixedId("advance_salary_deduction"),
      payrollMonth,
      payrollYear: Number(payrollMonth.slice(0, 4)) || null,
      amount: amountCents / 100,
    };
  });
  validateDeductionScheduleTotal(rows, paidAmount);
  return rows;
};

export const validateDeductionScheduleTotal = (rows: Array<{ amount: number }>, paidAmount: number) => {
  const scheduledCents = rows.reduce((total, row) => total + Math.round(row.amount * 100), 0);
  const paidCents = Math.round(paidAmount * 100);
  if (scheduledCents !== paidCents) throw new ValidationError("Advance salary deduction schedule does not match paid amount.");
};

const holdStatuses = new Set(["HOLD_FOR_MANUAL_ASSIGNMENT", "UNASSIGNED", "SKIPPED"]);
export const assertAdvanceSalaryPaymentExecutionAllowed = async (
  env: Env,
  context: AuthActor,
  request: AdvanceSalaryRequestRecord,
  resolution: OperationResolutionResult,
  options: { purpose?: "execute" | "view" } = {},
) => {
  const purpose = options.purpose ?? "execute";
  if (resolution.status === "BLOCKED") throw new PermissionError(resolution.message || "Advance salary payment execution is blocked by Operation Ownership.");
  if (holdStatuses.has(resolution.status)) return { allowed: false as const, manualReviewMessage: resolution.message || "Advance salary payment execution needs manual assignment." };
  if (resolution.status === "USE_SUPER_ADMIN" && !permissionService.isSuperAdmin(context)) throw new PermissionError("Only Super Admin can execute this advance salary payment fallback.");
  if (permissionService.isSuperAdmin(context)) return { allowed: true as const };
  if (resolution.resolved_user_id && resolution.resolved_user_id !== context.actorUserId) throw new PermissionError("Operation Ownership assigns advance salary payment to another user.");
  const employee = await actorEmployee(env, context);
  if (resolution.resolved_department_id) {
    if (!activeEmployee(employee)) throw new PermissionError("Your linked employee profile is not active for advance salary payment execution.");
    if (employee?.department_id !== resolution.resolved_department_id) throw new PermissionError("Operation Ownership assigns advance salary payment to another department.");
  }
  if (resolution.min_level != null || resolution.max_level != null) {
    if (!activeEmployee(employee) || employee?.level == null) throw new PermissionError("Your employee level is required for advance salary payment execution.");
    if (resolution.min_level != null && employee.level < resolution.min_level) throw new PermissionError("Your employee level is below the execution level configured for this operation.");
    if (resolution.max_level != null && employee.level > resolution.max_level) throw new PermissionError("Your employee level is above the execution level configured for this operation.");
  }
  const requiredPermission = resolution.required_permission ?? (purpose === "execute" ? "advanceSalary.payments.execute" : null);
  const hasVisibilityPermission = permissionService.hasAnyPermission(context, ["advanceSalary.payments.execute", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"]);
  if (purpose === "view") {
    if (!hasVisibilityPermission) throw new PermissionError("You do not have permission to view this advance salary payment queue.");
    if (requiredPermission && !permissionService.hasPermission(context, requiredPermission) && !permissionService.hasPermission(context, "approvals.operationExecutor.view")) {
      throw new PermissionError("You do not have permission to view this operation-owned advance salary payment.");
    }
  } else if (!requiredPermission || !permissionService.hasPermission(context, requiredPermission)) {
    throw new PermissionError("You do not have permission to execute this advance salary payment.");
  }
  if (!(await actorHasRequiredRole(env, context, resolution.required_role_id))) throw new PermissionError("Your role is not allowed to execute this advance salary payment.");
  assertOutletAccess(context, request.outlet_id);
  return { allowed: true as const };
};

export const executeAdvanceSalaryPayment = async (env: Env, context: AuthActor, id: string, input: AdvanceSalaryPaymentInput) => {
  const request = (await getAdvanceSalaryRequest(env, context, id)).advance_salary_request;
  const existingLedger = await repository.findPaymentLedger(env, context.companyId, request.id);
  const existingScheduleCount = (await repository.countDeductionSchedule(env, context.companyId, request.id))?.total ?? 0;
  if (existingLedger) {
    if (request.status === "PAID" && request.payment_status === "PAID" && request.deduction_status === "SCHEDULED" && existingScheduleCount > 0) {
      return { advance_salary_request: request, already_paid: true };
    }
    await repository.updateRequestStatus(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      payment_status: "FAILED",
      payment_error_code: "ADVANCE_SALARY_PAYMENT_PARTIAL_STATE",
      payment_error_message: "Payment ledger exists but paid status or deduction schedule is incomplete.",
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "advance_salary_payment_partial_state", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { has_ledger: true, deduction_rows: existingScheduleCount, status: request.status, payment_status: request.payment_status, deduction_status: request.deduction_status } });
    return { advance_salary_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
  }
  if (!["APPROVED", "PENDING_PAYMENT"].includes(request.status)) throw new ConflictError("Only final-approved advance salary requests can be paid.");
  if (existingScheduleCount > 0) throw new ConflictError("A deduction schedule already exists for this advance salary request.");
  const resolution = await resolvePaymentExecution(env, context, request);
  const execution = await assertAdvanceSalaryPaymentExecutionAllowed(env, context, request, resolution);
  if (!execution.allowed) {
    await repository.updateRequestStatus(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      payment_status: "FAILED",
      payment_error_code: "ADVANCE_SALARY_PAYMENT_NEEDS_MANUAL_ASSIGNMENT",
      payment_error_message: execution.manualReviewMessage,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "advance_salary_payment_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { message: execution.manualReviewMessage, execution_resolution: resolution.status } });
    return { advance_salary_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
  }
  const paymentDate = input.payment_date ?? new Date().toISOString().slice(0, 10);
  const deductionMonth = request.repayment_start_month ?? paymentDate.slice(0, 7);
  const paidAmount = request.approved_amount ?? request.requested_amount;
  const deductions = buildAdvanceSalaryDeductionSchedule(request, paidAmount, deductionMonth);
  for (const deduction of deductions) {
    await assertPayrollMonthUnlocked(env, context.companyId, deduction.payrollMonth);
  }
  try {
    await repository.createPaymentBundle(env, {
      paymentLedgerId: createPrefixedId("advance_salary_payment"),
      legacyAdvanceId: createPrefixedId("advance"),
      companyId: context.companyId,
      request,
      actorUserId: context.actorUserId,
      paymentDate,
      paymentMethod: input.payment_method,
      paymentReference: input.payment_reference,
      bankName: input.bank_name,
      metadata: { reason: input.reason, payment_resolution: resolution.status },
      deductions,
      deductionMonth,
      reason: input.reason,
    });
    await audit(env, context, { action: "advance_salary_payment_executed", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { deduction_month: deductionMonth, deduction_months: deductions.map((deduction) => deduction.payrollMonth) } });
    return { advance_salary_request: await repository.findRequestById(env, context.companyId, request.id), paid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Advance salary payment could not be executed.";
    await repository.updateRequestStatus(env, context.companyId, request.id, {
      status: "FAILED_TO_PAY",
      payment_status: "FAILED",
      payment_error_code: "ADVANCE_SALARY_PAYMENT_FAILED",
      payment_error_message: message,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "advance_salary_payment_failed", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { error: message } });
    throw error;
  }
};

export const getAdvanceSalaryDeductions = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getAdvanceSalaryRequest(env, context, id)).advance_salary_request;
  const deductions = await repository.listDeductionSchedule(env, context.companyId, request.id);
  return { advance_salary_request: request, deductions };
};

export const getAdvanceSalaryTimeline = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getAdvanceSalaryRequest(env, context, id)).advance_salary_request;
  const approval = request.approval_request_id
    ? await approvalEngineService.getTimeline(env, context, request.approval_request_id)
    : { request: null, steps: [], actions: [] };
  const deductions = await repository.listDeductionSchedule(env, context.companyId, request.id);
  return { advance_salary_request: request, ...approval, deductions };
};
