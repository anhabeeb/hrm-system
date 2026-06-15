import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import * as operationOwnershipRepository from "../operation-ownership/operation-ownership.repository";
import { resolveOperationResponsibility } from "../operation-ownership/operation-ownership.service";
import type { OperationResolutionResult } from "../operation-ownership/operation-ownership.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import * as repository from "./employee-exit.repository";
import {
  type EmployeeExitActionInput,
  type EmployeeExitEmployee,
  type EmployeeExitFilters,
  type EmployeeExitRequestInput,
  type EmployeeExitRequestRecord,
  type EmployeeExitTaskRecord,
} from "./employee-exit.types";

const terminalStatuses = ["APPLIED", "COMPLETED", "REJECTED", "CANCELLED", "WITHDRAWN", "FAILED_TO_APPLY"] as const;
const holdStatuses = new Set(["HOLD_FOR_MANUAL_ASSIGNMENT", "UNASSIGNED", "SKIPPED"]);

const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);
const actorEmployee = (env: Env, context: AuthActor) => repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);
const activeEmployee = (employee: EmployeeExitEmployee | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted", "terminated", "resigned", "offboarded"].includes(employee.employment_status ?? "active"));
const todayIsoDate = () => new Date().toISOString().slice(0, 10);
const isFutureDate = (date?: string | null) => Boolean(date && date.slice(0, 10) > todayIsoDate());
const pagination = (filters: EmployeeExitFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const operationPermissions = (operationType: string) => operationType === "OFFBOARDING"
  ? {
      view: "employeeLifecycle.offboarding.view",
      viewOwn: "employeeLifecycle.offboarding.viewOwn",
      viewAll: "employeeLifecycle.exitRequests.viewAll",
      create: "employeeLifecycle.offboarding.create",
      createForOthers: "employeeLifecycle.offboarding.createForOthers",
      review: "employeeLifecycle.offboarding.review",
      finalApprove: "employeeLifecycle.offboarding.finalApprove",
      reject: "employeeLifecycle.offboarding.reject",
      cancel: "employeeLifecycle.offboarding.cancel",
      cancelAny: "employeeLifecycle.offboarding.cancelAny",
      apply: "employeeLifecycle.offboarding.apply",
    }
  : {
      view: "employeeLifecycle.resignations.view",
      viewOwn: "employeeLifecycle.resignations.viewOwn",
      viewAll: "employeeLifecycle.exitRequests.viewAll",
      create: "employeeLifecycle.resignations.create",
      createForOthers: "employeeLifecycle.resignations.createForOthers",
      review: "employeeLifecycle.resignations.review",
      finalApprove: "employeeLifecycle.resignations.finalApprove",
      reject: "employeeLifecycle.resignations.reject",
      cancel: "employeeLifecycle.resignations.cancel",
      cancelAny: "employeeLifecycle.resignations.cancelAny",
      apply: "employeeLifecycle.resignations.apply",
    };

const audit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; employeeId?: string | null; reason?: string | null; details?: Record<string, unknown> }) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "employee_lifecycle",
    action: input.action,
    entityType: "employee_exit_request",
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

const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (!permissionService.hasOutletAccess(context, outletId)) {
    throw new PermissionError("You do not have access to this employee's outlet.");
  }
};

const isGlobalLifecycleActor = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) ||
  permissionService.isAdminOrSuperAdmin(context) ||
  has(context, "employeeLifecycle.exitRequests.viewAll") ||
  has(context, "employeeLifecycle.offboarding.manage") ||
  has(context, "employees.edit");

const canViewAllLifecycleRequests = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) ||
  permissionService.hasAnyPermission(context, [
    "employeeLifecycle.exitRequests.viewAll",
    "employeeLifecycle.offboarding.manage",
    "employeeLifecycle.audit.view",
    "approvals.requests.view",
  ]);

const taskViewPermissions = [
  "employeeLifecycle.offboarding.tasks.view",
  "employeeLifecycle.offboarding.tasks.complete",
  "employeeLifecycle.offboarding.tasks.waive",
  "employeeLifecycle.tasks.manage",
  "employeeLifecycle.offboarding.manage",
];

const taskActionPermissions = (action: "view" | "complete" | "waive") => {
  if (action === "view") return taskViewPermissions;
  return action === "complete"
    ? ["employeeLifecycle.offboarding.tasks.complete", "employeeLifecycle.tasks.manage", "employeeLifecycle.offboarding.manage"]
    : ["employeeLifecycle.offboarding.tasks.waive", "employeeLifecycle.tasks.manage", "employeeLifecycle.offboarding.manage"];
};

type TaskOwnership = {
  ownerResponsibilityType: string;
  ownerDepartmentId?: string | null;
  ownerBusinessFunctionCode?: string | null;
  assignedUserId?: string | null;
  status?: string | null;
  notes?: string | null;
  metadataJson?: string | null;
};

type TaskSpec = {
  code: string;
  name: string;
  responsibility: string;
  required: (request: EmployeeExitRequestRecord) => number;
  functions?: string[];
  subjectDepartment?: boolean;
};

