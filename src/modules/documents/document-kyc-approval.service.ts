import * as approvalEngineService from "../approvals/approval-workflow-engine.service";
import { resolveOperationResponsibility } from "../operation-ownership/operation-ownership.service";
import type { OperationResolutionResult } from "../operation-ownership/operation-ownership.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";
import * as repository from "./document-kyc.repository";
import {
  DOCUMENT_APPROVAL_OPERATION,
  DOCUMENT_KYC_SUBJECT_TYPE,
  DOCUMENT_KYC_UPDATE_OPERATION,
  type DocumentKycActionInput,
  type DocumentKycEmployeeRecord,
  type DocumentKycFilters,
  type DocumentKycRequestInput,
  type DocumentKycRequestRecord,
  type DocumentKycStagedUploadRecord,
} from "./document-kyc.types";
import { allowedDocumentKycFieldsByRequestType, assertSafeDocumentKycPayload, documentRelatedRequestTypes } from "./document-kyc.validators";

const terminalStatuses = ["APPLIED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"] as const;
const allowedStagedUploadMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const maxStagedUploadBytes = 10 * 1024 * 1024;
const metadataOnlyDocumentReviewEnabled = false;
const documentSourceRequiredForTypeMessage = "A document file or existing document record is required for this request type.";
const activeEmployee = (employee: DocumentKycEmployeeRecord | null | undefined) =>
  Boolean(employee && !employee.deleted_at && !employee.archived_at && !["inactive", "archived", "deleted", "terminated", "resigned"].includes(employee.employment_status ?? "active"));
const has = (context: AuthActor, permission: string) =>
  permissionService.isSuperAdmin(context) || permissionService.hasPermission(context, permission);
const actorEmployee = (env: Env, context: AuthActor) =>
  repository.findEmployeeByUserId(env, context.companyId, context.actorUserId);
