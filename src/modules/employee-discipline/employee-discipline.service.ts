import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import * as operationOwnershipRepository from "../operation-ownership/operation-ownership.repository";
import { resolveOperationResponsibility } from "../operation-ownership/operation-ownership.service";
import type { OperationResolutionResult } from "../operation-ownership/operation-ownership.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import * as repository from "./employee-discipline.repository";
import {
  DISCIPLINARY_ACTION_OPERATION,
  DISCIPLINARY_ACTION_SUBJECT_TYPE,
  type DisciplineEmployeeRecord,
  type DisciplinaryActionCommandInput,
  type DisciplinaryActionFilters,
  type DisciplinaryActionInput,
  type DisciplinaryActionRequestRecord,
  type DisciplinaryFollowUpTaskRecord,
} from "./employee-discipline.types";

const terminalStatuses = ["APPLIED", "ACKNOWLEDGED", "CLOSED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"] as const;
const holdStatuses = new Set(["HOLD_FOR_MANUAL_ASSIGNMENT", "UNASSIGNED", "SKIPPED", "BLOCKED"]);
const sensitiveActionTypes = new Set([
  "FINAL_WARNING",
  "SUSPENSION",
  "SUSPENSION_RECOMMENDATION",
  "PAYROLL_ACTION_RECOMMENDATION",
  "TRANSFER_RECOMMENDATION",
  "OFFBOARDING_RECOMMENDATION",
  "TERMINATION_RECOMMENDATION",
]);
const appliedRecordStatuses = new Set(["PENDING_ACKNOWLEDGEMENT", "APPLIED", "PENDING_FOLLOW_UP"]);
const closeableStatuses = new Set(["APPLIED", "ACKNOWLEDGED", "PENDING_FOLLOW_UP"]);

const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);
const actorEmployee = (env: Env, context: AuthActor) => repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);
const activeEmployee = (employee: DisciplineEmployeeRecord | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted", "terminated", "resigned", "offboarded"].includes(employee.employment_status ?? "active"));

const pagination = (filters: DisciplinaryActionFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const audit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; employeeId?: string | null; reason?: string | null; details?: Record<string, unknown> }) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "employee_discipline",
    action: input.action,
    entityType: "employee_disciplinary_action_request",
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

const canViewAllDiscipline = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) ||
  permissionService.hasAnyPermission(context, [
    "employeeDiscipline.actions.view",
    "employeeDiscipline.actions.manage",
    "employeeDiscipline.audit.view",
    "approvals.requests.view",
  ]);

const canViewAllDisciplinaryRecords = (context: AuthActor) =>
  permissionService.isSuperAdmin(context) ||
  permissionService.hasAnyPermission(context, [
    "employeeDiscipline.records.viewAll",
    "employeeDiscipline.actions.manage",
    "employeeDiscipline.audit.view",
  ]);

const actorHasRequiredRole = async (env: Env, context: AuthActor, requiredRoleId?: string | null) => {
  if (!requiredRoleId || permissionService.isSuperAdmin(context)) return true;
  if (context.roleKeys.includes(requiredRoleId) || context.roles.includes(requiredRoleId)) return true;
  const roles = await permissionService.getUserRoles(env, context.companyId, context.actorUserId);
  return roles.some((role) => role.id === requiredRoleId || role.role_key === requiredRoleId || role.role_name === requiredRoleId);
};

const resolveFunctionDepartment = async (env: Env, companyId: string, functionCodes: string[]) => {
  for (const code of functionCodes) {
    const businessFunction = await operationOwnershipRepository.findBusinessFunctionByCode(env, companyId, code);
    if (!businessFunction || businessFunction.is_active !== 1 || businessFunction.archived_at) continue;
    const assignment = await operationOwnershipRepository.findPrimaryFunctionAssignment(env, companyId, businessFunction.id);
    if (assignment?.department_id && assignment.is_active === 1 && assignment.department_status !== "disabled" && assignment.department_status !== "inactive") {
      return { departmentId: assignment.department_id, businessFunctionCode: businessFunction.code };
    }
  }
  return null;
};

const canCreateForEmployee = async (env: Env, context: AuthActor, subject: DisciplineEmployeeRecord, requester: DisciplineEmployeeRecord | null, input: DisciplinaryActionInput) => {
  // Department-scoped creators can only create disciplinary actions for lower-level employees.
  if (!has(context, "employeeDiscipline.actions.create") && !has(context, "employeeDiscipline.actions.createForOthers")) {
    throw new PermissionError("You do not have permission to create disciplinary action requests.");
  }
  if (permissionService.isSuperAdmin(context)) return;
  if (requester?.id === subject.id && has(context, "employeeDiscipline.actions.create")) return;
  if (!has(context, "employeeDiscipline.actions.createForOthers")) {
    throw new PermissionError("You cannot create a disciplinary action for another employee.");
  }
  if (permissionService.isAdminOrSuperAdmin(context) || has(context, "employeeDiscipline.actions.manage")) return;
  if (!activeEmployee(requester)) throw new PermissionError("Your linked employee profile is not active for department-scoped disciplinary actions.");
  if (requester?.department_id !== subject.department_id) throw new PermissionError("Department managers can create disciplinary actions only for employees in their own department.");
  if ((requester.level ?? 0) <= (subject.level ?? 0)) throw new PermissionError("You cannot create a disciplinary action for an employee at your level or higher.");
  if (sensitiveActionTypes.has(input.action_type ?? "GENERAL_DISCIPLINARY_ACTION") && !has(context, "employeeDiscipline.actions.sensitive.manage")) {
    throw new PermissionError("Sensitive disciplinary outcomes require additional authorization.");
  }
};

