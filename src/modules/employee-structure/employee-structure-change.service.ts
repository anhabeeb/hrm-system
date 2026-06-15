import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import { resolveOperationResponsibility } from "../operation-ownership/operation-ownership.service";
import type { OperationResolutionResult } from "../operation-ownership/operation-ownership.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import * as baseStructureService from "./employee-structure.service";
import * as repository from "./employee-structure-change.repository";
import {
  type EmployeeStructureChangeActionInput,
  type EmployeeStructureChangeEmployee,
  type EmployeeStructureChangeFilters,
  type EmployeeStructureChangeInput,
  type EmployeeStructureChangeRequestRecord,
} from "./employee-structure-change.types";

const terminalStatuses = ["APPLIED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"] as const;
const holdStatuses = new Set(["HOLD_FOR_MANUAL_ASSIGNMENT", "UNASSIGNED", "SKIPPED"]);

const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);
const actorEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);
const activeEmployee = (employee: EmployeeStructureChangeEmployee | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted", "terminated", "resigned"].includes(employee.employment_status ?? "active"));
const pagination = (filters: EmployeeStructureChangeFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const audit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; employeeId?: string | null; reason?: string | null; details?: Record<string, unknown> }) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "employee_structure_change",
    action: input.action,
    entityType: "employee_structure_change_request",
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

const canRequestRoleTemplateApply = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) ||
  permissionService.hasAnyPermission(context, ["employees.structure.roleTemplate.apply", "users.edit", "roles.edit", "employees.structure.manage"]);

const isGlobalStructureActor = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) || permissionService.isAdminOrSuperAdmin(context) || has(context, "employees.structure.manage");

const actorHasRequiredRole = async (env: Env, context: AuthActor, requiredRoleId?: string | null) => {
  if (!requiredRoleId || permissionService.isSuperAdmin(context)) return true;
  if (context.roleKeys.includes(requiredRoleId) || context.roles.includes(requiredRoleId)) return true;
  const roles = await permissionService.getUserRoles(env, context.companyId, context.actorUserId);
  return roles.some((role) => role.id === requiredRoleId || role.role_key === requiredRoleId || role.role_name === requiredRoleId);
};

const approvalStatusToStructureStatus = (approval: any): EmployeeStructureChangeRequestRecord["status"] => {
  if (!approval) return "PENDING";
  if (approval.status === "NEEDS_MANUAL_ASSIGNMENT" || approval.status === "ESCALATED") return "PENDING_MANUAL_REVIEW";
  if (approval.status === "APPROVED") return "PENDING_APPLICATION";
  if (approval.status === "REJECTED") return "REJECTED";
  if (approval.status === "CANCELLED") return "CANCELLED";
  if (approval.current_step_name?.toLowerCase().includes("final")) return "PENDING_FINAL_APPROVAL";
  if (approval.current_step_name?.toLowerCase().includes("target")) return "PENDING_TARGET_DEPARTMENT_REVIEW";
  if (approval.current_step_name?.toLowerCase().includes("current")) return "PENDING_CURRENT_DEPARTMENT_REVIEW";
  return "PENDING_OWNER_REVIEW";
};

const ensureDepartment = async (env: Env, companyId: string, departmentId: string) => {
  const department = await repository.findDepartment(env, companyId, departmentId);
  if (!department) throw new ValidationError("Please choose a valid target department.");
  if (department.archived_at || department.deleted_at || department.is_active === 0 || department.status === "disabled" || department.status === "inactive") {
    throw new ValidationError("Inactive departments cannot be used for employee transfer or structure change requests.");
  }
  return department;
};

const ensurePosition = async (env: Env, companyId: string, positionId: string) => {
  const position = await repository.findPosition(env, companyId, positionId);
  if (!position) throw new ValidationError("Please choose a valid target position/title.");
  if (position.archived_at || position.deleted_at || position.is_active === 0 || position.status === "disabled" || position.status === "inactive") {
    throw new ValidationError("Inactive positions cannot be used for employee transfer or structure change requests.");
  }
  return position;
};