const taskSpecs: TaskSpec[] = [
  { code: "DEPARTMENT_HANDOVER", name: "Department handover", responsibility: "DEPARTMENT_REVIEW", subjectDepartment: true, required: () => 1 },
  { code: "DOCUMENT_HANDOVER", name: "Document handover", responsibility: "AUDIT_VIEW", functions: ["DOCUMENT_KYC_FUNCTION", "HR_FUNCTION"], required: () => 1 },
  { code: "FINAL_ATTENDANCE_REVIEW", name: "Final attendance review", responsibility: "EXECUTION", functions: ["ATTENDANCE_FUNCTION"], required: () => 1 },
  { code: "LEAVE_BALANCE_REVIEW", name: "Leave balance review", responsibility: "EXECUTION", functions: ["HR_FUNCTION", "EMPLOYEE_STRUCTURE_FUNCTION"], required: () => 1 },
  { code: "ADVANCE_BALANCE_REVIEW", name: "Advance balance review", responsibility: "EXECUTION", functions: ["PAYROLL_FUNCTION", "FINANCE_FUNCTION"], required: () => 1 },
  { code: "PAYROLL_SETTLEMENT_REVIEW", name: "Final settlement review", responsibility: "EXECUTION", functions: ["PAYROLL_FUNCTION", "FINANCE_FUNCTION"], required: () => 1 },
  { code: "BIOMETRIC_ACCESS_REVIEW", name: "Biometric access review", responsibility: "CONFIGURATION", functions: ["DEVICE_MANAGEMENT_FUNCTION"], required: () => 1 },
  { code: "KIOSK_ACCESS_REVIEW", name: "Kiosk access review", responsibility: "CONFIGURATION", functions: ["KIOSK_FUNCTION"], required: () => 1 },
  { code: "LOGIN_DISABLE_REVIEW", name: "Login disable review", responsibility: "CONFIGURATION", functions: ["SECURITY_FUNCTION", "GENERAL_ADMIN_FUNCTION"], required: () => 1 },
  { code: "EXIT_INTERVIEW", name: "Exit interview", responsibility: "OWNER", functions: ["HR_FUNCTION", "GENERAL_ADMIN_FUNCTION"], required: (request) => request.exit_interview_required !== 1 ? 0 : 1 },
];

const canCreateForEmployee = async (context: AuthActor, requester: EmployeeExitEmployee | null, subject: EmployeeExitEmployee, operationType: string) => {
  const permissions = operationPermissions(operationType);
  if (!has(context, permissions.create) && !has(context, permissions.createForOthers)) {
    throw new PermissionError("You do not have permission to create resignation or offboarding requests.");
  }
  if (permissionService.isSuperAdmin(context)) return;
  if (requester?.id === subject.id) return;
  if (!has(context, permissions.createForOthers)) throw new PermissionError("You cannot create resignation or offboarding requests for another employee.");
  if (isGlobalLifecycleActor(context)) return;
  if (!activeEmployee(requester)) throw new PermissionError("Your linked employee profile is not active for department-scoped lifecycle requests.");
  if (requester?.department_id !== subject.department_id) throw new PermissionError("Department managers can create lifecycle requests only for employees in their own department.");
  if ((requester.level ?? 0) <= (subject.level ?? 0)) throw new PermissionError("Department managers can create lifecycle requests only for lower-level employees.");
};

const resolveFunctionDepartment = async (env: Env, companyId: string, functionCodes: string[]) => {
  for (const code of functionCodes) {
    const businessFunction = await operationOwnershipRepository.findBusinessFunctionByCode(env, companyId, code);
    if (!businessFunction || businessFunction.is_active !== 1 || businessFunction.archived_at) continue;
    const assignment = await operationOwnershipRepository.findPrimaryFunctionAssignment(env, companyId, businessFunction.id);
    if (assignment?.department_id && assignment.is_active === 1 && assignment.department_status !== "disabled" && assignment.department_status !== "inactive") {
      return {
        departmentId: assignment.department_id,
        businessFunctionCode: businessFunction.code,
        businessFunctionId: businessFunction.id,
        message: `Task ownership resolved through ${businessFunction.code}.`,
      };
    }
  }
  return null;
};