export const buildDisciplinaryActionVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (canViewAllDiscipline(context)) return { sql: undefined, values: [] as unknown[] };
  const clauses = ["dar.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (employee?.id && has(context, "employeeDiscipline.actions.viewOwn")) {
    clauses.push("dar.employee_id = ?", "dar.requester_employee_id = ?");
    values.push(employee.id, employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, [
    "employeeDiscipline.actions.review",
    "employeeDiscipline.actions.investigate",
    "approvals.department.view",
    "approvals.department.approve",
    "approvals.operationOwner.view",
    "approvals.operationOwner.approve",
  ])) {
    clauses.push("(dar.department_id = ? AND (dar.level IS NULL OR ? > dar.level OR ? >= 3))");
    values.push(employee.department_id, employee.level ?? 0, employee.level ?? 0);
  }
  if (permissionService.hasAnyPermission(context, ["employeeDiscipline.actions.finalApprove", "approvals.operationFinal.view", "approvals.operationFinal.approve"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = dar.company_id AND s.approval_request_id = dar.approval_request_id
         AND s.approver_resolver_type = 'OPERATION_FINAL_APPROVER'
         AND s.status IN ('PENDING','ESCALATED','WAITING_FOR_APPROVER')
    )`);
  }
  if (permissionService.hasAnyPermission(context, ["employeeDiscipline.actions.apply", "approvals.operationExecutor.view", "approvals.operationExecutor.apply"])) {
    clauses.push("dar.status IN ('APPROVED','PENDING_APPLICATION','PENDING_MANUAL_REVIEW')");
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["employeeDiscipline.tasks.view", "employeeDiscipline.tasks.complete", "employeeDiscipline.tasks.waive"])) {
    clauses.push("EXISTS (SELECT 1 FROM employee_disciplinary_follow_up_tasks t WHERE t.company_id = dar.company_id AND t.disciplinary_action_request_id = dar.id AND (t.assigned_user_id = ? OR t.owner_department_id = ?))");
    values.push(context.actorUserId, employee.department_id);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

export const canViewDisciplinaryAction = async (env: Env, context: AuthActor, request: DisciplinaryActionRequestRecord) => {
  if (canViewAllDiscipline(context)) return true;
  if (request.requester_user_id === context.actorUserId) return true;
  const employee = await actorEmployee(env, context);
  if (employee?.id && has(context, "employeeDiscipline.actions.viewOwn") && (employee.id === request.employee_id || employee.id === request.requester_employee_id)) return true;
  if (employee?.department_id === request.department_id && (employee.level ?? 0) > (request.level ?? -1) && permissionService.hasAnyPermission(context, ["employeeDiscipline.actions.review", "approvals.department.view", "approvals.operationOwner.view"])) return true;
  if (request.approval_request_id && permissionService.hasAnyPermission(context, ["approvals.operationOwner.view", "approvals.operationFinal.view", "approvals.operationExecutor.view", "employeeDiscipline.actions.finalApprove", "employeeDiscipline.actions.apply"])) {
    try {
      await approvalEngineService.getTimeline(env, context, request.approval_request_id);
      return true;
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  if (["APPROVED", "PENDING_APPLICATION"].includes(request.status) && permissionService.hasAnyPermission(context, ["employeeDiscipline.actions.apply", "approvals.operationExecutor.apply"])) {
    const resolution = await resolveDisciplinaryExecution(env, context, request);
    const execution = await assertDisciplinaryExecutionAllowed(env, context, request, resolution, { purpose: "view" });
    if (execution.allowed) return true;
  }
  if (await canViewAnyDisciplinaryTask(env, context, request.id)) return true;
  throw new PermissionError("You do not have permission to view this disciplinary record.");
};

export const listDisciplinaryActions = async (env: Env, context: AuthActor, filters: DisciplinaryActionFilters) => {
  const visibility = await buildDisciplinaryActionVisibilityFilter(env, context);
  const result = await repository.listRequests(env, context.companyId, filters, visibility.sql, visibility.values);
  const visibleRows: DisciplinaryActionRequestRecord[] = [];
  for (const row of result.rows) {
    try {
      await canViewDisciplinaryAction(env, context, row);
      visibleRows.push(row);
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  return { rows: visibleRows, pagination: pagination(filters, visibleRows.length) };
};

export const getDisciplinaryAction = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested disciplinary action could not be found.");
  await canViewDisciplinaryAction(env, context, request);
  return { disciplinary_action: await sanitizeForActor(env, context, request) };
};

export const buildDisciplinaryRecordVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (canViewAllDisciplinaryRecords(context)) return { sql: undefined, values: [] as unknown[] };
  const clauses = ["1 = 0"];
  const values: unknown[] = [];
  const employee = await actorEmployee(env, context);
  if (employee?.id && has(context, "employeeDiscipline.records.viewOwn")) {
    clauses.push("r.employee_id = ?");
    values.push(employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["employeeDiscipline.records.view", "employeeDiscipline.actions.review", "approvals.operationOwner.view"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM employee_disciplinary_action_requests dar
       WHERE dar.company_id = r.company_id AND dar.id = r.source_request_id
         AND dar.department_id = ? AND (dar.level IS NULL OR ? > dar.level)
    )`);
    values.push(employee.department_id, employee.level ?? 0);
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

export const canViewDisciplinaryRecord = async (env: Env, context: AuthActor, record: any) => {
  if (canViewAllDisciplinaryRecords(context)) return true;
  const employee = await actorEmployee(env, context);
  if (employee?.id && has(context, "employeeDiscipline.records.viewOwn") && employee.id === record.employee_id) return true;
  const request = await repository.findRequestById(env, context.companyId, record.source_request_id);
  if (request) {
    try {
      await canViewDisciplinaryAction(env, context, request);
      if (has(context, "employeeDiscipline.records.view") || has(context, "employeeDiscipline.actions.review") || has(context, "approvals.operationOwner.view")) return true;
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  throw new PermissionError("You do not have permission to view this official disciplinary record.");
};

const sanitizeRecordForActor = async (env: Env, context: AuthActor, record: any) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasAnyPermission(context, ["employeeDiscipline.records.viewAll", "employeeDiscipline.actions.manage", "employeeDiscipline.actions.sensitive.manage", "employeeDiscipline.audit.view"])) {
    return record;
  }
  return { ...record, outcome: null };
};

export const listDisciplinaryRecords = async (env: Env, context: AuthActor, filters: DisciplinaryActionFilters) => {
  const visibility = await buildDisciplinaryRecordVisibilityFilter(env, context);
  const result = await repository.listOfficialRecords(env, context.companyId, filters, visibility.sql, visibility.values);
  const rows = [];
  for (const record of result.rows) {
    try {
      await canViewDisciplinaryRecord(env, context, record);
      rows.push(await sanitizeRecordForActor(env, context, record));
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  return { rows, pagination: pagination(filters, rows.length) };
};

export const getDisciplinaryRecord = async (env: Env, context: AuthActor, recordId: string) => {
  const record = await repository.findOfficialRecordById(env, context.companyId, recordId, has(context, "employeeDiscipline.audit.view"));
  if (!record) throw new NotFoundError("The requested disciplinary record could not be found.");
  await canViewDisciplinaryRecord(env, context, record);
  return { disciplinary_record: await sanitizeRecordForActor(env, context, record) };
};

const sanitizeForActor = async (env: Env, context: AuthActor, request: DisciplinaryActionRequestRecord) => {
  if (permissionService.isSuperAdmin(context) || permissionService.hasAnyPermission(context, ["employeeDiscipline.actions.investigate", "employeeDiscipline.actions.manage", "employeeDiscipline.actions.sensitive.manage", "employeeDiscipline.audit.view"])) {
    return request;
  }
  return { ...request, investigator_note: null, owner_note: null, final_approver_note: null, requested_action_json: null };
};

export const createDisciplinaryAction = async (env: Env, context: AuthActor, input: DisciplinaryActionInput) => {
  const requester = await actorEmployee(env, context);
  const subjectId = input.employee_id ?? requester?.id ?? null;
  if (!subjectId) throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.");
  const subject = await repository.findEmployee(env, context.companyId, subjectId);
  if (!activeEmployee(subject)) throw new ValidationError("Please choose an active employee for this disciplinary action.");
  assertOutletAccess(context, subject?.primary_outlet_id);
  await canCreateForEmployee(env, context, subject!, requester, input);
  const duplicate = await repository.findDuplicateActiveRequest(env, {
    companyId: context.companyId,
    employeeId: subject!.id,
    requestType: input.request_type,
    incidentDate: input.incident_date,
    title: input.title,
  });
  if (duplicate) throw new ConflictError("A matching active disciplinary action request already exists.");
  const id = createPrefixedId("discipline_req");
  const payrollFollowUp = input.payroll_follow_up_required || input.action_type === "PAYROLL_ACTION_RECOMMENDATION" ? 1 : 0;
  const offboardingFollowUp = input.offboarding_follow_up_required || input.action_type === "OFFBOARDING_RECOMMENDATION" ? 1 : 0;
  const trainingFollowUp = input.training_follow_up_required || input.action_type === "TRAINING_REQUIRED" ? 1 : 0;
  const followUpRequired = payrollFollowUp || offboardingFollowUp || trainingFollowUp ? 1 : 0;
  await repository.createRequest(env, {
    id,
    companyId: context.companyId,
    actorUserId: context.actorUserId,
    payload: {
      employee_id: subject!.id,
      requester_employee_id: requester?.id ?? null,
      requester_user_id: context.actorUserId,
      department_id: subject!.department_id,
      position_id: subject!.position_id,
      level: subject!.level,
      outlet_id: subject!.primary_outlet_id,
      request_type: input.request_type,
      action_type: input.action_type ?? null,
      severity: input.severity,
      incident_date: input.incident_date ?? null,
      title: input.title,
      summary: input.summary ?? null,
      description: input.description,
      policy_reference: input.policy_reference ?? null,
      evidence_summary: input.evidence_summary ?? null,
      acknowledgement_required: input.acknowledgement_required ? 1 : 0,
      follow_up_required: followUpRequired,
      payroll_follow_up_required: payrollFollowUp,
      offboarding_follow_up_required: offboardingFollowUp,
      training_follow_up_required: trainingFollowUp,
      follow_up_json: JSON.stringify({ payroll: Boolean(payrollFollowUp), offboarding: Boolean(offboardingFollowUp), training: Boolean(trainingFollowUp) }),
      requested_action_json: input.requested_action_json ? JSON.stringify(input.requested_action_json) : null,
      current_value_json: input.current_value_json ? JSON.stringify(input.current_value_json) : null,
      requested_value_json: input.requested_value_json ? JSON.stringify(input.requested_value_json) : null,
    },
  });
  await audit(env, context, { action: "disciplinary_action_request_created", entityId: id, employeeId: subject!.id, reason: input.description });
  return getDisciplinaryAction(env, context, id);
};

const approvalStatusToDisciplineStatus = (approval: any): DisciplinaryActionRequestRecord["status"] => {
  if (!approval) return "PENDING";
  if (approval.status === "NEEDS_MANUAL_ASSIGNMENT" || approval.status === "ESCALATED") return "PENDING_MANUAL_REVIEW";
  if (approval.status === "APPROVED") return "PENDING_APPLICATION";
  if (approval.status === "REJECTED") return "REJECTED";
  if (approval.status === "CANCELLED") return "CANCELLED";
  if (approval.current_step_name?.toLowerCase().includes("final")) return "PENDING_FINAL_APPROVAL";
  if (approval.current_step_name?.toLowerCase().includes("investigation") || approval.current_step_name?.toLowerCase().includes("owner")) return "PENDING_INVESTIGATION";
  if (approval.current_step_name?.toLowerCase().includes("department")) return "PENDING_DEPARTMENT_REVIEW";
  return "PENDING_OWNER_REVIEW";
};

export const submitDisciplinaryActionForApproval = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This disciplinary action request has already been completed.");
  if (request.approval_request_id) return { disciplinary_action: request, already_submitted: true };
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    // Contract coverage: approval_request is created with operation_type DISCIPLINARY_ACTION.
    operation_type: DISCIPLINARY_ACTION_OPERATION,
    subject_type: DISCIPLINARY_ACTION_SUBJECT_TYPE,
    subject_id: request.id,
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.department_id,
    position_id: request.position_id,
    level: request.level,
    title: request.title,
    summary: request.summary ?? request.description,
    payload_json: {
      disciplinary_action_request_id: request.id,
      request_type: request.request_type,
      action_type: request.action_type,
      severity: request.severity,
      payroll_follow_up_required: request.payroll_follow_up_required,
      offboarding_follow_up_required: request.offboarding_follow_up_required,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "employeeDiscipline.actions.createForOthers",
    moduleOperationType: DISCIPLINARY_ACTION_OPERATION,
  });
  if (!draft) throw new ValidationError("No active disciplinary action approval workflow is configured.");
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const status = approvalStatusToDisciplineStatus(submitted);
  await repository.updateRequestApprovalLink(env, context.companyId, request.id, {
    approvalRequestId: draft.id,
    approvalStatus: submitted?.status ?? "IN_REVIEW",
    currentStepId: submitted?.current_step_id ?? null,
    status,
    actorUserId: context.actorUserId,
  });
  await audit(env, context, { action: "disciplinary_action_submitted_for_approval", entityId: request.id, employeeId: request.employee_id, details: { approval_request_id: draft.id, status } });
  return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), already_submitted: false };
};