const canCreateForEmployee = async (env: Env, context: AuthActor, subject: EmployeeStructureChangeEmployee, requester: EmployeeStructureChangeEmployee | null) => {
  if (!has(context, "employees.structureRequests.create") && !has(context, "employees.structureRequests.createForOthers")) {
    throw new PermissionError("You do not have permission to create employee transfer or structure change requests.");
  }
  if (permissionService.isSuperAdmin(context)) return;
  if (requester?.id === subject.id) return;
  if (!has(context, "employees.structureRequests.createForOthers")) {
    throw new PermissionError("You cannot create employee structure requests for another employee.");
  }
  if (permissionService.isAdminOrSuperAdmin(context) || has(context, "employees.structure.manage")) return;
  if (!activeEmployee(requester)) throw new PermissionError("Your linked employee profile is not active for department-scoped structure requests.");
  if (requester?.department_id !== subject.department_id) {
    throw new PermissionError("Department managers can create structure requests only for employees in their own department.");
  }
  if ((requester.level ?? 0) <= (subject.level ?? 0)) {
    throw new PermissionError("Department managers can create structure requests only for lower-level employees.");
  }
};

const assertDepartmentScopedTargetAllowed = (
  context: AuthActor,
  requester: EmployeeStructureChangeEmployee | null,
  subject: EmployeeStructureChangeEmployee,
  input: EmployeeStructureChangeInput,
  target: { requestedDepartmentId: string | null; requestedLevel: number | null; requestedOutletId: string | null; requestedDepartmentHeadEmployeeId: string | null },
) => {
  const departmentScoped =
    !isGlobalStructureActor(context) &&
    requester?.id !== subject.id &&
    has(context, "employees.structureRequests.createForOthers");
  if (!departmentScoped) return;
  if (!activeEmployee(requester)) throw new PermissionError("Your linked employee profile is not active for department-scoped structure requests.");
  if (requester?.department_id !== subject.department_id) {
    throw new PermissionError("Department managers can create structure requests only for employees in their own department.");
  }
  if ((requester.level ?? 0) <= (subject.level ?? 0)) {
    throw new PermissionError("Department managers can create structure requests only for lower-level employees.");
  }
  if (target.requestedLevel != null && target.requestedLevel >= (requester.level ?? 0) && !has(context, "employees.structure.sensitive.manage")) {
    throw new PermissionError("Department managers cannot request assigning employees to their own or a higher level.");
  }
  if ((target.requestedDepartmentId ?? null) !== (subject.department_id ?? null) && input.operation_type !== "EMPLOYEE_TRANSFER") {
    throw new PermissionError("Department changes by department managers must use an employee transfer request type.");
  }
  if (target.requestedOutletId && !permissionService.hasOutletAccess(context, target.requestedOutletId)) {
    throw new PermissionError("Department managers cannot target outlets or stores outside their scope.");
  }
  if (target.requestedDepartmentHeadEmployeeId && !has(context, "employees.structure.sensitive.manage")) {
    throw new PermissionError("Department head changes require sensitive employee structure permission.");
  }
};