const resolveTaskOwnership = async (env: Env, context: AuthActor, request: EmployeeExitRequestRecord, spec: TaskSpec): Promise<TaskOwnership> => {
  // Task ownership uses per-task Operation Ownership functions; it is not a blanket OFFBOARDING EXECUTION assignment.
  if (spec.subjectDepartment) {
    return {
      ownerResponsibilityType: "SUBJECT_DEPARTMENT",
      ownerDepartmentId: request.department_id,
      ownerBusinessFunctionCode: "SUBJECT_DEPARTMENT",
      metadataJson: JSON.stringify({ source: "subject_department", task_code: spec.code }),
      notes: request.department_id ? null : "Subject employee department could not be resolved; manual assignment is required.",
      status: request.department_id ? "PENDING" : "PENDING_MANUAL_ASSIGNMENT",
    };
  }
  const functionResolution = await resolveFunctionDepartment(env, context.companyId, spec.functions ?? []);
  if (functionResolution) {
    return {
      ownerResponsibilityType: spec.responsibility,
      ownerDepartmentId: functionResolution.departmentId,
      ownerBusinessFunctionCode: functionResolution.businessFunctionCode,
      metadataJson: JSON.stringify({ source: "business_function", business_function_id: functionResolution.businessFunctionId, task_code: spec.code }),
    };
  }
  const fallback = await resolveOperationResponsibility(env, context, {
    operation_code: "OFFBOARDING",
    responsibility_type: spec.responsibility as any,
    subject_employee_id: request.employee_id,
    requester_employee_id: request.requester_employee_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });
  return {
    ownerResponsibilityType: spec.responsibility,
    ownerDepartmentId: fallback.resolved_department_id,
    ownerBusinessFunctionCode: fallback.resolved_business_function_code ?? (spec.functions ?? [])[0] ?? null,
    assignedUserId: fallback.resolved_user_id,
    status: fallback.status === "RESOLVED" || fallback.status === "USE_SUPER_ADMIN" ? "PENDING" : "PENDING_MANUAL_ASSIGNMENT",
    notes: fallback.status === "RESOLVED" || fallback.status === "USE_SUPER_ADMIN" ? null : `Manual assignment required: ${fallback.message}`,
    metadataJson: JSON.stringify({ source: "operation_ownership_fallback", task_code: spec.code, resolution_status: fallback.status, fallback_applied: fallback.fallback_applied }),
  };
};