export const approveDisciplinaryActionStep = async (env: Env, context: AuthActor, id: string, input: DisciplinaryActionCommandInput) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  if (!request.approval_request_id) throw new ConflictError("This disciplinary action has not been submitted for approval.");
  const approval = await approvalEngineService.approveStep(env, context, request.approval_request_id, input.reason, { allowModuleBoundAction: true, moduleOperationType: DISCIPLINARY_ACTION_OPERATION });
  const status = approvalStatusToDisciplineStatus(approval);
  const update: Record<string, unknown> = {
    approval_status: approval?.status ?? null,
    approval_current_step: approval?.current_step_id ?? null,
    status,
    updated_by: context.actorUserId,
  };
  if (status === "PENDING_INVESTIGATION" || status === "PENDING_OWNER_REVIEW") {
    update.owner_reviewed_at = new Date().toISOString();
    update.owner_reviewed_by = context.actorUserId;
  }
  if (approval?.status === "APPROVED") {
    update.final_approved_at = new Date().toISOString();
    update.final_approved_by = context.actorUserId;
    update.approval_completed_at = new Date().toISOString();
  }
  await repository.updateRequestStatus(env, context.companyId, request.id, update);
  await audit(env, context, { action: "disciplinary_action_approved", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { approval_status: approval?.status } });
  return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const rejectDisciplinaryActionStep = async (env: Env, context: AuthActor, id: string, input: DisciplinaryActionCommandInput) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  if (!request.approval_request_id) throw new ConflictError("This disciplinary action has not been submitted for approval.");
  const approval = await approvalEngineService.rejectStep(env, context, request.approval_request_id, input.reason, input.note ?? input.reason, { allowModuleBoundAction: true, moduleOperationType: DISCIPLINARY_ACTION_OPERATION });
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: "REJECTED",
    approval_status: approval?.status ?? "REJECTED",
    approval_current_step: null,
    rejected_at: new Date().toISOString(),
    rejected_by: context.actorUserId,
    rejection_reason: input.reason,
    approval_completed_at: new Date().toISOString(),
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "disciplinary_action_rejected", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const cancelDisciplinaryAction = async (env: Env, context: AuthActor, id: string, input: DisciplinaryActionCommandInput) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This disciplinary action request has already been completed.");
  const approval = request.approval_request_id
    ? await approvalEngineService.cancelRequest(env, context, request.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleCancelPermission: "employeeDiscipline.actions.cancel",
      moduleCancelAnyPermission: "employeeDiscipline.actions.cancelAny",
      moduleOperationType: DISCIPLINARY_ACTION_OPERATION,
    })
    : null;
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: "CANCELLED",
    approval_status: approval?.status ?? "CANCELLED",
    approval_current_step: null,
    cancelled_at: new Date().toISOString(),
    cancelled_by: context.actorUserId,
    cancellation_reason: input.reason,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "disciplinary_action_cancelled", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