const assertOutletAccess = (context: AuthActor, outletId?: string | null) => {
  if (!permissionService.hasOutletAccess(context, outletId)) throw new PermissionError("You do not have access to this employee's outlet.");
};
const pagination = (filters: DocumentKycFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const audit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; reason?: string | null; details?: Record<string, unknown>; employeeId?: string | null }) => {
  await createAuditLog(env, {
    companyId: context.companyId,
    module: "documents",
    action: input.action,
    entityType: "employee_kyc_update_request",
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

const isNonEmptyValue = (value: unknown) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

const assertAllowedStagedUpload = (context: AuthActor, upload: DocumentKycStagedUploadRecord, options: { allowUploadedByOther: boolean }) => {
  if (upload.company_id !== context.companyId) throw new ValidationError("The staged document file could not be verified. Please upload the document again.");
  if (!["STAGED", "ATTACHED_TO_REQUEST"].includes(upload.status)) throw new ValidationError("The staged document file is no longer available. Please upload it again.");
  if (upload.purpose !== "DOCUMENT_KYC_UPDATE") throw new ValidationError("The staged document file cannot be used for this request.");
  if (upload.expires_at && new Date(upload.expires_at).getTime() <= Date.now()) throw new ValidationError("The staged document file has expired. Please upload it again.");
  if (!allowedStagedUploadMimeTypes.has(upload.mime_type)) throw new ValidationError("The staged document file type is not allowed.");
  if (upload.file_size <= 0 || upload.file_size > maxStagedUploadBytes) throw new ValidationError("The staged document file size is not allowed.");
  if (!options.allowUploadedByOther && upload.uploaded_by !== context.actorUserId) {
    throw new PermissionError("You can only attach documents that you uploaded for your own request.");
  }
};

const validateDocumentKycStagedUploadForCreate = async (
  env: Env,
  context: AuthActor,
  subject: DocumentKycEmployeeRecord,
  input: DocumentKycRequestInput,
) => {
  if (!input.staged_file_key) return null;
  const upload = await repository.findStagedUploadForCreate(env, { companyId: context.companyId, employeeId: subject.id, fileKey: input.staged_file_key });
  if (!upload) throw new ValidationError("The staged document file could not be verified. Please upload the document again.");
  assertAllowedStagedUpload(context, upload, { allowUploadedByOther: has(context, "documentKyc.requests.createForOthers") });
  return upload;
};

const validateDocumentKycStagedUploadForApply = async (env: Env, context: AuthActor, request: DocumentKycRequestRecord) => {
  if (!request.staged_file_key) return null;
  const upload = await repository.findStagedUploadForApply(env, {
    companyId: context.companyId,
    employeeId: request.employee_id,
    fileKey: request.staged_file_key,
    requestId: request.id,
  });
  if (!upload) return null;
  assertAllowedStagedUpload(context, upload, { allowUploadedByOther: true });
  return upload;
};

const assertActionableDocumentKycRequest = (input: DocumentKycRequestInput, options: { sourceDocument?: any | null; stagedUpload?: DocumentKycStagedUploadRecord | null }) => {
  const requestType = input.request_type;
  const allowedFields = allowedDocumentKycFieldsByRequestType[requestType] ?? allowedDocumentKycFieldsByRequestType.GENERAL_KYC_UPDATE;
  const requestedValues = input.requested_value_json ?? {};
  const changedRequestedKeys = Object.entries(requestedValues).filter(([key, value]) => allowedFields.has(key) && isNonEmptyValue(value));
  const requestedFieldHasValue = Boolean(input.requested_field && allowedFields.has(input.requested_field) && isNonEmptyValue(requestedValues[input.requested_field]));
  const hasProfileChange = requestedFieldHasValue || changedRequestedKeys.length > 0;
  const isDocumentRelated = documentRelatedRequestTypes.has(requestType);
  const hasExistingDocument = Boolean(input.document_id && options.sourceDocument);
  const hasStagedUpload = Boolean(options.stagedUpload);
  const hasDocumentMetadata = Boolean(
    input.document_type &&
      [input.document_number, input.issue_date, input.expiry_date, input.issuing_country].some(isNonEmptyValue),
  );
  const hasActionableDocumentChange = Boolean(input.document_type && (hasExistingDocument || hasStagedUpload || (metadataOnlyDocumentReviewEnabled && hasDocumentMetadata)));
  if (isDocumentRelated && !hasExistingDocument && !hasStagedUpload && !metadataOnlyDocumentReviewEnabled) {
    throw new ValidationError(documentSourceRequiredForTypeMessage);
  }
  if (isDocumentRelated && input.document_type && hasDocumentMetadata && !hasActionableDocumentChange) {
    throw new ValidationError("Document requests need an existing document or secure staged upload before they can be submitted.");
  }
  if (!hasProfileChange && !hasActionableDocumentChange) {
    throw new ValidationError("Please provide at least one document/KYC change to review.");
  }
};

export const canCreateDocumentKycForEmployee = async (env: Env, context: AuthActor, employeeId?: string | null) => {
  const requesterEmployee = await actorEmployee(env, context);
  const subjectEmployeeId = employeeId ?? requesterEmployee?.id ?? null;
  if (!subjectEmployeeId) {
    throw new PermissionError("Your employee profile is not linked to this login. Please contact HR.", "EMPLOYEE_PROFILE_NOT_LINKED");
  }
  if (!has(context, "documentKyc.requests.create") && !has(context, "documentKyc.requests.createForOthers")) {
    throw new PermissionError("You do not have permission to create document/KYC update requests.");
  }
  const subject = await repository.findEmployee(env, context.companyId, subjectEmployeeId);
  if (!activeEmployee(subject)) throw new ValidationError("Please choose an active employee for this document/KYC request.");
  assertOutletAccess(context, subject?.primary_outlet_id);
  const canCreateForOthers = has(context, "documentKyc.requests.createForOthers");
  if (!canCreateForOthers && requesterEmployee?.id !== subjectEmployeeId) {
    throw new PermissionError("You cannot create document/KYC requests for another employee.");
  }
  if (!canCreateForOthers && !activeEmployee(requesterEmployee)) {
    throw new PermissionError("Your employee profile is not active. Please contact HR.");
  }
  return { requesterEmployee, subject: subject! };
};

const approvalStatusToDocumentKycStatus = (approval: any): DocumentKycRequestRecord["status"] => {
  if (!approval) return "PENDING";
  if (approval.status === "NEEDS_MANUAL_ASSIGNMENT" || approval.status === "ESCALATED") return "PENDING_MANUAL_REVIEW";
  if (approval.status === "APPROVED") return "PENDING_APPLICATION";
  if (approval.status === "REJECTED") return "REJECTED";
  if (approval.status === "CANCELLED") return "CANCELLED";
  if (approval.current_step_name?.toLowerCase().includes("final")) return "PENDING_FINAL_APPROVAL";
  return "PENDING_OWNER_REVIEW";
};

export const buildDocumentKycVisibilityFilter = async (env: Env, context: AuthActor) => {
  if (permissionService.isSuperAdmin(context) || has(context, "documentKyc.requests.view") || has(context, "documents.view") || has(context, "approvals.requests.view")) {
    return { sql: undefined, values: [] as unknown[] };
  }
  const clauses = ["r.requester_user_id = ?"];
  const values: unknown[] = [context.actorUserId];
  const employee = await actorEmployee(env, context);
  if (employee?.id) {
    clauses.push("r.employee_id = ?", "r.requester_employee_id = ?");
    values.push(employee.id, employee.id);
  }
  if (employee?.department_id && permissionService.hasAnyPermission(context, ["approvals.department.view", "approvals.department.approve", "approvals.department.reject", "documentKyc.requests.review"])) {
    clauses.push(`(r.department_id = ? AND EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = r.company_id AND s.approval_request_id = r.approval_request_id
         AND s.approver_resolver_type IN ('DEPARTMENT_HEAD', 'DEPARTMENT_LEVEL', 'DEPARTMENT_ROLE', 'OPERATION_OWNER')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
         AND (s.required_min_level IS NULL OR ? >= s.required_min_level)
         AND (s.required_max_level IS NULL OR ? <= s.required_max_level)
    ))`);
    values.push(employee.department_id, employee.level ?? 0, employee.level ?? 99);
  }
  if (permissionService.hasAnyPermission(context, ["documentKyc.requests.finalApprove", "documentKyc.requests.approve", "approvals.operationFinal.view", "approvals.operationFinal.approve"])) {
    clauses.push(`EXISTS (
      SELECT 1 FROM approval_request_steps s
       WHERE s.company_id = r.company_id AND s.approval_request_id = r.approval_request_id
         AND s.approver_resolver_type IN ('OPERATION_FINAL_APPROVER', 'HR_FINAL_APPROVER')
         AND s.status IN ('PENDING', 'ESCALATED', 'WAITING_FOR_APPROVER')
    )`);
  }
  if (permissionService.hasAnyPermission(context, ["documentKyc.requests.apply", "employeeDocuments.verify", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"])) {
    clauses.push("r.status IN ('APPROVED', 'PENDING_APPLICATION')");
  }
  return { sql: `(${clauses.join(" OR ")})`, values };
};

export const canViewDocumentKycRequest = async (env: Env, context: AuthActor, request: DocumentKycRequestRecord) => {
  if (permissionService.isSuperAdmin(context) || has(context, "documentKyc.requests.view") || has(context, "documents.view")) return true;
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
  if (["APPROVED", "PENDING_APPLICATION"].includes(request.status) && permissionService.hasAnyPermission(context, ["documentKyc.requests.apply", "employeeDocuments.verify", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"])) {
    const resolution = await resolveDocumentKycExecution(env, context, request);
    const execution = await assertDocumentKycExecutionAllowed(env, context, request, resolution, { purpose: "view" });
    if (execution.allowed) return true;
  }
  throw new PermissionError("You do not have access to this document/KYC request.");
};

export const listDocumentKycRequests = async (env: Env, context: AuthActor, filters: DocumentKycFilters) => {
  const visibility = await buildDocumentKycVisibilityFilter(env, context);
  const result = await repository.listRequests(env, context.companyId, filters, visibility.sql, visibility.values);
  const visibleRows: DocumentKycRequestRecord[] = [];
  for (const row of result) {
    try {
      await canViewDocumentKycRequest(env, context, row);
      visibleRows.push(row);
    } catch (error) {
      if (!(error instanceof PermissionError)) throw error;
    }
  }
  return { rows: visibleRows, pagination: pagination(filters, visibleRows.length) };
};

export const getDocumentKycRequest = async (env: Env, context: AuthActor, id: string) => {
  const request = await repository.findRequestById(env, context.companyId, id);
  if (!request) throw new NotFoundError("The requested document/KYC request could not be found.");
  await canViewDocumentKycRequest(env, context, request);
  return { document_kyc_request: request };
};

export const createDocumentKycRequest = async (env: Env, context: AuthActor, input: DocumentKycRequestInput) => {
  assertSafeDocumentKycPayload(input.current_value_json, "current_value_json");
  assertSafeDocumentKycPayload(input.requested_value_json, "requested_value_json");
  const { requesterEmployee, subject } = await canCreateDocumentKycForEmployee(env, context, input.employee_id);
  const sourceDocument = input.document_id
    ? await repository.findEmployeeDocumentById(env, context.companyId, subject.id, input.document_id)
    : null;
  if (input.document_id && !sourceDocument) throw new ValidationError("Please select a valid existing employee document for this request.");
  const stagedUpload = await validateDocumentKycStagedUploadForCreate(env, context, subject, input);
  assertActionableDocumentKycRequest(input, { sourceDocument, stagedUpload });
  const duplicate = await repository.findDuplicatePendingRequest(env, {
    companyId: context.companyId,
    employeeId: subject.id,
    requestType: input.request_type,
    documentType: input.document_type,
    requestedField: input.requested_field,
  });
  if (duplicate) throw new ConflictError("A pending document/KYC request already exists for this employee.");
  const id = createPrefixedId("document_kyc");
  await repository.createRequest(env, {
    id,
    companyId: context.companyId,
    actorUserId: context.actorUserId,
    payload: {
      ...input,
      employee_id: subject.id,
      requester_employee_id: requesterEmployee?.id ?? null,
      requester_user_id: context.actorUserId,
      department_id: subject.department_id,
      position_id: subject.position_id,
      level: subject.level,
      outlet_id: subject.primary_outlet_id ?? null,
    },
  });
  if (stagedUpload) {
    await repository.attachStagedUploadToRequest(env, {
      companyId: context.companyId,
      id: stagedUpload.id,
      requestId: id,
      actorUserId: context.actorUserId,
    });
  }
  await audit(env, context, { action: "document_kyc_request_created", entityId: id, employeeId: subject.id, reason: input.reason });
  return getDocumentKycRequest(env, context, id);
};

export const submitDocumentKycRequestForApproval = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getDocumentKycRequest(env, context, id)).document_kyc_request;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This document/KYC request has already been completed.");
  if (request.approval_request_id) return { document_kyc_request: request, already_submitted: true };
  const draft = await approvalEngineService.createApprovalRequestDraft(env, context, {
    operation_type: DOCUMENT_KYC_UPDATE_OPERATION,
    subject_type: DOCUMENT_KYC_SUBJECT_TYPE,
    subject_id: request.id,
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.department_id,
    position_id: request.position_id,
    level: request.level,
    title: `Document/KYC update ${request.request_type}`,
    summary: request.reason,
    payload_json: {
      document_kyc_request_id: request.id,
      request_type: request.request_type,
      document_type: request.document_type,
      requested_field: request.requested_field,
    },
  }, {
    allowModuleBoundCreateForOthers: true,
    modulePermission: "documentKyc.requests.createForOthers",
    moduleOperationType: DOCUMENT_KYC_UPDATE_OPERATION,
  });
  if (!draft) throw new ValidationError("No active document/KYC approval workflow is configured.");
  const submitted = await approvalEngineService.submitApprovalRequest(env, context, draft.id);
  const status = approvalStatusToDocumentKycStatus(submitted);
  await repository.updateRequest(env, context.companyId, request.id, {
    approval_request_id: draft.id,
    approval_status: submitted?.status ?? "IN_REVIEW",
    approval_current_step: submitted?.current_step_id ?? null,
    status,
    verification_status: "PENDING_REVIEW",
    approval_submitted_at: new Date().toISOString(),
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "document_kyc_submitted_for_approval", entityId: request.id, employeeId: request.employee_id, reason: request.reason, details: { approval_request_id: draft.id, status } });
  return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), already_submitted: false };
};

export const approveDocumentKycStep = async (env: Env, context: AuthActor, id: string, input: DocumentKycActionInput) => {
  const request = (await getDocumentKycRequest(env, context, id)).document_kyc_request;
  if (!request.approval_request_id) throw new ConflictError("This document/KYC request has not been submitted for approval.");
  const approval = await approvalEngineService.approveStep(env, context, request.approval_request_id, input.reason, { allowModuleBoundAction: true, moduleOperationType: DOCUMENT_KYC_UPDATE_OPERATION });
  const status = approvalStatusToDocumentKycStatus(approval);
  const update: Record<string, unknown> = {
    approval_status: approval?.status ?? null,
    approval_current_step: approval?.current_step_id ?? null,
    status,
    updated_by: context.actorUserId,
  };
  if (status === "PENDING_FINAL_APPROVAL") {
    update.owner_reviewed_at = new Date().toISOString();
    update.owner_reviewed_by = context.actorUserId;
    update.reviewer_note = input.note ?? input.reason;
  }
  if (approval?.status === "APPROVED") {
    update.final_approved_at = new Date().toISOString();
    update.final_approved_by = context.actorUserId;
    update.final_approver_note = input.note ?? input.reason;
    update.approval_completed_at = new Date().toISOString();
  }
  await repository.updateRequest(env, context.companyId, request.id, update);
  return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const rejectDocumentKycStep = async (env: Env, context: AuthActor, id: string, input: DocumentKycActionInput) => {
  const request = (await getDocumentKycRequest(env, context, id)).document_kyc_request;
  if (!request.approval_request_id) throw new ConflictError("This document/KYC request has not been submitted for approval.");
  const approval = await approvalEngineService.rejectStep(env, context, request.approval_request_id, input.reason, input.note ?? input.reason, { allowModuleBoundAction: true, moduleOperationType: DOCUMENT_KYC_UPDATE_OPERATION });
  await repository.updateRequest(env, context.companyId, request.id, {
    status: "REJECTED",
    verification_status: "REJECTED",
    approval_status: approval?.status ?? "REJECTED",
    approval_current_step: null,
    rejected_at: new Date().toISOString(),
    rejected_by: context.actorUserId,
    rejection_reason: input.reason,
    approval_completed_at: new Date().toISOString(),
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "document_kyc_rejected", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

export const cancelDocumentKycRequest = async (env: Env, context: AuthActor, id: string, input: DocumentKycActionInput) => {
  const request = (await getDocumentKycRequest(env, context, id)).document_kyc_request;
  if (terminalStatuses.includes(request.status as any)) throw new ConflictError("This document/KYC request has already been completed.");
  const approval = request.approval_request_id
    ? await approvalEngineService.cancelRequest(env, context, request.approval_request_id, input.reason, {
      allowModuleBoundAction: true,
      moduleCancelPermission: "documentKyc.requests.cancel",
      moduleCancelAnyPermission: "documentKyc.requests.cancelAny",
      moduleOperationType: DOCUMENT_KYC_UPDATE_OPERATION,
    })
    : null;
  await repository.updateRequest(env, context.companyId, request.id, {
    status: "CANCELLED",
    verification_status: "ARCHIVED",
    approval_status: approval?.status ?? "CANCELLED",
    approval_current_step: null,
    cancelled_at: new Date().toISOString(),
    cancelled_by: context.actorUserId,
    cancellation_reason: input.reason,
    updated_by: context.actorUserId,
  });
  await audit(env, context, { action: "document_kyc_cancelled", entityId: request.id, employeeId: request.employee_id, reason: input.reason });
  return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), approval_request: approval };
};

const resolveDocumentKycExecution = (env: Env, context: AuthActor, request: DocumentKycRequestRecord) =>
  resolveOperationResponsibility(env, context, {
    operation_code: request.request_type === "DOCUMENT_VERIFICATION" ? DOCUMENT_APPROVAL_OPERATION : DOCUMENT_KYC_UPDATE_OPERATION,
    responsibility_type: "EXECUTION",
    requester_employee_id: request.requester_employee_id,
    subject_employee_id: request.employee_id,
    department_id: request.department_id,
    fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
  });

const holdStatuses = new Set(["HOLD_FOR_MANUAL_ASSIGNMENT", "UNASSIGNED", "SKIPPED"]);
export const assertDocumentKycExecutionAllowed = async (
  env: Env,
  context: AuthActor,
  request: DocumentKycRequestRecord,
  resolution: OperationResolutionResult,
  options: { purpose?: "apply" | "view" } = {},
) => {
  const purpose = options.purpose ?? "apply";
  if (resolution.status === "BLOCKED") throw new PermissionError(resolution.message || "Document/KYC execution is blocked by Operation Ownership.");
  if (holdStatuses.has(resolution.status)) return { allowed: false as const, manualReviewMessage: resolution.message || "Document/KYC execution needs manual assignment." };
  if (resolution.status === "USE_SUPER_ADMIN" && !permissionService.isSuperAdmin(context)) throw new PermissionError("Only Super Admin can execute this document/KYC fallback.");
  if (permissionService.isSuperAdmin(context)) return { allowed: true as const };
  if (resolution.resolved_user_id && resolution.resolved_user_id !== context.actorUserId) throw new PermissionError("Operation Ownership assigns document/KYC execution to another user.");
  const employee = await actorEmployee(env, context);
  if (resolution.resolved_department_id) {
    if (!activeEmployee(employee)) throw new PermissionError("Your linked employee profile is not active for document/KYC execution.");
    if (employee?.department_id !== resolution.resolved_department_id) throw new PermissionError("Operation Ownership assigns document/KYC execution to another department.");
  }
  if (resolution.min_level != null || resolution.max_level != null) {
    if (!activeEmployee(employee) || employee?.level == null) throw new PermissionError("Your employee level is required for document/KYC execution.");
    if (resolution.min_level != null && employee.level < resolution.min_level) throw new PermissionError("Your employee level is below the execution level configured for this operation.");
    if (resolution.max_level != null && employee.level > resolution.max_level) throw new PermissionError("Your employee level is above the execution level configured for this operation.");
  }
  const requiredPermission = resolution.required_permission ?? (purpose === "apply" ? "documentKyc.requests.apply" : null);
  const visibilityPermission = permissionService.hasAnyPermission(context, ["documentKyc.requests.apply", "employeeDocuments.verify", "approvals.operationExecutor.apply", "approvals.operationExecutor.view"]);
  if (purpose === "view") {
    if (!visibilityPermission) throw new PermissionError("You do not have permission to view this document/KYC execution queue.");
  } else if (!requiredPermission || !permissionService.hasPermission(context, requiredPermission)) {
    throw new PermissionError("You do not have permission to apply this document/KYC request.");
  }
  if (!(await actorHasRequiredRole(env, context, resolution.required_role_id))) throw new PermissionError("Your role is not allowed to execute this document/KYC request.");
  assertOutletAccess(context, request.outlet_id);
  return { allowed: true as const };
};

const parseJsonObject = (value?: string | null) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export const applyApprovedDocumentKycRequest = async (env: Env, context: AuthActor, id: string, input: DocumentKycActionInput) => {
  const request = (await getDocumentKycRequest(env, context, id)).document_kyc_request;
  if (request.status === "APPLIED") return { document_kyc_request: request, already_applied: true };
  if (!["APPROVED", "PENDING_APPLICATION"].includes(request.status)) throw new ConflictError("Only final-approved document/KYC requests can be applied.");
  const resolution = await resolveDocumentKycExecution(env, context, request);
  const execution = await assertDocumentKycExecutionAllowed(env, context, request, resolution);
  if (!execution.allowed) {
    await repository.updateRequest(env, context.companyId, request.id, {
      status: "PENDING_MANUAL_REVIEW",
      apply_error_code: "DOCUMENT_KYC_EXECUTION_NEEDS_MANUAL_ASSIGNMENT",
      apply_error_message: execution.manualReviewMessage,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "document_kyc_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { message: execution.manualReviewMessage, execution_resolution: resolution.status } });
    return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
  }
  try {
    const requestedPatch = parseJsonObject(request.requested_value_json);
    const profileKeys = Object.keys(requestedPatch).filter((key) => repository.employeePatchColumns.has(key));
    const sourceDocument = request.document_id
      ? await repository.findEmployeeDocumentById(env, context.companyId, request.employee_id, request.document_id)
      : null;
    if (request.document_id && !sourceDocument) {
      await repository.updateRequest(env, context.companyId, request.id, {
        status: "PENDING_MANUAL_REVIEW",
        apply_error_code: "DOCUMENT_SOURCE_REQUIRED",
        apply_error_message: "A document file or existing document record is required before this request can be applied.",
        updated_by: context.actorUserId,
      });
      await audit(env, context, { action: "document_kyc_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { apply_error_code: "DOCUMENT_SOURCE_REQUIRED", source: "invalid_document_id" } });
      return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
    }
    const stagedUpload = await validateDocumentKycStagedUploadForApply(env, context, request);
    if (request.staged_file_key && !stagedUpload) {
      await repository.updateRequest(env, context.companyId, request.id, {
        status: "PENDING_MANUAL_REVIEW",
        apply_error_code: "DOCUMENT_SOURCE_REQUIRED",
        apply_error_message: "The staged document file is not verified or is no longer available. Please upload the document again.",
        updated_by: context.actorUserId,
      });
      await audit(env, context, { action: "document_kyc_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { apply_error_code: "DOCUMENT_SOURCE_REQUIRED", source: "invalid_staged_upload" } });
      return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
    }
    const hasDocumentSource = Boolean(stagedUpload || sourceDocument);
    const isDocumentRelated = documentRelatedRequestTypes.has(request.request_type);
    if (isDocumentRelated && !hasDocumentSource && !metadataOnlyDocumentReviewEnabled) {
      await repository.updateRequest(env, context.companyId, request.id, {
        status: "PENDING_MANUAL_REVIEW",
        apply_error_code: "DOCUMENT_SOURCE_REQUIRED",
        apply_error_message: "A document file or existing document record is required before this request can be applied.",
        updated_by: context.actorUserId,
      });
      await audit(env, context, { action: "document_kyc_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { apply_error_code: "DOCUMENT_SOURCE_REQUIRED", source: "document_related_without_source" } });
      return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
    }
    const wantsDocumentRecord = Boolean(request.document_type);
    const shouldCreateDocument = wantsDocumentRecord && hasDocumentSource;
    if (profileKeys.length === 0 && wantsDocumentRecord && !hasDocumentSource) {
      await repository.updateRequest(env, context.companyId, request.id, {
        status: "PENDING_MANUAL_REVIEW",
        apply_error_code: "DOCUMENT_SOURCE_REQUIRED",
        apply_error_message: "A document file or existing document record is required before this request can be applied.",
        updated_by: context.actorUserId,
      });
      await audit(env, context, { action: "document_kyc_apply_held", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { apply_error_code: "DOCUMENT_SOURCE_REQUIRED", source: "missing_document_file" } });
      return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
    }
    if (profileKeys.length === 0 && !shouldCreateDocument) {
      await repository.updateRequest(env, context.companyId, request.id, {
        status: "PENDING_MANUAL_REVIEW",
        apply_error_code: "DOCUMENT_KYC_NO_APPLICABLE_CHANGE",
        apply_error_message: "Request approved but no directly applicable document or profile change was found.",
        updated_by: context.actorUserId,
      });
      return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), manual_review_required: true };
    }
    const applied = await repository.applyApprovedDocumentKycBundle(env, {
      companyId: context.companyId,
      request,
      actorUserId: context.actorUserId,
      profilePatch: requestedPatch,
      createDocument: shouldCreateDocument,
      sourceDocument,
      stagedUpload,
      applyNote: input.note ?? input.reason,
    });
    await audit(env, context, { action: "document_kyc_applied", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { execution_resolution: resolution.status, changed_fields: applied.changedFields, created_document_id: applied.createdDocumentId } });
    return { document_kyc_request: await repository.findRequestById(env, context.companyId, request.id), applied: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document/KYC request could not be applied.";
    await repository.updateRequest(env, context.companyId, request.id, {
      status: "FAILED_TO_APPLY",
      verification_status: "REJECTED",
      apply_error_code: "DOCUMENT_KYC_APPLY_FAILED",
      apply_error_message: message,
      updated_by: context.actorUserId,
    });
    await audit(env, context, { action: "document_kyc_apply_failed", entityId: request.id, employeeId: request.employee_id, reason: input.reason, details: { error: message } });
    throw error;
  }
};

export const getDocumentKycTimeline = async (env: Env, context: AuthActor, id: string) => {
  const request = (await getDocumentKycRequest(env, context, id)).document_kyc_request;
  const approval = request.approval_request_id
    ? await approvalEngineService.getTimeline(env, context, request.approval_request_id)
    : { request: null, steps: [], actions: [] };
  return { document_kyc_request: request, ...approval };
};