// Contract coverage: approval_request is created with operation_type RESIGNATION or OFFBOARDING.
export const buildEmployeeExitVisibilityFilter = async (env: Env, context: AuthActor) => {
  // viewOwn is self-service scope; view/viewAll/manage/audit are admin scope only when paired with explicit global authority.
  if (canViewAllLifecycleRequests(context)) {
    return { sql: undefined, values: [] as unknown[] };
  }
  const clauses = ["r.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (employee?.id) {
    clauses.push("r.employee_id = ?", "r.requester_employee_id = ?");
    values.push(employee.id, employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, [
    "approvals.department.view",
    "approvals.department.approve",
    "approvals.department.reject",
    "employeeLifecycle.resignations.review",
    "employeeLifecycle.offboarding.review",
    "approvals.operationOwner.view",
    "approvals.operationOwner.approve",
  ])) {
    clauses.push("(r.department_id = ? AND (r.level IS NULL OR ? > r.level OR ? >= 3))");
    values.push(employee.department_id, employee.level ?? 0, employee.level ?? 0);
  }
  if (permissionService.hasAnyPermission(context, taskViewPermissions)) {
    clauses.push("EXISTS (SELECT 1 FROM employee_offboarding_tasks t WHERE t.company_id = r.company_id AND t.exit_request_id = r.id AND t.assigned_user_id = ?)");
    values.push(context.actorUserId);
    if (employee?.department_id) {
      // Task visibility is row-scoped: task permissions only reveal tasks owned by the actor's department/function.
      clauses.push("EXISTS (SELECT 1 FROM employee_offboarding_tasks t WHERE t.company_id = r.company_id AND t.exit_request_id = r.id AND t.owner_department_id = ?)");
      values.push(employee.department_id);
    }
  }
  if (permissionService.hasAnyPermission(context, [
    "approvals.operationFinal.view",
    "approvals.operationFinal.approve",
    "employeeLifecycle.resignations.finalApprove",
    "employeeLifecycle.offboarding.finalApprove",
  ])) {
    clauses.push("r.status IN ('PENDING_FINAL_APPROVAL','PENDING_OWNER_REVIEW','PENDING_DEPARTMENT_REVIEW','PENDING_MANUAL_REVIEW','APPROVED','PENDING_APPLICATION')");
  }
  if (permissionService.hasAnyPermission(context, [
    "approvals.operationExecutor.view",
    "approvals.operationExecutor.apply",
    "employeeLifecycle.resignations.apply",
    "employeeLifecycle.offboarding.apply",
    "employeeLifecycle.offboarding.complete",
  ])) {
    clauses.push("r.status IN ('APPROVED','PENDING_APPLICATION','OFFBOARDING_IN_PROGRESS','PENDING_CLEARANCE','CLEARED','PENDING_MANUAL_REVIEW')");
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

const canViewEmployeeExitRequest = async (env: Env, context: AuthActor, request: EmployeeExitRequestRecord) => {
  const permissions = operationPermissions(request.operation_type);
  if (canViewAllLifecycleRequests(context)) return true;
  if (request.requester_user_id === context.actorUserId) return true;
  const employee = await actorEmployee(env, context);
  if (employee?.id && (employee.id === request.employee_id || employee.id === request.requester_employee_id)) return true;
  if (employee?.department_id === request.department_id && permissionService.hasAnyPermission(context, [permissions.review, "approvals.department.view", "approvals.department.approve", "approvals.operationOwner.view", "approvals.operationOwner.approve"])) return true;
  if (request.approval_request_id && permissionService.hasAnyPermission(context, ["approvals.operationFinal.view", "approvals.operationFinal.approve", "approvals.operationExecutor.view", "approvals.operationExecutor.apply"])) {
    try {
      await approvalEngineService.getTimeline(env, context, request.approval_request_id);
      return true;
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  if (["APPROVED", "PENDING_APPLICATION", "OFFBOARDING_IN_PROGRESS", "PENDING_CLEARANCE"].includes(request.status) && permissionService.hasAnyPermission(context, [permissions.apply, "approvals.operationExecutor.apply", "approvals.operationExecutor.view"])) {
    const resolution = await resolveEmployeeExitExecution(env, context, request);
    const execution = await assertEmployeeExitExecutionAllowed(env, context, request, resolution, { purpose: "view" });
    if (execution.allowed) return true;
  }
  if (permissionService.hasAnyPermission(context, taskViewPermissions)) {
    const tasks = await repository.listTasks(env, context.companyId, request.id);
    if (await canViewOffboardingTasks(env, context, tasks)) return true;
  }
  throw new PermissionError("You do not have access to this resignation or offboarding request.");
};

export const listEmployeeExitRequests = async (env: Env, context: AuthActor, filters: EmployeeExitFilters) => {
  const visibility = await buildEmployeeExitVisibilityFilter(env, context);
  const [total, rows] = await Promise.all([
    repository.countRequests(env, context.companyId, filters, visibility.sql, visibility.values),
    repository.listRequests(env, context.companyId, filters, visibility.sql, visibility.values),
  ]);
  const visibleRows: EmployeeExitRequestRecord[] = [];
  for (const row of rows) {
    try {
      await canViewEmployeeExitRequest(env, context, row);
      visibleRows.push(row);
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  return { rows: visibleRows, pagination: pagination(filters, Math.min(total, visibleRows.length)) };
};

export const getEmployeeExitRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested resignation or offboarding request could not be found.");
  await canViewEmployeeExitRequest(env, context, request);
  return { employee_exit_request: request };
};

export const createEmployeeExitRequest = async (env: Env, context: AuthActor, input: EmployeeExitRequestInput) => {
  const requester = await actorEmployee(env, context);
  const subjectId = input.employee_id ?? requester?.id ?? null;
  if (!subjectId) throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.");
  const subject = await repository.findEmployee(env, context.companyId, subjectId);
  if (!activeEmployee(subject)) throw new ValidationError("Please choose an active employee for this request.");
  assertOutletAccess(context, subject?.primary_outlet_id);
  const operationType = input.operation_type ?? "RESIGNATION";
  await canCreateForEmployee(context, requester, subject!, operationType);
  if ((await repository.employeeHasActiveSuperAdminUser(env, context.companyId, subject!.id)) && (await repository.countActiveSuperAdmins(env, context.companyId)) <= 1) {
    throw new ValidationError("You cannot offboard the last active Super Admin.");
  }
  const duplicate = await repository.findDuplicateActiveRequest(env, {
    companyId: context.companyId,
    employeeId: subject!.id,
    operationType,
    requestType: input.request_type,
  });
  if (duplicate) throw new ConflictError("This employee already has an active resignation or offboarding request.");
  const id = createPrefixedId("emp_exit_req");
  await repository.createRequest(env, {
    id,
    companyId: context.companyId,
    actorUserId: context.actorUserId,
    requesterEmployeeId: requester?.id ?? null,
    subject: subject!,
    payload: { ...input, operation_type: operationType },
  });
  await audit(env, context, { action: "employee_exit_request_created", entityId: id, employeeId: subject!.id, reason: input.reason });
  return getEmployeeExitRequest(env, context, id);
};

const approvalStatusToExitStatus = (approval: any): EmployeeExitRequestRecord["status"] => {
  if (!approval) return "PENDING";
  if (approval.status === "NEEDS_MANUAL_ASSIGNMENT" || approval.status === "ESCALATED") return "PENDING_MANUAL_REVIEW";
  if (approval.status === "APPROVED") return "APPROVED";
  if (approval.status === "REJECTED") return "REJECTED";
  if (approval.status === "CANCELLED") return "CANCELLED";
  if (approval.current_step_name?.toLowerCase().includes("final")) return "PENDING_FINAL_APPROVAL";
  if (approval.current_step_name?.toLowerCase().includes("department")) return "PENDING_DEPARTMENT_REVIEW";
  return "PENDING_OWNER_REVIEW";
};

export const submitEmployeeExitForApproval = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This resignation or offboarding request has already been completed.");
  if (request.approval_request_id) return { employee_exit_request: request, already_submitted: true };
  const permissions = operationPermissions(request.operation_type);
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: request.operation_type,
    subject_type: "EMPLOYEE_EXIT",
    subject_id: request.id,
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.department_id,
    position_id: request.position_id,
    level: request.level,
    title: `${request.operation_type.replace(/_/g, " ")} ${request.request_type.replace(/_/g, " ")}`,
    summary: request.reason,
    payload_json: {
      employee_exit_request_id: request.id,
      operation_type: request.operation_type,
      request_type: request.request_type,
      requested_last_working_date: request.requested_last_working_date,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: permissions.createForOthers,
    moduleOperationType: request.operation_type,
  });
  if (!draft) throw new ValidationError(`No active ${request.operation_type.toLowerCase()} approval workflow is configured.`);
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const status = approvalStatusToExitStatus(submitted);
  await repository.updateRequest(env, context.companyId, request.id, {
    approval_request_id: draft.id,
    approval_status: submitted?.status ?? "IN_REVIEW",
    approval_current_step: submitted?.current_step_id ?? null,
    approval_submitted_at: new Date().toISOString(),
    status,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "employee_exit_submitted_for_approval", entityId: request.id, employeeId: request.employee_id, reason: request.reason, details: { approval_request_id: draft.id, status } });
  return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), already_submitted: false };
};

const ensureTasksGenerated = async (env: Env, context: AuthActor, request: EmployeeExitRequestRecord) => {
  if (await repository.countTasksForRequest(env, context.companyId, request.id)) return;
  const tasks = [];
  for (const spec of taskSpecs) {
    const ownership = await resolveTaskOwnership(env, context, request, spec);
    tasks.push({
      id: createPrefixedId("exit_task"),
      taskCode: spec.code,
      taskName: spec.name,
      taskType: spec.code,
      required: spec.required(request),
      status: ownership.status ?? "PENDING",
      notes: ownership.notes,
      ownerResponsibilityType: ownership.ownerResponsibilityType,
      ownerDepartmentId: ownership.ownerDepartmentId,
      ownerBusinessFunctionCode: ownership.ownerBusinessFunctionCode,
      assignedUserId: ownership.assignedUserId,
      metadataJson: ownership.metadataJson,
    });
  }
  await repository.createDefaultTasks(env, { companyId: context.companyId, requestId: request.id, employeeId: request.employee_id, actorUserId: context.actorUserId, tasks });
  await repository.updateRequest(env, context.companyId, request.id, { offboarding_checklist_status: "GENERATED", updated_by: context.actorUserId });
  await audit(env, context, { action: "employee_offboarding_tasks_generated", entityId: request.id, employeeId: request.employee_id, details: { task_count: tasks.length } });
};

export const approveEmployeeExitStep = async (env: Env, context: AuthActor, id: string, input: EmployeeExitActionInput) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  if (!request.approval_request_id) throw new ConflictError("This request has not been submitted for approval.");
  const approval = await approvalEngineService.approveStep(env, context, request.approval_request_id, input.reason, { allowModuleBoundAction: true, moduleOperationType: request.operation_type });
  const status = approvalStatusToExitStatus(approval);
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
    update.status = request.operation_type === "OFFBOARDING" ? "PENDING_CLEARANCE" : "PENDING_APPLICATION";
  }
  await repository.updateRequest(env, context.companyId, request.id, update);
  if (approval?.status === "APPROVED") await ensureTasksGenerated(env, context, { ...request, status: update.status as any });
  await audit(env, context, { action: "employee_exit_approved", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const rejectEmployeeExitStep = async (env: Env, context: AuthActor, id: string, input: EmployeeExitActionInput) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  if (!request.approval_request_id) throw new ConflictError("This request has not been submitted for approval.");
  const approval = await approvalEngineService.rejectStep(env, context, request.approval_request_id, input.reason, input.note ?? input.reason, { allowModuleBoundAction: true, moduleOperationType: request.operation_type });
  await repository.updateRequest(env, context.companyId, request.id, {
    status: "REJECTED",
    approval_status: approval?.status ?? "REJECTED",
    approval_current_step: null,
    rejected_at: new Date().toISOString(),
    rejected_by: context.actorUserId,
    rejection_reason: input.reason,
    approval_completed_at: new Date().toISOString(),
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "employee_exit_rejected", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const cancelEmployeeExitRequest = async (env: Env, context: AuthActor, id: string, input: EmployeeExitActionInput) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  if (["APPLIED", "COMPLETED", "REJECTED", "CANCELLED", "WITHDRAWN"].includes(request.status)) throw new ConflictError("This request has already been completed.");
  const permissions = operationPermissions(request.operation_type);
  if (request.approval_request_id) {
    await approvalEngineService.cancelRequest(env, context, request.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleOperationType: request.operation_type,
      moduleCancelPermission: permissions.cancel,
      moduleCancelAnyPermission: permissions.cancelAny,
    });
  }
  const own = request.requester_user_id === context.actorUserId || (await actorEmployee(env, context))?.id === request.employee_id;
  const status = request.operation_type === "RESIGNATION" && own ? "WITHDRAWN" : "CANCELLED";
  await repository.updateRequest(env, context.companyId, request.id, {
    status,
    approval_status: request.approval_request_id ? "CANCELLED" : request.approval_status,
    approval_current_step: null,
    cancelled_at: status === "CANCELLED" ? new Date().toISOString() : request.cancelled_at,
    cancelled_by: status === "CANCELLED" ? context.actorUserId : request.cancelled_by,
    cancellation_reason: input.reason,
    withdrawn_at: status === "WITHDRAWN" ? new Date().toISOString() : request.withdrawn_at,
    withdrawn_by: status === "WITHDRAWN" ? context.actorUserId : request.withdrawn_by,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: status === "WITHDRAWN" ? "employee_resignation_withdrawn" : "employee_exit_cancelled", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id) };
};

const actorHasRequiredRole = async (env: Env, context: AuthActor, requiredRoleId?: string | null) => {
  if (!requiredRoleId || permissionService.isSuperAdmin(context)) return true;
  if (context.roleKeys.includes(requiredRoleId) || context.roles.includes(requiredRoleId)) return true;
  const roles = await permissionService.getUserRoles(env, context.companyId, context.actorUserId);
  return roles.some((role) => role.id === requiredRoleId || role.role_key === requiredRoleId || role.role_name === requiredRoleId);
};

const resolveEmployeeExitExecution = (env: Env, context: AuthActor, request: EmployeeExitRequestRecord) =>
  resolveOperationResponsibility(env, context, {
    operation_code: request.operation_type,
    responsibility_type: "EXECUTION",
    subject_employee_id: request.employee_id,
    requester_employee_id: request.requester_employee_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });

// Contract coverage: Operation Ownership execution target is enforced before apply.
const assertEmployeeExitExecutionAllowed = async (
  env: Env,
  context: AuthActor,
  request: EmployeeExitRequestRecord,
  resolution: OperationResolutionResult,
  options: { purpose?: "apply" | "view" } = {},
) => {
  const purpose = options.purpose ?? "apply";
  if (resolution.status === "BLOCKED") throw new PermissionError(resolution.message || "Employee lifecycle execution is blocked by Operation Ownership.");
  if (holdStatuses.has(resolution.status)) return { allowed: false as const, manualReviewMessage: resolution.message || "Employee lifecycle execution needs manual assignment." };
  if (resolution.status === "USE_SUPER_ADMIN" && !permissionService.isSuperAdmin(context)) throw new PermissionError("Only Super Admin can execute this employee lifecycle fallback.");
  if (permissionService.isSuperAdmin(context)) return { allowed: true as const };
  if (resolution.resolved_user_id && resolution.resolved_user_id !== context.actorUserId) throw new PermissionError("Operation Ownership assigns employee lifecycle execution to another user.");
  const employee = await actorEmployee(env, context);
  if (resolution.resolved_department_id) {
    if (!activeEmployee(employee)) throw new PermissionError("Your linked employee profile is not active for employee lifecycle execution.");
    if (employee?.department_id !== resolution.resolved_department_id) throw new PermissionError("Operation Ownership assigns employee lifecycle execution to another department.");
  }
  if (resolution.min_level != null || resolution.max_level != null) {
    if (!activeEmployee(employee) || employee?.level == null) throw new PermissionError("Your employee level is required for employee lifecycle execution.");
    if (resolution.min_level != null && employee.level < resolution.min_level) throw new PermissionError("Your employee level is below the execution level configured for this operation.");
    if (resolution.max_level != null && employee.level > resolution.max_level) throw new PermissionError("Your employee level is above the execution level configured for this operation.");
  }
  const permissions = operationPermissions(request.operation_type);
  const visibilityPermission = permissionService.hasAnyPermission(context, [permissions.apply, "employeeLifecycle.offboarding.complete", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"]);
  const requiredPermission = resolution.required_permission ?? (purpose === "apply" ? permissions.apply : null);
  if (purpose === "view") {
    if (!visibilityPermission) throw new PermissionError("You do not have permission to view this employee lifecycle execution queue.");
  } else if (!requiredPermission || !permissionService.hasPermission(context, requiredPermission)) {
    throw new PermissionError("You do not have permission to apply this resignation or offboarding request.");
  }
  if (!(await actorHasRequiredRole(env, context, resolution.required_role_id))) throw new PermissionError("Your role is not allowed to execute this employee lifecycle request.");
  assertOutletAccess(context, request.outlet_id);
  return { allowed: true as const };
};

export const applyApprovedEmployeeExitRequest = async (env: Env, context: AuthActor, id: string, input: EmployeeExitActionInput) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  if (["APPLIED", "COMPLETED"].includes(request.status)) return { employee_exit_request: request, already_applied: true };
  if (!["APPROVED", "PENDING_APPLICATION", "PENDING_CLEARANCE", "APPROVED_PENDING_LAST_WORKING_DATE", "NOTICE_PERIOD"].includes(request.status)) throw new ConflictError("Only final-approved resignation or offboarding requests can be applied.");
  const resolution = await resolveEmployeeExitExecution(env, context, request);
  const execution = await assertEmployeeExitExecutionAllowed(env, context, request, resolution);
  if (!execution.allowed) {
    await repository.updateRequest(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "EMPLOYEE_LIFECYCLE_EXECUTION_NEEDS_MANUAL_ASSIGNMENT",
      apply_error_message: execution.manualReviewMessage,
      execution_resolution_json: JSON.stringify(resolution),
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "employee_exit_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { execution_resolution: resolution.status } });
    return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
  }
  if (request.operation_type === "OFFBOARDING") {
    // Contract coverage: final approval generates default offboarding tasks.
    await ensureTasksGenerated(env, context, request);
    await repository.updateRequest(env, context.companyId, request.id, {
      status: "OFFBOARDING_IN_PROGRESS",
      execution_resolution_json: JSON.stringify(resolution),
      execution_note: "Offboarding started after final approval. Login disable waits for checklist completion.",
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "employee_offboarding_started", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { execution_resolution: resolution.status } });
    return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), offboarding_started: true };
  }
  const lastWorkingDate = request.approved_last_working_date ?? request.requested_last_working_date;
  if (!lastWorkingDate && request.request_type !== "IMMEDIATE_RESIGNATION") {
    await repository.updateRequest(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "MISSING_LAST_WORKING_DATE",
      apply_error_message: "Last working date is required before applying an approved resignation.",
      execution_resolution_json: JSON.stringify(resolution),
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "employee_resignation_apply_held_missing_last_working_date", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { login_disabled: false } });
    return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
  }
  if (isFutureDate(lastWorkingDate) && request.request_type !== "IMMEDIATE_RESIGNATION") {
    await ensureTasksGenerated(env, context, request);
    await repository.updateRequest(env, context.companyId, request.id, {
      status: "APPROVED_PENDING_LAST_WORKING_DATE",
      execution_resolution_json: JSON.stringify(resolution),
      execution_note: `Resignation approved and waiting until last working date ${lastWorkingDate}. Employee login remains active during notice period.`,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "employee_resignation_notice_period_started", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { last_working_date: lastWorkingDate, login_disabled: false } });
    return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), waiting_for_last_working_date: true };
  }
  await repository.applyEmployeeExitStatus(env, {
    companyId: context.companyId,
    request,
    actorUserId: context.actorUserId,
    newStatus: "resigned",
    disableLogin: false,
    reason: input.reason,
    statusHistoryId: createPrefixedId("exit_status"),
  });
  await audit(env, context, {
    action: ["APPROVED_PENDING_LAST_WORKING_DATE", "NOTICE_PERIOD"].includes(request.status) ? "employee_resignation_applied_after_notice" : "employee_resignation_applied",
    entityId: request.id,
    employeeId: request.employee_id,
    reason: input.reason,
    details: { last_working_date: lastWorkingDate, login_disabled: false },
  });
  return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), applied: true };
};