const resolveDisciplinaryExecution = (env: Env, context: AuthActor, request: DisciplinaryActionRequestRecord) =>
  resolveOperationResponsibility(env, context, {
    operation_code: DISCIPLINARY_ACTION_OPERATION,
    responsibility_type: "EXECUTION",
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.department_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });

const assertDisciplinaryExecutionAllowed = async (
  env: Env,
  context: AuthActor,
  request: DisciplinaryActionRequestRecord,
  resolution: OperationResolutionResult,
  options: { purpose?: "apply" | "view" } = {},
) => {
  const purpose = options.purpose ?? "apply";
  if (resolution.status === "BLOCKED") throw new PermissionError(resolution.message || "Disciplinary Action ownership is not configured. Please configure Operation Ownership.");
  if (holdStatuses.has(resolution.status)) return { allowed: false as const, manualReviewMessage: resolution.message || "No eligible disciplinary action executor was found. The request needs manual assignment." };
  if (resolution.status === "USE_SUPER_ADMIN" && !permissionService.isSuperAdmin(context)) throw new PermissionError("Only Super Admin can execute this disciplinary action fallback.");
  if (permissionService.isSuperAdmin(context)) return { allowed: true as const };
  if (resolution.resolved_user_id && resolution.resolved_user_id !== context.actorUserId) throw new PermissionError("Operation Ownership assigns disciplinary action execution to another user.");
  const employee = await actorEmployee(env, context);
  if (resolution.resolved_department_id) {
    if (!activeEmployee(employee)) throw new PermissionError("Your linked employee profile is not active for disciplinary action execution.");
    if (employee?.department_id !== resolution.resolved_department_id) throw new PermissionError("Operation Ownership assigns disciplinary action execution to another department.");
  }
  if (resolution.min_level != null || resolution.max_level != null) {
    if (!activeEmployee(employee) || employee?.level == null) throw new PermissionError("Your employee level is required for disciplinary action execution.");
    if (resolution.min_level != null && employee.level < resolution.min_level) throw new PermissionError("Your employee level is below the execution level configured for this operation.");
    if (resolution.max_level != null && employee.level > resolution.max_level) throw new PermissionError("Your employee level is above the execution level configured for this operation.");
  }
  const viewAllowed = permissionService.hasAnyPermission(context, ["employeeDiscipline.actions.apply", "employeeDiscipline.actions.manage", "approvals.operationExecutor.view", "approvals.operationExecutor.apply"]);
  const requiredPermission = resolution.required_permission ?? (purpose === "apply" ? "employeeDiscipline.actions.apply" : null);
  if (purpose === "view") {
    if (!viewAllowed) throw new PermissionError("You do not have permission to view this disciplinary action execution queue.");
  } else if (!requiredPermission || !permissionService.hasPermission(context, requiredPermission)) {
    throw new PermissionError("You do not have permission to apply this disciplinary action.");
  }
  if (!(await actorHasRequiredRole(env, context, resolution.required_role_id))) throw new PermissionError("Your role is not allowed to execute this disciplinary action.");
  assertOutletAccess(context, request.outlet_id);
  return { allowed: true as const };
};