const normalizeTarget = async (env: Env, context: AuthActor, subject: EmployeeStructureChangeEmployee, requester: EmployeeStructureChangeEmployee | null, input: EmployeeStructureChangeInput) => {
  if (input.apply_role_template && !canRequestRoleTemplateApply(context)) {
    throw new PermissionError("You do not have permission to request employee role template application.");
  }
  if (input.requested_reporting_manager_employee_id) {
    throw new ValidationError("Reporting manager changes are not supported by the current employee structure schema yet.");
  }
  let requestedDepartmentId = input.requested_department_id ?? subject.department_id;
  let requestedPositionId = input.requested_position_id ?? subject.position_id;
  const requestedOutletId = input.requested_outlet_id ?? input.requested_store_id ?? subject.primary_outlet_id;
  let requestedLevel: number | null = subject.level;
  if (input.requested_position_id) {
    const position = await ensurePosition(env, context.companyId, input.requested_position_id);
    requestedPositionId = position.id;
    requestedLevel = position.level;
    requestedDepartmentId = input.requested_department_id ?? position.department_id ?? requestedDepartmentId;
    if (!requestedDepartmentId || position.department_id !== requestedDepartmentId) {
      throw new ValidationError("The selected position/title belongs to a different department.");
    }
  }
  if (input.requested_department_id) {
    await ensureDepartment(env, context.companyId, input.requested_department_id);
    requestedDepartmentId = input.requested_department_id;
  }
  if (requestedPositionId) {
    const position = await ensurePosition(env, context.companyId, requestedPositionId);
    if (position.department_id !== requestedDepartmentId) throw new ValidationError("The selected position/title belongs to a different department.");
    requestedLevel = position.level;
  }
  if (!requestedDepartmentId && requestedPositionId) throw new ValidationError("Select a department for the requested position/title.");
  if (input.requested_outlet_id || input.requested_store_id) {
    const outletId = input.requested_outlet_id ?? input.requested_store_id;
    assertOutletAccess(context, outletId);
    const outlet = await repository.findOutlet(env, context.companyId, outletId!);
    if (!outlet) throw new ValidationError("Please choose a valid target outlet or store.");
    if (outlet.deleted_at || outlet.archived_at || outlet.is_active === 0 || outlet.status === "disabled" || outlet.status === "inactive") {
      throw new ValidationError("Inactive outlets or stores cannot be used for employee transfer requests.");
    }
  }
  let requestedDepartmentHeadEmployeeId = input.requested_department_head_employee_id ?? null;
  if (requestedDepartmentHeadEmployeeId) {
    const headEmployee = await repository.findEmployee(env, context.companyId, requestedDepartmentHeadEmployeeId);
    if (!activeEmployee(headEmployee)) throw new ValidationError("Please choose an active employee as department head.");
    if (!requestedDepartmentId) throw new ValidationError("Select a department before requesting a department head change.");
  }
  const items = [
    { field: "department_id", previousValue: subject.department_id, requestedValue: requestedDepartmentId },
    { field: "position_id", previousValue: subject.position_id, requestedValue: requestedPositionId },
    { field: "level", previousValue: subject.level, requestedValue: requestedLevel },
    { field: "primary_outlet_id", previousValue: subject.primary_outlet_id, requestedValue: requestedOutletId },
    { field: "department_head_employee_id", previousValue: null, requestedValue: requestedDepartmentHeadEmployeeId },
  ].filter((item) => (item.previousValue ?? null) !== (item.requestedValue ?? null));
  if (items.length === 0 && !input.apply_role_template) {
    throw new ValidationError("Please provide at least one actionable employee transfer or structure change.");
  }
  assertDepartmentScopedTargetAllowed(context, requester, subject, input, {
    requestedDepartmentId,
    requestedLevel,
    requestedOutletId,
    requestedDepartmentHeadEmployeeId,
  });
  return {
    requested_department_id: requestedDepartmentId,
    requested_position_id: requestedPositionId,
    requested_level: requestedLevel,
    current_department_id: subject.department_id,
    current_position_id: subject.position_id,
    current_level: subject.level,
    current_outlet_id: subject.primary_outlet_id,
    requested_outlet_id: requestedOutletId,
    requested_department_head_employee_id: requestedDepartmentHeadEmployeeId,
    items,
  };
};

export const buildEmployeeStructureChangeVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (permissionService.isSuperAdmin(context) || has(context, "employees.structureRequests.view") || has(context, "employees.structure.view") || has(context, "approvals.requests.view")) {
    return { sql: undefined, values: [] as unknown[] };
  }
  const clauses = ["r.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (employee?.id) {
    clauses.push("r.employee_id = ?", "r.requester_employee_id = ?");
    values.push(employee.id, employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject", "employees.structureRequests.review", "approvals.operationOwner.approve", "approvals.operationOwner.view"])) {
    clauses.push(`((r.current_department_id = ? OR r.requested_department_id = ?) AND EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = r.company_id AND s.approval_request_id = r.approval_request_id
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE', 'OPERATION_OWNER')
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    ))`);
    values.push(employee.department_id, employee.department_id, employee.level ?? 0, employee.level ?? 99);
  }
  if (permissionService.hasAnyPermission(context, ["employees.structureRequests.finalApprove", "approvals.operationFinal.view", "approvals.operationFinal.approve"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = r.company_id AND s.approval_request_id = r.approval_request_id
         AND s.approver_resolver_type = 'OPERATION_FINAL_APPROVER'
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }
  if (permissionService.hasAnyPermission(context, ["employees.structureRequests.apply", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"])) {
    clauses.push("r.status IN ('APPROVED', 'PENDING_APPLICATION')");
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

export const canViewEmployeeStructureChangeRequest = async (env: Env, context: AuthActor, request: EmployeeStructureChangeRequestRecord) => {
  if (permissionService.isSuperAdmin(context) || has(context, "employees.structureRequests.view") || has(context, "employees.structure.view")) return true;
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
  if (["APPROVED", "PENDING_APPLICATION"].includes(request.status) && permissionService.hasAnyPermission(context, ["employees.structureRequests.apply", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"])) {
    const resolution = await resolveEmployeeStructureExecution(env, context, request);
    const execution = await assertEmployeeStructureExecutionAllowed(env, context, request, resolution, { purpose: "view" });
    if (execution.allowed) return true;
  }
  throw new PermissionError("You do not have access to this employee transfer or structure change request.");
};

export const listEmployeeStructureChangeRequests = async (env: Env, context: AuthActor, filters: EmployeeStructureChangeFilters) => {
  const visibility = await buildEmployeeStructureChangeVisibilityFilter(env, context);
  const [total, rows] = await Promise.all([
    repository.countRequests(env, context.companyId, filters, visibility.sql, visibility.values),
    repository.listRequests(env, context.companyId, filters, visibility.sql, visibility.values),
  ]);
  const visibleRows: EmployeeStructureChangeRequestRecord[] = [];
  for (const row of rows) {
    try {
      await canViewEmployeeStructureChangeRequest(env, context, row);
      visibleRows.push(row);
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  return { rows: visibleRows, pagination: pagination(filters, Math.min(total, visibleRows.length)) };
};

export const getEmployeeStructureChangeRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested employee transfer or structure change request could not be found.");
  await canViewEmployeeStructureChangeRequest(env, context, request);
  return { employee_structure_change_request: request };
};

export const createEmployeeStructureChangeRequest = async (env: Env, context: AuthActor, input: EmployeeStructureChangeInput) => {
  const requester = await actorEmployee(env, context);
  const subjectId = input.employee_id ?? requester?.id ?? null;
  if (!subjectId) throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.");
  const subject = await repository.findEmployee(env, context.companyId, subjectId);
  if (!activeEmployee(subject)) throw new ValidationError("Please choose an active employee for this request.");
  assertOutletAccess(context, subject?.primary_outlet_id);
  await canCreateForEmployee(env, context, subject!, requester);
  const normalized = await normalizeTarget(env, context, subject!, requester, input);
  const duplicate = await repository.findDuplicatePendingRequest(env, { companyId: context.companyId, employeeId: subject!.id, requestType: input.request_type });
  if (duplicate) throw new ConflictError("A pending employee structure change request already exists for this employee.");
  const id = createPrefixedId("emp_struct_req");
  await repository.createRequest(env, {
    id,
    companyId: context.companyId,
    actorUserId: context.actorUserId,
    requesterEmployeeId: requester?.id ?? null,
    subject: subject!,
    payload: { ...input, ...normalized },
    items: normalized.items,
  });
  await audit(env, context, { action: "employee_structure_change_request_created", entityId: id, employeeId: subject!.id, reason: input.reason });
  return getEmployeeStructureChangeRequest(env, context, id);
};

export const submitEmployeeStructureChangeForApproval = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getEmployeeStructureChangeRequest(env, context, id)).employee_structure_change_request;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This employee structure change request has already been completed.");
  if (request.approval_request_id) return { employee_structure_change_request: request, already_submitted: true };
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: request.operation_type,
    subject_type: "EMPLOYEE_STRUCTURE_CHANGE",
    subject_id: request.id,
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.requested_department_id ?? request.current_department_id,
    position_id: request.requested_position_id ?? request.current_position_id,
    level: request.requested_level ?? request.current_level,
    title: `Employee structure change ${request.request_type}`,
    summary: request.reason,
    payload_json: {
      employee_structure_change_request_id: request.id,
      operation_type: request.operation_type,
      request_type: request.request_type,
      requested_department_id: request.requested_department_id,
      requested_position_id: request.requested_position_id,
      requested_level: request.requested_level,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "employees.structureRequests.createForOthers",
    moduleOperationType: request.operation_type,
  });
  if (!draft) throw new ValidationError("No active employee structure approval workflow is configured.");
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const status = approvalStatusToStructureStatus(submitted);
  await repository.updateRequest(env, context.companyId, request.id, {
    approval_request_id: draft.id,
    approval_status: submitted?.status ?? "IN_REVIEW",
    approval_current_step: submitted?.current_step_id ?? null,
    approval_submitted_at: new Date().toISOString(),
    status,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "employee_structure_change_submitted_for_approval", entityId: request.id, employeeId: request.employee_id, reason: request.reason, details: { approval_request_id: draft.id, status } });
  return { employee_structure_change_request: await repository.findRequestById(env, context.companyId, request.id), already_submitted: false };
};

export const approveEmployeeStructureChangeStep = async (env: Env, context: AuthActor, id: string, input: EmployeeStructureChangeActionInput) => {
  const request = (await getEmployeeStructureChangeRequest(env, context, id)).employee_structure_change_request;
  if (!request.approval_request_id) throw new ConflictError("This request has not been submitted for approval.");
  const approval = await approvalEngineService.approveStep(env, context, request.approval_request_id, input.reason, { allowModuleBoundAction: true, moduleOperationType: request.operation_type });
  const status = approvalStatusToStructureStatus(approval);
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
  await repository.updateRequest(env, context.companyId, request.id, update);
  await audit(env, context, { action: "employee_structure_change_approved", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { employee_structure_change_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const rejectEmployeeStructureChangeStep = async (env: Env, context: AuthActor, id: string, input: EmployeeStructureChangeActionInput) => {
  const request = (await getEmployeeStructureChangeRequest(env, context, id)).employee_structure_change_request;
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
  await audit(env, context, { action: "employee_structure_change_rejected", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { employee_structure_change_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const cancelEmployeeStructureChangeRequest = async (env: Env, context: AuthActor, id: string, input: EmployeeStructureChangeActionInput) => {
  const request = (await getEmployeeStructureChangeRequest(env, context, id)).employee_structure_change_request;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This employee structure change request has already been completed.");
  const approval = request.approval_request_id
    ? await approvalEngineService.cancelRequest(env, context, request.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleCancelPermission: "employees.structureRequests.cancel",
      moduleCancelAnyPermission: "employees.structureRequests.cancelAny",
      moduleOperationType: request.operation_type,
    })
    : null;
  await repository.updateRequest(env, context.companyId, request.id, {
    status: "CANCELLED",
    approval_status: approval?.status ?? "CANCELLED",
    approval_current_step: null,
    cancelled_at: new Date().toISOString(),
    cancelled_by: context.actorUserId,
    cancellation_reason: input.reason,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "employee_structure_change_cancelled", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { employee_structure_change_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

const resolveEmployeeStructureExecution = (env: Env, context: AuthActor, request: EmployeeStructureChangeRequestRecord) =>
  resolveOperationResponsibility(env, context, {
    operation_code: request.operation_type,
    responsibility_type: "EXECUTION",
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.requested_department_id ?? request.current_department_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });

export const assertEmployeeStructureExecutionAllowed = async (
  env: Env,
  context: AuthActor,
  request: EmployeeStructureChangeRequestRecord,
  resolution: OperationResolutionResult,
  options: { purpose?: "apply" | "view" } = {},
) => {
  const purpose = options.purpose ?? "apply";
  if (resolution.status === "BLOCKED") throw new PermissionError(resolution.message || "Employee structure execution is blocked by Operation Ownership.");
  if (holdStatuses.has(resolution.status)) return { allowed: false as const, manualReviewMessage: resolution.message || "Employee structure execution needs manual assignment." };
  if (resolution.status === "USE_SUPER_ADMIN" && !permissionService.isSuperAdmin(context)) throw new PermissionError("Only Super Admin can execute this employee structure fallback.");
  if (permissionService.isSuperAdmin(context)) return { allowed: true as const };
  if (resolution.resolved_user_id && resolution.resolved_user_id !== context.actorUserId) throw new PermissionError("Operation Ownership assigns employee structure execution to another user.");
  const employee = await actorEmployee(env, context);
  if (resolution.resolved_department_id) {
    if (!activeEmployee(employee)) throw new PermissionError("Your linked employee profile is not active for employee structure execution.");
    if (employee?.department_id !== resolution.resolved_department_id) throw new PermissionError("Operation Ownership assigns employee structure execution to another department.");
  }
  if (resolution.min_level != null || resolution.max_level != null) {
    if (!activeEmployee(employee) || employee?.level == null) throw new PermissionError("Your employee level is required for employee structure execution.");
    if (resolution.min_level != null && employee.level < resolution.min_level) throw new PermissionError("Your employee level is below the execution level configured for this operation.");
    if (resolution.max_level != null && employee.level > resolution.max_level) throw new PermissionError("Your employee level is above the execution level configured for this operation.");
  }
  const visibilityPermission = permissionService.hasAnyPermission(context, ["employees.structureRequests.apply", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"]);
  const requiredPermission = resolution.required_permission ?? (purpose === "apply" ? "employees.structureRequests.apply" : null);
  if (purpose === "view") {
    if (!visibilityPermission) throw new PermissionError("You do not have permission to view this employee structure execution queue.");
  } else if (!requiredPermission || !permissionService.hasPermission(context, requiredPermission)) {
    throw new PermissionError("You do not have permission to apply this employee structure request.");
  }
  if (!(await actorHasRequiredRole(env, context, resolution.required_role_id))) throw new PermissionError("Your role is not allowed to execute this employee structure request.");
  assertOutletAccess(context, request.requested_outlet_id ?? request.current_outlet_id);
  return { allowed: true as const };
};

const valuesDiffer = (left: string | number | null | undefined, right: string | number | null | undefined) =>
  (left ?? null) !== (right ?? null);

const holdStaleEmployeeStructure = async (env: Env, context: AuthActor, request: EmployeeStructureChangeRequestRecord, reason: string) => {
  const message = "Employee structure changed after this request was submitted. Please review before applying.";
  await repository.updateRequest(env, context.companyId, request.id, {
    status: "PENDING_MANUAL_REVIEW",
    apply_error_code: "STALE_EMPLOYEE_STRUCTURE",
    apply_error_message: message,
    updated_by: context.actorUserId,
  });
  await audit(env, context, {
    action: "employee_structure_change_stale_state",
    entityId: request.id,
    employeeId: request.employee_id,
    reason,
    details: { message },
  });
  return { employee_structure_change_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
};

const assertCurrentStructureStillMatches = async (env: Env, context: AuthActor, request: EmployeeStructureChangeRequestRecord, reason: string) => {
  const employee = await repository.findEmployee(env, context.companyId, request.employee_id);
  if (!activeEmployee(employee)) {
    return holdStaleEmployeeStructure(env, context, request, reason);
  }
  if (
    valuesDiffer(employee?.department_id, request.current_department_id) ||
    valuesDiffer(employee?.position_id, request.current_position_id) ||
    valuesDiffer(employee?.level, request.current_level) ||
    valuesDiffer(employee?.primary_outlet_id, request.current_outlet_id)
  ) {
    return holdStaleEmployeeStructure(env, context, request, reason);
  }
  return null;
};

const prevalidateRoleTemplateApplication = async (env: Env, context: AuthActor, request: EmployeeStructureChangeRequestRecord) => {
  if (request.apply_role_template !== 1) return { linkedUserId: null as string | null, warning: null as string | null, shouldApplyRoles: false };
  if (!canRequestRoleTemplateApply(context)) {
    throw new PermissionError("This request includes role template application, but you do not have permission to apply role templates.");
  }
  const linkedUser = await repository.findLinkedUserForEmployee(env, context.companyId, request.employee_id);
  if (!linkedUser) {
    return {
      linkedUserId: null,
      warning: "Structure was updated, but no login user exists, so role template was not applied.",
      shouldApplyRoles: false,
    };
  }
  const departmentId = request.requested_department_id ?? request.current_department_id;
  const positionId = request.requested_position_id ?? request.current_position_id;
  const level = request.requested_level ?? request.current_level;
  if (!departmentId || !positionId || !level) {
    throw new ValidationError("Role template application requires a complete target department, position, and level.");
  }
  const templateCount = await repository.countLevelRoleTemplates(env, { companyId: context.companyId, departmentId, positionId, level });
  if (templateCount === 0) {
    throw new ValidationError("No level role templates are configured for the requested employee structure.");
  }
  return { linkedUserId: linkedUser.id, warning: null as string | null, shouldApplyRoles: true };
};

export const applyApprovedEmployeeStructureChangeRequest = async (env: Env, context: AuthActor, id: string, input: EmployeeStructureChangeActionInput) => {
  const request = (await getEmployeeStructureChangeRequest(env, context, id)).employee_structure_change_request;
  if (request.status === "APPLIED") return { employee_structure_change_request: request, already_applied: true };
  if (!["APPROVED", "PENDING_APPLICATION"].includes(request.status)) throw new ConflictError("Only final-approved employee structure requests can be applied.");
  const stale = await assertCurrentStructureStillMatches(env, context, request, input.reason);
  if (stale) return stale;
  if (request.requested_department_id) await ensureDepartment(env, context.companyId, request.requested_department_id);
  if (request.requested_position_id) {
    const position = await ensurePosition(env, context.companyId, request.requested_position_id);
    const targetDepartmentId = request.requested_department_id ?? request.current_department_id;
    if (position.department_id !== targetDepartmentId) throw new ValidationError("The requested position/title no longer belongs to the target department.");
  }
  const roleTemplate = await prevalidateRoleTemplateApplication(env, context, request);
  const resolution = await resolveEmployeeStructureExecution(env, context, request);
  const execution = await assertEmployeeStructureExecutionAllowed(env, context, request, resolution);
  if (!execution.allowed) {
    await repository.updateRequest(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "EMPLOYEE_STRUCTURE_EXECUTION_NEEDS_MANUAL_ASSIGNMENT",
      apply_error_message: execution.manualReviewMessage,
      execution_resolution_json: JSON.stringify(resolution),
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "employee_structure_change_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { message: execution.manualReviewMessage, execution_resolution: resolution.status } });
    return { employee_structure_change_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
  }
  try {
    await repository.applyApprovedStructureChange(env, {
      companyId: context.companyId,
      request,
      actorUserId: context.actorUserId,
      reason: input.note ?? input.reason,
      markApplied: !roleTemplate.shouldApplyRoles,
    });
    let roleTemplateResult: unknown = null;
    if (roleTemplate.shouldApplyRoles) {
      roleTemplateResult = await baseStructureService.applyLevelRoleTemplate(env, context, request.employee_id);
      await repository.updateRequest(env, context.companyId, request.id, {
        status: "APPLIED",
        applied_at: new Date().toISOString(),
        applied_by: context.actorUserId,
        execution_note: "Structure and level role template were applied.",
        updated_by: context.actorUserId,
      });
    } else if (roleTemplate.warning) {
      await repository.updateRequest(env, context.companyId, request.id, {
        execution_note: roleTemplate.warning,
        updated_by: context.actorUserId,
      });
    }
    await audit(env, context, {
      action: "employee_structure_change_applied",
      entityId: request.id,
      employeeId: request.employee_id,
      reason: input.reason,
      details: { execution_resolution: resolution.status, role_template: roleTemplateResult, warning: roleTemplate.warning },
    });
    return { employee_structure_change_request: await repository.findRequestById(env, context.companyId, request.id), applied: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Employee structure change could not be applied.";
    await repository.updateRequest(env, context.companyId, request.id, {
      status: request.apply_role_template === 1 ? "PENDING_MANUAL_REVIEW" : "FAILED_TO_APPLY",
      apply_error_code: "EMPLOYEE_STRUCTURE_APPLY_FAILED",
      apply_error_message: message,
      execution_resolution_json: JSON.stringify(resolution),
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "employee_structure_change_apply_failed", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { error: message } });
    throw error;
  }
};

export const getEmployeeStructureChangeTimeline = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getEmployeeStructureChangeRequest(env, context, id)).employee_structure_change_request;
  const approval = request.approval_request_id
    ? await approvalEngineService.getTimeline(env, context, request.approval_request_id)
    : { request: null, steps: [], actions: [] };
  return { employee_structure_change_request: request, ...approval };
};

export const listEmployeeStructureChangeItems = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getEmployeeStructureChangeRequest(env, context, id)).employee_structure_change_request;
  return {
    employee_structure_change_request: request,
    items: await repository.listRequestItems(env, context.companyId, id),
  };
};

export const getEmployeeStructureChangeAudit = async (env: Env, context: AuthActor, id: string) => {
  // Approval actions are the canonical audit timeline for this module; detailed field diffs are exposed via /items.
  return getEmployeeStructureChangeTimeline(env, context, id);
};