export const completeEmployeeExitOffboarding = async (env: Env, context: AuthActor, id: string, input: EmployeeExitActionInput) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  if (request.status === "COMPLETED") return { employee_exit_request: request, already_completed: true };
  if (!["OFFBOARDING_IN_PROGRESS", "PENDING_CLEARANCE", "CLEARED"].includes(request.status)) throw new ConflictError("Offboarding can be completed only after final approval and start.");
  const openRequiredTasks = await repository.countOpenRequiredTasks(env, context.companyId, request.id);
  // Contract coverage: required tasks block final completion.
  if (openRequiredTasks > 0) throw new ConflictError("Required offboarding tasks must be completed or waived before completion.");
  const resolution = await resolveEmployeeExitExecution(env, context, request);
  const execution = await assertEmployeeExitExecutionAllowed(env, context, request, resolution);
  if (!execution.allowed) throw new PermissionError(execution.manualReviewMessage);
  if (request.access_disable_required === 1 && (await repository.employeeHasActiveSuperAdminUser(env, context.companyId, request.employee_id)) && (await repository.countActiveSuperAdmins(env, context.companyId)) <= 1) {
    throw new ValidationError("You cannot disable the last active Super Admin login.");
  }
  await repository.applyEmployeeExitStatus(env, {
    companyId: context.companyId,
    request,
    actorUserId: context.actorUserId,
    newStatus: "terminated",
    disableLogin: request.access_disable_required === 1,
    reason: input.reason,
    statusHistoryId: createPrefixedId("exit_status"),
  });
  // Contract coverage: login disabled only at approved offboarding completion.
  await audit(env, context, { action: "employee_offboarding_completed", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { login_disabled: request.access_disable_required === 1 } });
  return { employee_exit_request: await repository.findRequestById(env, context.companyId, request.id), completed: true };
};