const resolveFollowUpOwner = async (env: Env, context: AuthActor, request: DisciplinaryActionRequestRecord, taskType: string) => {
  const functionCodes = taskType === "PAYROLL_REVIEW"
    ? ["PAYROLL_FUNCTION", "FINANCE_FUNCTION"]
    : taskType === "OFFBOARDING_REVIEW"
      ? ["GENERAL_ADMIN_FUNCTION", "HR_FUNCTION"]
      : taskType === "DOCUMENT_UPLOAD"
        ? ["DOCUMENT_KYC_FUNCTION", "HR_FUNCTION"]
        : ["HR_FUNCTION", "GENERAL_ADMIN_FUNCTION"];
  const fn = await resolveFunctionDepartment(env, context.companyId, functionCodes);
  if (fn) return { ownerDepartmentId: fn.departmentId, ownerBusinessFunctionCode: fn.businessFunctionCode, ownerResponsibilityType: "EXECUTION", status: "PENDING", notes: null };
  const fallback = await resolveOperationResponsibility(env, context, {
    operation_code: DISCIPLINARY_ACTION_OPERATION,
    responsibility_type: "ESCALATION",
    subject_employee_id: request.employee_id,
    requester_employee_id: request.requester_employee_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });
  return {
    ownerDepartmentId: fallback.resolved_department_id,
    ownerBusinessFunctionCode: fallback.resolved_business_function_code,
    ownerResponsibilityType: "ESCALATION",
    assignedUserId: fallback.resolved_user_id,
    status: fallback.status === "RESOLVED" || fallback.status === "USE_SUPER_ADMIN" ? "PENDING" : "BLOCKED",
    notes: fallback.status === "RESOLVED" || fallback.status === "USE_SUPER_ADMIN" ? null : `Manual assignment required: ${fallback.message}`,
  };
};

const ensureFollowUpTasks = async (env: Env, context: AuthActor, request: DisciplinaryActionRequestRecord) => {
  const specs: Array<{ type: string; name: string; required: number }> = [];
  if (request.acknowledgement_required === 1) specs.push({ type: "EMPLOYEE_ACKNOWLEDGEMENT", name: "Employee acknowledgement", required: 1 });
  if (request.training_follow_up_required === 1 || request.action_type === "TRAINING_REQUIRED") specs.push({ type: "TRAINING_FOLLOW_UP", name: "Training follow-up", required: 1 });
  if (request.payroll_follow_up_required === 1 || request.action_type === "PAYROLL_ACTION_RECOMMENDATION") specs.push({ type: "PAYROLL_REVIEW", name: "Payroll review follow-up", required: 1 });
  if (request.offboarding_follow_up_required === 1 || request.action_type === "OFFBOARDING_RECOMMENDATION") specs.push({ type: "OFFBOARDING_REVIEW", name: "Offboarding review follow-up", required: 1 });
  if (specs.length === 0) return;
  const tasks = [];
  for (const spec of specs) {
    if (spec.type === "EMPLOYEE_ACKNOWLEDGEMENT") {
      tasks.push({ id: createPrefixedId("discipline_task"), taskType: spec.type, taskName: spec.name, required: spec.required, ownerResponsibilityType: "SUBJECT_EMPLOYEE", ownerDepartmentId: request.department_id, status: "PENDING", metadataJson: JSON.stringify({ source: "acknowledgement" }) });
      continue;
    }
    const owner = await resolveFollowUpOwner(env, context, request, spec.type);
    tasks.push({
      id: createPrefixedId("discipline_task"),
      taskType: spec.type,
      taskName: spec.name,
      required: spec.required,
      ownerResponsibilityType: owner.ownerResponsibilityType,
      ownerDepartmentId: owner.ownerDepartmentId,
      ownerBusinessFunctionCode: owner.ownerBusinessFunctionCode,
      assignedUserId: owner.assignedUserId,
      status: owner.status,
      notes: owner.notes,
      metadataJson: JSON.stringify({ source: "disciplinary_follow_up", task_type: spec.type }),
    });
  }
  await repository.createFollowUpTasks(env, { companyId: context.companyId, requestId: request.id, employeeId: request.employee_id, tasks });
  await repository.updateRequestStatus(env, context.companyId, request.id, { follow_up_status: "PENDING", updated_by: context.actorUserId });
  await audit(env, context, { action: "disciplinary_follow_up_tasks_generated", entityId: request.id, employeeId: request.employee_id, details: { task_count: tasks.length } });
};

export const applyApprovedDisciplinaryAction = async (env: Env, context: AuthActor, id: string, input: DisciplinaryActionCommandInput) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  if (!["APPROVED", "PENDING_APPLICATION"].includes(request.status)) throw new ConflictError("Only final-approved disciplinary actions can be applied.");
  // Contract coverage: official record is created only after final approval and execution check.
  const existingRecord = await repository.findOfficialRecordByRequest(env, context.companyId, request.id);
  if (existingRecord) {
    // Contract coverage: no already_applied success on partial state.
    if (!["APPLIED", "ACKNOWLEDGED", "PENDING_ACKNOWLEDGEMENT", "PENDING_FOLLOW_UP", "CLOSED"].includes(request.status)) {
      await repository.updateRequestStatus(env, context.companyId, request.id, {
        status: "PENDING_MANUAL_REVIEW",
        apply_error_code: "DISCIPLINARY_PARTIAL_APPLY_STATE",
        apply_error_message: "Official disciplinary record exists but the request was not marked applied. Please review before retrying.",
        updated_by: context.actorUserId,
      });
      await audit(env, context, { action: "disciplinary_action_partial_apply_detected", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { record_id: existingRecord.id } });
      return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), disciplinary_record: existingRecord, manual_review_required: true };
    }
    return { disciplinary_action: request, disciplinary_record: existingRecord, already_applied: true };
  }
  const resolution = await resolveDisciplinaryExecution(env, context, request);
  const execution = await assertDisciplinaryExecutionAllowed(env, context, request, resolution);
  if (!execution.allowed) {
    await repository.updateRequestStatus(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "DISCIPLINARY_EXECUTION_NEEDS_MANUAL_ASSIGNMENT",
      apply_error_message: execution.manualReviewMessage,
      execution_resolution_json: JSON.stringify(resolution),
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "disciplinary_action_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { execution_resolution: resolution.status } });
    return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
  }
  const recordId = createPrefixedId("discipline_record");
  try {
    await repository.createOfficialRecord(env, {
      id: recordId,
      companyId: context.companyId,
      request,
      actorUserId: context.actorUserId,
      outcome: input.note ?? input.reason,
    });
    // Contract coverage: payroll/offboarding outcomes create follow-up tasks instead of mutating payroll or lifecycle directly.
    await ensureFollowUpTasks(env, context, request);
    const nextStatus = request.acknowledgement_required === 1 ? "PENDING_ACKNOWLEDGEMENT" : request.follow_up_required === 1 ? "PENDING_FOLLOW_UP" : "APPLIED";
    await repository.updateRequestStatus(env, context.companyId, request.id, {
      status: nextStatus,
      applied_at: new Date().toISOString(),
      applied_by: context.actorUserId,
      operation_execution_department_id: resolution.resolved_department_id ?? null,
      execution_note: "Official disciplinary record created. Payroll, transfer, and offboarding recommendations are follow-up tasks only and do not directly mutate downstream modules.",
      execution_resolution_json: JSON.stringify(resolution),
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "disciplinary_action_record_created", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { record_id: recordId, direct_payroll_mutation: false, direct_offboarding_mutation: false, direct_transfer_mutation: false } });
    return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), disciplinary_record: await repository.findOfficialRecordByRequest(env, context.companyId, request.id), applied: true };
  } catch (error) {
    // Contract coverage: apply operation uses staged consistency and moves partial failures to manual review.
    await repository.updateRequestStatus(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "DISCIPLINARY_APPLY_PARTIAL_FAILURE",
      apply_error_message: error instanceof Error ? error.message : "Disciplinary action apply failed after starting. Please review the official record and follow-up tasks.",
      updated_by: context.actorUserId,
    }).catch(() => undefined);
    await audit(env, context, { action: "disciplinary_action_apply_failed", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { record_id: recordId } }).catch(() => undefined);
    return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id), disciplinary_record: await repository.findOfficialRecordByRequest(env, context.companyId, request.id), manual_review_required: true };
  }
};