export const buildOffboardingTaskVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasAnyPermission(context, ["employeeLifecycle.tasks.manage", "employeeLifecycle.offboarding.manage"])) {
    return { sql: undefined, values: [] as unknown[] };
  }
  const clauses = ["assigned_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (activeEmployee(employee) && employee?.department_id) {
    clauses.push("owner_department_id = ?");
    values.push(employee.department_id);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

const canActOnOffboardingTask = async (env: Env, context: AuthActor, task: EmployeeExitTaskRecord, action: "view" | "complete" | "waive") => {
  if (permissionService.isSuperAdmin(context)) return true;
  const permissions = taskActionPermissions(action);
  if (!permissionService.hasAnyPermission(context, permissions)) return false;
  if (permissionService.hasAnyPermission(context, ["employeeLifecycle.tasks.manage", "employeeLifecycle.offboarding.manage"])) return true;
  if (task.assigned_user_id && task.assigned_user_id === context.actorUserId) return true;
  const employee = await actorEmployee(env, context);
  if (!activeEmployee(employee)) return false;
  if (task.owner_department_id && employee?.department_id === task.owner_department_id) return true;
  if (task.owner_business_function_code) {
    const functionResolution = await resolveFunctionDepartment(env, context.companyId, [task.owner_business_function_code]);
    if (functionResolution?.departmentId && employee?.department_id === functionResolution.departmentId) return true;
  }
  return false;
};

export const canViewOffboardingTask = (env: Env, context: AuthActor, task: EmployeeExitTaskRecord) =>
  canActOnOffboardingTask(env, context, task, "view");

export const canViewOffboardingTasks = async (env: Env, context: AuthActor, tasks: EmployeeExitTaskRecord[]) => {
  for (const task of tasks) {
    if (await canViewOffboardingTask(env, context, task)) return true;
  }
  return false;
};

const assertCanCompleteOffboardingTask = async (env: Env, context: AuthActor, task: EmployeeExitTaskRecord) => {
  if (!(await canActOnOffboardingTask(env, context, task, "complete"))) {
    throw new PermissionError("You are not assigned to complete this offboarding task.");
  }
};

const assertCanWaiveOffboardingTask = async (env: Env, context: AuthActor, task: EmployeeExitTaskRecord) => {
  if (!(await canActOnOffboardingTask(env, context, task, "waive"))) {
    throw new PermissionError("You are not assigned to waive this offboarding task.");
  }
};

export const listEmployeeExitTasks = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested resignation or offboarding request could not be found.");
  const tasks = await repository.listTasks(env, context.companyId, id);
  let requestVisible = false;
  try {
    requestVisible = await canViewEmployeeExitRequest(env, context, request);
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
  }
  if (requestVisible && (canViewAllLifecycleRequests(context) || request.requester_user_id === context.actorUserId || (await actorEmployee(env, context))?.id === request.employee_id)) {
    return { employee_exit_request: request, tasks };
  }
  const visibleTasks: EmployeeExitTaskRecord[] = [];
  for (const task of tasks) {
    if (await canViewOffboardingTask(env, context, task)) visibleTasks.push(task);
  }
  if (!requestVisible && visibleTasks.length === 0) {
    throw new PermissionError("You do not have access to these offboarding tasks.");
  }
  return { employee_exit_request: request, tasks: visibleTasks };
};