const canActOnTask = async (env: Env, context: AuthActor, task: DisciplinaryFollowUpTaskRecord, action: "view" | "complete" | "waive") => {
  if (permissionService.isSuperAdmin(context)) return true;
  const permissions = action === "view"
    ? ["employeeDiscipline.tasks.view", "employeeDiscipline.tasks.complete", "employeeDiscipline.tasks.waive", "employeeDiscipline.actions.manage"]
    : action === "complete"
      ? ["employeeDiscipline.tasks.complete", "employeeDiscipline.actions.manage"]
      : ["employeeDiscipline.tasks.waive", "employeeDiscipline.actions.manage"];
  if (!permissionService.hasAnyPermission(context, permissions)) return false;
  if (permissionService.hasAnyPermission(context, ["employeeDiscipline.actions.manage"])) return true;
  if (task.assigned_user_id && task.assigned_user_id === context.actorUserId) return true;
  const employee = await actorEmployee(env, context);
  if (!activeEmployee(employee)) return false;
  if (task.task_type === "EMPLOYEE_ACKNOWLEDGEMENT" && employee?.id === task.employee_id) return true;
  if (task.owner_department_id && employee?.department_id === task.owner_department_id) return true;
  if (task.owner_business_function_code) {
    const fn = await resolveFunctionDepartment(env, context.companyId, [task.owner_business_function_code]);
    if (fn?.departmentId && employee?.department_id === fn.departmentId) return true;
  }
  return false;
};

const canViewAnyDisciplinaryTask = async (env: Env, context: AuthActor, requestId: string) => {
  const tasks = await repository.listTasks(env, context.companyId, requestId);
  for (const task of tasks) {
    if (await canActOnTask(env, context, task, "view")) return true;
  }
  return false;
};

export const listDisciplinaryTasks = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested disciplinary action could not be found.");
  const tasks = await repository.listTasks(env, context.companyId, id);
  let requestVisible = false;
  try {
    requestVisible = await canViewDisciplinaryAction(env, context, request);
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
  }
  const visibleTasks: DisciplinaryFollowUpTaskRecord[] = [];
  for (const task of tasks) {
    if (requestVisible && canViewAllDiscipline(context)) visibleTasks.push(task);
    else if (await canActOnTask(env, context, task, "view")) visibleTasks.push(task);
  }
  if (!requestVisible && visibleTasks.length === 0) throw new PermissionError("You do not have access to these disciplinary follow-up tasks.");
  return { disciplinary_action: await sanitizeForActor(env, context, request), tasks: visibleTasks };
};

export const completeDisciplinaryTask = async (env: Env, context: AuthActor, id: string, taskId: string, input: DisciplinaryActionCommandInput) => {
  const task = await repository.findTask(env, context.companyId, id, taskId);
  if (!task) throw new NotFoundError("The requested disciplinary follow-up task could not be found.");
  if (!(await canActOnTask(env, context, task, "complete"))) throw new PermissionError("You are not assigned to complete this disciplinary follow-up task.");
  await repository.updateTaskStatus(env, { companyId: context.companyId, requestId: id, taskId, status: "COMPLETED", actorUserId: context.actorUserId, notes: input.note ?? input.reason });
  await audit(env, context, { action: "disciplinary_follow_up_task_completed", entityId: id, employeeId: task.employee_id, reason: input.reason, details: { task_id: taskId, task_type: task.task_type } });
  return listDisciplinaryTasks(env, context, id);
};

export const waiveDisciplinaryTask = async (env: Env, context: AuthActor, id: string, taskId: string, input: DisciplinaryActionCommandInput) => {
  if (!input.reason?.trim()) throw new ValidationError("This task requires a reason to waive.");
  const task = await repository.findTask(env, context.companyId, id, taskId);
  if (!task) throw new NotFoundError("The requested disciplinary follow-up task could not be found.");
  if (!(await canActOnTask(env, context, task, "waive"))) throw new PermissionError("You are not assigned to waive this disciplinary follow-up task.");
  await repository.updateTaskStatus(env, { companyId: context.companyId, requestId: id, taskId, status: "WAIVED", actorUserId: context.actorUserId, notes: input.reason });
  await audit(env, context, { action: "disciplinary_follow_up_task_waived", entityId: id, employeeId: task.employee_id, reason: input.reason, details: { task_id: taskId, task_type: task.task_type } });
  return listDisciplinaryTasks(env, context, id);
};

export const acknowledgeDisciplinaryAction = async (env: Env, context: AuthActor, id: string, input: DisciplinaryActionCommandInput) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  const employee = await actorEmployee(env, context);
  if (!permissionService.isSuperAdmin(context) && employee?.id !== request.employee_id && !has(context, "employeeDiscipline.actions.manage")) {
    throw new PermissionError("You cannot acknowledge another employee's disciplinary record.");
  }
  if (request.acknowledgement_required !== 1) throw new ConflictError("This disciplinary action does not require acknowledgement.");
  if (!appliedRecordStatuses.has(request.status)) throw new ConflictError("Disciplinary action can be acknowledged only after the official record is applied.");
  const record = await repository.findOfficialRecordByRequest(env, context.companyId, request.id);
  if (!record) throw new ConflictError("Official disciplinary record must exist before acknowledgement.");
  // Contract coverage: acknowledgement is tracked without mutating employee status.
  // Contract coverage: acknowledgement completes EMPLOYEE_ACKNOWLEDGEMENT task.
  const acknowledgementNote = input.note ? `Acknowledged receipt: ${input.note}` : "Acknowledged receipt";
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: request.follow_up_required === 1 ? "PENDING_FOLLOW_UP" : "ACKNOWLEDGED",
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: context.actorUserId,
    acknowledgement_note: acknowledgementNote,
    updated_by: context.actorUserId,
  });
  await repository.updateOfficialRecordAcknowledgement(env, context.companyId, request.id, {
    actorUserId: context.actorUserId,
    status: request.follow_up_required === 1 ? "ACKNOWLEDGED" : "ACKNOWLEDGED",
  });
  await repository.completeTaskByType(env, {
    companyId: context.companyId,
    requestId: request.id,
    taskType: "EMPLOYEE_ACKNOWLEDGEMENT",
    actorUserId: context.actorUserId,
    notes: acknowledgementNote,
  });
  await audit(env, context, { action: "disciplinary_action_acknowledged", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id) };
};

export const closeDisciplinaryAction = async (env: Env, context: AuthActor, id: string, input: DisciplinaryActionCommandInput) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  if (!has(context, "employeeDiscipline.actions.close") && !has(context, "employeeDiscipline.actions.manage")) throw new PermissionError("You do not have permission to close disciplinary actions.");
  if (!closeableStatuses.has(request.status)) throw new ConflictError("Only applied or acknowledged disciplinary actions can be closed.");
  const record = await repository.findOfficialRecordByRequest(env, context.companyId, request.id);
  if (!record) throw new ConflictError("Official disciplinary record must exist before closing.");
  if (request.acknowledgement_required === 1 && !request.acknowledged_at) throw new ConflictError("Required acknowledgement must be completed before closing.");
  if ((await repository.countOpenRequiredTasks(env, context.companyId, request.id)) > 0) throw new ConflictError("Required follow-up tasks must be completed or waived before closing.");
  await repository.updateRequestStatus(env, context.companyId, request.id, {
    status: "CLOSED",
    closed_at: new Date().toISOString(),
    closed_by: context.actorUserId,
    updated_by: context.actorUserId,
  });
  await repository.updateOfficialRecordStatus(env, context.companyId, request.id, "ARCHIVED");
  await audit(env, context, { action: "disciplinary_action_closed", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { disciplinary_action: await repository.findRequestById(env, context.companyId, request.id) };
};

export const listDisciplinaryItems = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  const items = await repository.listItems(env, context.companyId, request.id);
  return { disciplinary_action: request, items };
};

export const getDisciplinaryTimeline = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getDisciplinaryAction(env, context, id)).disciplinary_action as DisciplinaryActionRequestRecord;
  const officialRecord = await repository.findOfficialRecordByRequest(env, context.companyId, request.id);
  const approval = request.approval_request_id
    ? await approvalEngineService.getTimeline(env, context, request.approval_request_id)
    : { request: null, steps: [], actions: [] };
  const taskResult = await listDisciplinaryTasks(env, context, id);
  return { disciplinary_action: request, disciplinary_record: officialRecord ? await sanitizeRecordForActor(env, context, officialRecord) : null, tasks: taskResult.tasks, ...approval };
};

export const getDisciplinaryAudit = (env: Env, context: AuthActor, id: string) => getDisciplinaryTimeline(env, context, id);