export const completeEmployeeExitTask = async (env: Env, context: AuthActor, id: string, taskId: string, input: EmployeeExitActionInput) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  const task = await repository.findTask(env, context.companyId, id, taskId);
  if (!task) throw new NotFoundError("The requested offboarding task could not be found.");
  await assertCanCompleteOffboardingTask(env, context, task);
  await repository.updateTaskStatus(env, { companyId: context.companyId, requestId: id, taskId, status: "COMPLETED", actorUserId: context.actorUserId, notes: input.note ?? input.reason });
  await audit(env, context, { action: "employee_offboarding_task_completed", entityId: id, employeeId: request.employee_id, reason: input.reason, details: { task_id: taskId, task_type: task.task_type } });
  return listEmployeeExitTasks(env, context, id);
};

export const waiveEmployeeExitTask = async (env: Env, context: AuthActor, id: string, taskId: string, input: EmployeeExitActionInput) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  const task = await repository.findTask(env, context.companyId, id, taskId);
  if (!task) throw new NotFoundError("The requested offboarding task could not be found.");
  if (!input.reason?.trim()) throw new ValidationError("This task requires a reason to waive.");
  await assertCanWaiveOffboardingTask(env, context, task);
  await repository.updateTaskStatus(env, { companyId: context.companyId, requestId: id, taskId, status: "WAIVED", actorUserId: context.actorUserId, notes: input.reason });
  await audit(env, context, { action: "employee_offboarding_task_waived", entityId: id, employeeId: request.employee_id, reason: input.reason, details: { task_id: taskId, task_type: task.task_type } });
  return listEmployeeExitTasks(env, context, id);
};

export const getEmployeeExitTimeline = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getEmployeeExitRequest(env, context, id)).employee_exit_request;
  let approval = { request: null, steps: [], actions: [] } as any;
  if (request.approval_request_id) {
    try {
      approval = await approvalEngineService.getTimeline(env, context, request.approval_request_id);
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  const taskResult = await listEmployeeExitTasks(env, context, id);
  return { employee_exit_request: request, tasks: taskResult.tasks, ...approval };
};

export const getEmployeeExitAudit = async (env: Env, context: AuthActor, id: string) => {
  // Approval actions plus lifecycle task events form the official audit timeline for this phase.
  return getEmployeeExitTimeline(env, context, id);
};
