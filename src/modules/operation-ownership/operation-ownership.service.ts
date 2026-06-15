import * as repository from "./operation-ownership.repository";
import type {
  BusinessFunctionInput,
  FunctionDepartmentAssignmentInput,
  OperationCatalogInput,
  OperationResolutionInput,
  OperationResolutionResult,
  OperationResponsibilityInput,
  OperationResponsibilityRecord,
  OwnershipFilters,
  SetupWarning,
} from "./operation-ownership.types";
import { OPERATION_RESPONSIBILITY_FALLBACKS, OPERATION_RESPONSIBILITY_TYPES } from "./operation-ownership.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, PermissionError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const managementPermissions = ["operationOwnership.manage", "operationOwnership.matrix.manage"];
const sensitivePermission = "operationOwnership.sensitive.manage";

const normalizeResponsibilityType = (type: OperationResponsibilityInput["responsibility_type"]) => {
  if (type === "FINAL_APPROVER") return "FINAL_APPROVAL";
  if (type === "EXECUTOR") return "EXECUTION";
  if (type === "CONFIGURATION_OWNER") return "CONFIGURATION";
  return type;
};

const normalizeFallback = (fallback?: OperationResponsibilityInput["fallback_behavior"] | null) => {
  if (fallback === "FALLBACK_TO_SUPER_ADMIN") return "USE_SUPER_ADMIN";
  if (fallback === "FALLBACK_TO_OWNER") return "USE_OWNER";
  if (fallback === "BLOCKED") return "BLOCK_OPERATION";
  return fallback ?? "HOLD_FOR_MANUAL_ASSIGNMENT";
};

const hasOwn = (value: object, key: keyof OperationResponsibilityInput) =>
  Object.prototype.hasOwnProperty.call(value, key);

const pagination = (filters: OwnershipFilters, total: number): PaginationMeta => ({
  page: filters.page,
  page_size: filters.page_size,
  total,
  total_pages: Math.ceil(total / filters.page_size),
});

const audit = async (env: Env, context: AuthActor, action: string, entityType: string, entityId: string, newValue?: unknown) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "operation_ownership",
    action,
    entityType,
    entityId,
    actorId: context.actorUserId,
    newValueJson: newValue === undefined ? undefined : JSON.stringify(newValue),
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};

const requireManage = (context: AuthActor) => {
  if (!permissionService.hasAnyPermission(context, managementPermissions)) {
    throw new PermissionError("You do not have permission to manage operation ownership.", "OPERATION_OWNERSHIP_PERMISSION_DENIED");
  }
};

const requireSensitiveManage = (context: AuthActor) => {
  if (!permissionService.hasPermission(context, sensitivePermission)) {
    throw new PermissionError("Sensitive operation ownership requires additional permission.", "OPERATION_OWNERSHIP_SENSITIVE_PERMISSION_DENIED");
  }
};

const ensureBusinessFunction = async (env: Env, companyId: string, id: string) => {
  const row = await repository.findBusinessFunctionById(env, companyId, id);
  if (!row || row.archived_at) throw new NotFoundError("The requested business function could not be found.");
  return row;
};

const ensureDepartment = async (env: Env, companyId: string, id: string) => {
  const row = await repository.findDepartment(env, companyId, id);
  if (!row || row.deleted_at || row.archived_at) throw new NotFoundError("The requested department could not be found.");
  if (row.is_active === 0 || row.status === "disabled" || row.status === "inactive") {
    throw new ValidationError("Inactive departments cannot be assigned operation ownership.");
  }
  return row;
};

const ensureOperation = async (env: Env, companyId: string, operationCode: string) => {
  const row = await repository.findOperationByCode(env, companyId, operationCode.trim().toUpperCase());
  if (!row || row.archived_at) throw new NotFoundError("The requested operation could not be found.");
  return row;
};

const validateRole = async (env: Env, companyId: string, roleId?: string | null) => {
  if (!roleId) return;
  const role = await repository.findRole(env, companyId, roleId);
  if (!role || role.is_active === 0) throw new ValidationError("Role must belong to the same company and be active.");
};

const validateUser = async (env: Env, companyId: string, userId?: string | null) => {
  if (!userId) return;
  const user = await repository.findUser(env, companyId, userId);
  if (!user || user.deleted_at || user.status === "disabled" || user.status === "inactive") {
    throw new ValidationError("User must belong to the same company and be active.");
  }
};

const validateResponsibilityTarget = (input: OperationResponsibilityInput) => {
  input.responsibility_type = normalizeResponsibilityType(input.responsibility_type) as OperationResponsibilityInput["responsibility_type"];
  input.fallback_behavior = normalizeFallback(input.fallback_behavior) as OperationResponsibilityInput["fallback_behavior"];
  if (!OPERATION_RESPONSIBILITY_TYPES.includes(input.responsibility_type)) {
    throw new ValidationError("Responsibility type is not supported.");
  }
  if ((input.fallback_behavior ?? "HOLD_FOR_MANUAL_ASSIGNMENT") && !OPERATION_RESPONSIBILITY_FALLBACKS.includes(input.fallback_behavior ?? "HOLD_FOR_MANUAL_ASSIGNMENT")) {
    throw new ValidationError("Fallback behavior is not supported.");
  }
  if (!input.target_type) throw new ValidationError("Target type is required.");
  if (input.min_level != null && (input.min_level < 1 || input.min_level > 4)) throw new ValidationError("Minimum level must be between 1 and 4.");
  if (input.max_level != null && (input.max_level < 1 || input.max_level > 4)) throw new ValidationError("Maximum level must be between 1 and 4.");
  if (input.min_level != null && input.max_level != null && input.min_level > input.max_level) throw new ValidationError("Minimum level cannot be greater than maximum level.");
  const targetCount = [input.business_function_id, input.department_id, input.user_id].filter(Boolean).length;
  if (targetCount > 1) throw new ValidationError("Choose exactly one target model.");
  if (input.target_type === "BUSINESS_FUNCTION" && !input.business_function_id) throw new ValidationError("Business function target is required.");
  if (input.target_type === "DEPARTMENT" && !input.department_id) throw new ValidationError("Department target is required.");
  if (input.target_type === "SPECIFIC_USER" && !input.user_id) throw new ValidationError("Specific user target is required.");
  if (input.target_type === "REQUESTER_DEPARTMENT") input.use_requester_department = true;
  if (input.target_type === "SUBJECT_DEPARTMENT") input.use_subject_department = true;
  if (["REQUESTER_DEPARTMENT", "SUBJECT_DEPARTMENT", "SUPER_ADMIN"].includes(input.target_type) && targetCount > 0) {
    throw new ValidationError("Dynamic and Super Admin targets cannot include static target ids.");
  }
};

const validateResponsibility = async (env: Env, context: AuthActor, input: OperationResponsibilityInput) => {
  validateResponsibilityTarget(input);
  const operation = await ensureOperation(env, context.companyId, input.operation_code);
  if (operation.is_sensitive === 1 || normalizeResponsibilityType(input.responsibility_type) === "CONFIGURATION") requireSensitiveManage(context);
  if (input.business_function_id) await ensureBusinessFunction(env, context.companyId, input.business_function_id);
  if (input.department_id) await ensureDepartment(env, context.companyId, input.department_id);
  await validateRole(env, context.companyId, input.required_role_id ?? input.role_id);
  await validateUser(env, context.companyId, input.user_id);
};

export const listBusinessFunctions = async (env: Env, context: AuthActor, filters: OwnershipFilters) => {
  const [total, rows] = await Promise.all([
    repository.countBusinessFunctions(env, context.companyId, filters),
    repository.listBusinessFunctions(env, context.companyId, filters),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const createBusinessFunction = async (env: Env, context: AuthActor, input: BusinessFunctionInput) => {
  requireManage(context);
  if (input.is_sensitive) requireSensitiveManage(context);
  const existing = await repository.findBusinessFunctionByCode(env, context.companyId, input.code);
  if (existing) throw new ConflictError("This business function code is already in use.");
  const id = createPrefixedId("bf");
  await repository.createBusinessFunction(env, id, context.companyId, context.actorUserId, input);
  await audit(env, context, "business_function_created", "business_function", id, input);
  return { business_function: await repository.findBusinessFunctionById(env, context.companyId, id) };
};

export const updateBusinessFunction = async (env: Env, context: AuthActor, id: string, input: Partial<BusinessFunctionInput>) => {
  requireManage(context);
  const existing = await ensureBusinessFunction(env, context.companyId, id);
  if (existing.is_system_default === 1 && existing.company_id === null) {
    throw new ValidationError("System default business functions cannot be edited directly. Create a company-specific function instead.");
  }
  if (input.is_sensitive || existing.is_sensitive === 1) requireSensitiveManage(context);
  await repository.updateBusinessFunction(env, context.companyId, id, context.actorUserId, input);
  await audit(env, context, "business_function_updated", "business_function", id, input);
  return { business_function: await repository.findBusinessFunctionById(env, context.companyId, id) };
};

export const getBusinessFunction = (env: Env, context: AuthActor, id: string) => ensureBusinessFunction(env, context.companyId, id);

export const setBusinessFunctionStatus = async (env: Env, context: AuthActor, id: string, isActive: boolean, archive = false) => {
  requireManage(context);
  const existing = await ensureBusinessFunction(env, context.companyId, id);
  if (existing.is_system_default === 1 && existing.company_id === null) throw new ValidationError("System default business functions cannot be changed directly.");
  if (existing.is_sensitive === 1) requireSensitiveManage(context);
  const archivedAt = archive ? new Date().toISOString() : null;
  await repository.setBusinessFunctionStatus(env, context.companyId, id, context.actorUserId, isActive, archivedAt);
  await audit(env, context, archive ? "business_function_archived" : isActive ? "business_function_enabled" : "business_function_disabled", "business_function", id);
  return { business_function: await repository.findBusinessFunctionById(env, context.companyId, id) };
};

export const listFunctionAssignments = async (env: Env, context: AuthActor, filters: OwnershipFilters) => {
  const [total, rows] = await Promise.all([
    repository.countFunctionAssignments(env, context.companyId, filters),
    repository.listFunctionAssignments(env, context.companyId, filters),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const createFunctionAssignment = async (env: Env, context: AuthActor, input: FunctionDepartmentAssignmentInput) => {
  requireManage(context);
  const businessFunction = await ensureBusinessFunction(env, context.companyId, input.business_function_id);
  if (businessFunction.is_sensitive === 1) requireSensitiveManage(context);
  await ensureDepartment(env, context.companyId, input.department_id);
  const id = createPrefixedId("bfa");
  await repository.createFunctionAssignment(env, id, context.companyId, context.actorUserId, input);
  await audit(env, context, "business_function_department_assigned", "business_function_department_assignment", id, input);
  return { assignment: await repository.findFunctionAssignmentById(env, context.companyId, id) };
};

export const updateFunctionAssignment = async (env: Env, context: AuthActor, id: string, input: Partial<FunctionDepartmentAssignmentInput>) => {
  requireManage(context);
  const existing = await repository.findFunctionAssignmentById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("The requested function assignment could not be found.");
  const businessFunction = await ensureBusinessFunction(env, context.companyId, existing.business_function_id);
  if (businessFunction.is_sensitive === 1) requireSensitiveManage(context);
  if (input.business_function_id && input.business_function_id !== existing.business_function_id) {
    const nextBusinessFunction = await ensureBusinessFunction(env, context.companyId, input.business_function_id);
    if (nextBusinessFunction.is_sensitive === 1) requireSensitiveManage(context);
  }
  if (input.department_id && input.department_id !== existing.department_id) await ensureDepartment(env, context.companyId, input.department_id);
  await repository.updateFunctionAssignment(env, context.companyId, id, context.actorUserId, input);
  await audit(env, context, "business_function_department_assignment_updated", "business_function_department_assignment", id, input);
  return { assignment: await repository.findFunctionAssignmentById(env, context.companyId, id) };
};

export const setFunctionAssignmentStatus = async (env: Env, context: AuthActor, id: string, isActive: boolean, archive = false) => {
  requireManage(context);
  const existing = await repository.findFunctionAssignmentById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("The requested function assignment could not be found.");
  const businessFunction = await ensureBusinessFunction(env, context.companyId, existing.business_function_id);
  if (businessFunction.is_sensitive === 1) requireSensitiveManage(context);
  await repository.setFunctionAssignmentStatus(env, context.companyId, id, context.actorUserId, isActive, archive ? new Date().toISOString() : null);
  await audit(env, context, archive ? "business_function_department_assignment_archived" : isActive ? "business_function_department_assignment_enabled" : "business_function_department_assignment_disabled", "business_function_department_assignment", id);
  return { assignment: await repository.findFunctionAssignmentById(env, context.companyId, id) };
};

export const listOperations = async (env: Env, context: AuthActor, filters: OwnershipFilters) => {
  const [total, rows] = await Promise.all([
    repository.countOperations(env, context.companyId, filters),
    repository.listOperations(env, context.companyId, filters),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const createOperation = async (env: Env, context: AuthActor, input: OperationCatalogInput) => {
  requireManage(context);
  if (input.is_sensitive) requireSensitiveManage(context);
  const existing = await repository.findOperationByCode(env, context.companyId, input.operation_code);
  if (existing) throw new ConflictError("This operation code is already in use.");
  const id = createPrefixedId("op");
  await repository.createOperation(env, id, context.companyId, context.actorUserId, input);
  await audit(env, context, "operation_catalog_created", "operation", id, input);
  return { operation: await repository.findOperationByCode(env, context.companyId, input.operation_code) };
};

export const updateOperation = async (env: Env, context: AuthActor, operationCode: string, input: Partial<OperationCatalogInput>) => {
  requireManage(context);
  const existing = await ensureOperation(env, context.companyId, operationCode);
  if (existing.company_id === null) throw new ValidationError("System default operations cannot be edited directly. Create a company-specific operation instead.");
  if (existing.is_sensitive === 1 || input.is_sensitive) requireSensitiveManage(context);
  await repository.updateOperation(env, context.companyId, operationCode, context.actorUserId, input);
  await audit(env, context, "operation_catalog_updated", "operation", operationCode, input);
  return { operation: await repository.findOperationByCode(env, context.companyId, operationCode) };
};

export const getOperation = (env: Env, context: AuthActor, operationCode: string) => ensureOperation(env, context.companyId, operationCode);

export const setOperationStatus = async (env: Env, context: AuthActor, operationCode: string, isActive: boolean, archive = false) => {
  requireManage(context);
  const existing = await ensureOperation(env, context.companyId, operationCode);
  if (existing.company_id === null) throw new ValidationError("System default operations cannot be changed directly. Create a company-specific override first.");
  if (existing.is_sensitive === 1) requireSensitiveManage(context);
  await repository.setOperationStatus(env, context.companyId, operationCode, context.actorUserId, isActive, archive ? new Date().toISOString() : null);
  await audit(env, context, archive ? "operation_catalog_archived" : isActive ? "operation_catalog_enabled" : "operation_catalog_disabled", "operation", operationCode);
  return { operation: await repository.findCompanyOperationByCode(env, context.companyId, operationCode) };
};

export const listResponsibilities = async (env: Env, context: AuthActor, filters: OwnershipFilters) => {
  const [total, rows] = await Promise.all([
    repository.countResponsibilities(env, context.companyId, filters),
    repository.listResponsibilities(env, context.companyId, filters),
  ]);
  return { rows, pagination: pagination(filters, total) };
};

export const listOperationResponsibilities = (env: Env, context: AuthActor, operationCode: string, filters: OwnershipFilters) =>
  listResponsibilities(env, context, { ...filters, operation_code: operationCode });

export const createResponsibility = async (env: Env, context: AuthActor, input: OperationResponsibilityInput) => {
  requireManage(context);
  input.responsibility_type = normalizeResponsibilityType(input.responsibility_type) as OperationResponsibilityInput["responsibility_type"];
  input.fallback_behavior = normalizeFallback(input.fallback_behavior) as OperationResponsibilityInput["fallback_behavior"];
  await validateResponsibility(env, context, input);
  const id = createPrefixedId("orm");
  await repository.createResponsibility(env, id, context.companyId, context.actorUserId, input);
  await audit(env, context, "operation_responsibility_created", "operation_responsibility", id, input);
  return { responsibility: await repository.findResponsibilityById(env, context.companyId, id) };
};

const buildResponsibilityUpdate = (
  existing: OperationResponsibilityRecord,
  input: Partial<OperationResponsibilityInput>,
): OperationResponsibilityInput => {
  const targetType = input.target_type ?? existing.target_type ?? "DEPARTMENT";
  if (hasOwn(input, "target_type")) {
    const explicitTargets = [input.business_function_id, input.department_id, input.user_id].filter(Boolean);
    if (explicitTargets.length > 1) throw new ValidationError("Choose exactly one target model.");
    if (targetType === "BUSINESS_FUNCTION" && (input.department_id || input.user_id)) throw new ValidationError("Business function target cannot include department or user.");
    if (targetType === "DEPARTMENT" && (input.business_function_id || input.user_id)) throw new ValidationError("Department target cannot include business function or user.");
    if (targetType === "SPECIFIC_USER" && (input.business_function_id || input.department_id)) throw new ValidationError("Specific user target cannot include business function or department.");
    if (["REQUESTER_DEPARTMENT", "SUBJECT_DEPARTMENT", "SUPER_ADMIN"].includes(targetType) && explicitTargets.length > 0) {
      throw new ValidationError("Dynamic and Super Admin targets cannot include static target ids.");
    }
  }
  const next: OperationResponsibilityInput = {
    operation_code: existing.operation_code,
    responsibility_type: normalizeResponsibilityType(input.responsibility_type ?? existing.responsibility_type) as OperationResponsibilityInput["responsibility_type"],
    target_type: targetType,
    business_function_id: hasOwn(input, "business_function_id") ? input.business_function_id ?? null : existing.business_function_id,
    department_id: hasOwn(input, "department_id") ? input.department_id ?? null : existing.department_id,
    role_id: hasOwn(input, "role_id") ? input.role_id ?? null : existing.role_id,
    user_id: hasOwn(input, "user_id") ? input.user_id ?? null : existing.user_id,
    permission_key: hasOwn(input, "permission_key") ? input.permission_key ?? null : existing.permission_key,
    required_permission: hasOwn(input, "required_permission") ? input.required_permission ?? null : existing.required_permission ?? existing.permission_key,
    required_role_id: hasOwn(input, "required_role_id") ? input.required_role_id ?? null : existing.required_role_id ?? existing.role_id,
    min_level: hasOwn(input, "min_level") ? input.min_level ?? null : existing.min_level,
    max_level: hasOwn(input, "max_level") ? input.max_level ?? null : existing.max_level,
    requires_approval: hasOwn(input, "requires_approval") ? input.requires_approval : existing.requires_approval === 1,
    use_requester_department: hasOwn(input, "use_requester_department") ? input.use_requester_department : existing.use_requester_department === 1,
    use_subject_department: hasOwn(input, "use_subject_department") ? input.use_subject_department : existing.use_subject_department === 1,
    fallback_behavior: normalizeFallback(input.fallback_behavior ?? existing.fallback_behavior) as OperationResponsibilityInput["fallback_behavior"],
    priority: input.priority ?? existing.priority,
    is_required: hasOwn(input, "is_required") ? input.is_required : existing.is_required === 1,
    is_active: hasOwn(input, "is_active") ? input.is_active : existing.is_active === 1,
    effective_from: hasOwn(input, "effective_from") ? input.effective_from ?? null : existing.effective_from,
    effective_to: hasOwn(input, "effective_to") ? input.effective_to ?? null : existing.effective_to,
  };

  if (targetType === "BUSINESS_FUNCTION") {
    next.department_id = null;
    next.user_id = null;
    next.use_requester_department = false;
    next.use_subject_department = false;
  } else if (targetType === "DEPARTMENT") {
    next.business_function_id = null;
    next.user_id = null;
    next.use_requester_department = false;
    next.use_subject_department = false;
  } else if (targetType === "SPECIFIC_USER") {
    next.business_function_id = null;
    next.department_id = null;
    next.use_requester_department = false;
    next.use_subject_department = false;
  } else if (targetType === "REQUESTER_DEPARTMENT") {
    next.business_function_id = null;
    next.department_id = null;
    next.user_id = null;
    next.use_requester_department = true;
    next.use_subject_department = false;
  } else if (targetType === "SUBJECT_DEPARTMENT") {
    next.business_function_id = null;
    next.department_id = null;
    next.user_id = null;
    next.use_requester_department = false;
    next.use_subject_department = true;
  } else if (targetType === "SUPER_ADMIN") {
    next.business_function_id = null;
    next.department_id = null;
    next.user_id = null;
    next.use_requester_department = false;
    next.use_subject_department = false;
  }

  next.permission_key = next.required_permission ?? null;
  next.role_id = next.required_role_id ?? null;
  return next;
};

export const updateResponsibility = async (env: Env, context: AuthActor, id: string, input: Partial<OperationResponsibilityInput>) => {
  requireManage(context);
  const existing = await repository.findResponsibilityById(env, context.companyId, id);
  if (!existing) throw new NotFoundError("The requested responsibility could not be found.");
  const next = buildResponsibilityUpdate(existing, input);
  await validateResponsibility(env, context, next);
  await repository.updateResponsibility(env, context.companyId, id, context.actorUserId, next);
  await audit(env, context, "operation_responsibility_updated", "operation_responsibility", id, next);
  return { responsibility: await repository.findResponsibilityById(env, context.companyId, id) };
};

export const getResponsibility = async (env: Env, context: AuthActor, id: string) => {
  const row = await repository.findResponsibilityById(env, context.companyId, id);
  if (!row) throw new NotFoundError("The requested responsibility could not be found.");
  return row;
};

export const setResponsibilityStatus = async (env: Env, context: AuthActor, id: string, isActive: boolean, archive = false) => {
  requireManage(context);
  const existing = await getResponsibility(env, context, id);
  const operation = await ensureOperation(env, context.companyId, existing.operation_code);
  if (operation.is_sensitive === 1 || normalizeResponsibilityType(existing.responsibility_type) === "CONFIGURATION") requireSensitiveManage(context);
  await repository.setResponsibilityStatus(env, context.companyId, id, context.actorUserId, isActive, archive ? new Date().toISOString() : null);
  await audit(env, context, archive ? "operation_responsibility_archived" : isActive ? "operation_responsibility_enabled" : "operation_responsibility_disabled", "operation_responsibility", id);
  return { responsibility: await repository.findResponsibilityById(env, context.companyId, id) };
};

const fallbackResult = async (
  env: Env,
  companyId: string,
  operationCode: string,
  responsibilityType: OperationResponsibilityInput["responsibility_type"],
  fallback: OperationResponsibilityRecord["fallback_behavior"] | null,
  message: string,
  isRequired = true,
): Promise<OperationResolutionResult> => {
  const normalizedFallback = normalizeFallback(fallback) as OperationResponsibilityRecord["fallback_behavior"];
  if (normalizedFallback === "USE_OWNER" && responsibilityType !== "OWNER") {
    const owner = await resolveOperationResponsibility(env, { companyId }, {
      operation_code: operationCode,
      responsibility_type: "OWNER",
      fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
    });
    return { ...owner, status: owner.status === "RESOLVED" ? "USE_OWNER" : owner.status, resolution_status: owner.status === "RESOLVED" ? "USE_OWNER" : owner.resolution_status, fallback_applied: normalizedFallback, fallback_behavior: normalizedFallback, message: owner.status === "RESOLVED" ? "Fallback resolved through operation owner responsibility." : message };
  }
  if (normalizedFallback === "USE_FINAL_APPROVAL_DEPARTMENT" && responsibilityType !== "FINAL_APPROVAL") {
    const finalApproval = await resolveOperationResponsibility(env, { companyId }, {
      operation_code: operationCode,
      responsibility_type: "FINAL_APPROVAL",
      fallback_behavior: "HOLD_FOR_MANUAL_ASSIGNMENT",
    });
    return { ...finalApproval, status: finalApproval.status === "RESOLVED" ? "USE_FINAL_APPROVAL_DEPARTMENT" : finalApproval.status, resolution_status: finalApproval.status === "RESOLVED" ? "USE_FINAL_APPROVAL_DEPARTMENT" : finalApproval.resolution_status, fallback_applied: normalizedFallback, fallback_behavior: normalizedFallback, message: finalApproval.status === "RESOLVED" ? "Fallback resolved through final approval responsibility." : message };
  }
  if (normalizedFallback === "USE_SUPER_ADMIN") {
    const superAdmin = await repository.findSuperAdminUser(env, companyId);
    return {
      status: superAdmin ? "USE_SUPER_ADMIN" : "HOLD_FOR_MANUAL_ASSIGNMENT",
      operation_code: operationCode,
      responsibility_type: responsibilityType,
      business_function_id: null,
      department_id: null,
      role_id: null,
      user_id: superAdmin?.id ?? null,
      permission_key: null,
      target_type: "SUPER_ADMIN",
      resolved_department_id: null,
      resolved_business_function_id: null,
      resolved_business_function_code: null,
      resolved_user_id: superAdmin?.id ?? null,
      min_level: null,
      max_level: null,
      required_permission: null,
      required_role_id: null,
      fallback_applied: normalizedFallback,
      resolution_status: superAdmin ? "USE_SUPER_ADMIN" : "HOLD_FOR_MANUAL_ASSIGNMENT",
      fallback_behavior: normalizedFallback,
      message: superAdmin ? "No operation owner was configured, so Super Admin fallback applies." : message,
    };
  }
  if (normalizedFallback === "SKIP_OPTIONAL_STEP" && !isRequired) {
    return {
      status: "SKIPPED",
      operation_code: operationCode,
      responsibility_type: responsibilityType,
      business_function_id: null,
      department_id: null,
      role_id: null,
      user_id: null,
      permission_key: null,
      target_type: null,
      resolved_department_id: null,
      resolved_business_function_id: null,
      resolved_business_function_code: null,
      resolved_user_id: null,
      min_level: null,
      max_level: null,
      required_permission: null,
      required_role_id: null,
      fallback_applied: normalizedFallback,
      resolution_status: "SKIPPED",
      fallback_behavior: normalizedFallback,
      message: "Optional responsibility skipped because no eligible target could be resolved.",
    };
  }
  const status = normalizedFallback === "BLOCK_OPERATION" ? "BLOCKED" : normalizedFallback === "HOLD_FOR_MANUAL_ASSIGNMENT" || normalizedFallback === "SKIP_OPTIONAL_STEP" ? "HOLD_FOR_MANUAL_ASSIGNMENT" : "UNASSIGNED";
  return {
    status,
    operation_code: operationCode,
    responsibility_type: responsibilityType,
    business_function_id: null,
    department_id: null,
    role_id: null,
    user_id: null,
    permission_key: null,
    target_type: null,
    resolved_department_id: null,
    resolved_business_function_id: null,
    resolved_business_function_code: null,
    resolved_user_id: null,
    min_level: null,
    max_level: null,
    required_permission: null,
    required_role_id: null,
    fallback_applied: normalizedFallback,
    resolution_status: status,
    fallback_behavior: normalizedFallback,
    message,
  };
};

const resolvedResult = (
  operationCode: string,
  responsibilityType: OperationResponsibilityInput["responsibility_type"],
  row: OperationResponsibilityRecord,
  input: {
    departmentId?: string | null;
    businessFunctionId?: string | null;
    businessFunctionCode?: string | null;
    userId?: string | null;
    message: string;
  },
): OperationResolutionResult => ({
  status: "RESOLVED",
  operation_code: operationCode,
  responsibility_type: responsibilityType,
  business_function_id: row.business_function_id,
  department_id: input.departmentId ?? row.department_id,
  role_id: row.required_role_id ?? row.role_id,
  user_id: input.userId ?? row.user_id,
  permission_key: row.required_permission ?? row.permission_key,
  target_type: row.target_type,
  resolved_department_id: input.departmentId ?? row.department_id,
  resolved_business_function_id: input.businessFunctionId ?? row.business_function_id,
  resolved_business_function_code: input.businessFunctionCode ?? row.business_function_code ?? null,
  resolved_user_id: input.userId ?? row.user_id,
  min_level: row.min_level,
  max_level: row.max_level,
  required_permission: row.required_permission ?? row.permission_key,
  required_role_id: row.required_role_id ?? row.role_id,
  fallback_applied: null,
  resolution_status: "RESOLVED",
  fallback_behavior: row.fallback_behavior,
  message: input.message,
});

const activeEmployeeDepartment = async (env: Env, companyId: string, employeeId?: string | null) => {
  if (!employeeId) return null;
  const employee = await repository.findEmployeeStructure(env, companyId, employeeId);
  if (!employee || employee.deleted_at || employee.archived_at || employee.employment_status === "inactive" || employee.employment_status === "archived") return null;
  return employee.department_id;
};

export const resolveOperationResponsibility = async (
  env: Env,
  context: Pick<AuthActor, "companyId">,
  input: OperationResolutionInput,
): Promise<OperationResolutionResult> => {
  const operationCode = input.operation_code.trim().toUpperCase();
  const responsibilityType = normalizeResponsibilityType(input.responsibility_type) as OperationResponsibilityInput["responsibility_type"];
  const responsibilities = await repository.findActiveResponsibilities(env, context.companyId, {
    operation_code: operationCode,
    responsibility_type: responsibilityType,
  });

  if (responsibilities.length === 0) {
    return fallbackResult(env, context.companyId, operationCode, responsibilityType, input.fallback_behavior ?? "HOLD_FOR_MANUAL_ASSIGNMENT", "No responsibility is configured for this operation.");
  }

  for (const row of responsibilities) {
    const targetType = row.target_type ?? (row.business_function_id ? "BUSINESS_FUNCTION" : row.department_id ? "DEPARTMENT" : row.user_id ? "SPECIFIC_USER" : "SUPER_ADMIN");
    if (targetType === "BUSINESS_FUNCTION" && row.business_function_id) {
      const assignment = await repository.findPrimaryFunctionAssignment(env, context.companyId, row.business_function_id);
      if (assignment?.department_id && assignment.is_active === 1 && assignment.department_status !== "disabled" && assignment.department_status !== "inactive") {
        return resolvedResult(operationCode, responsibilityType, { ...row, target_type: "BUSINESS_FUNCTION" }, {
          departmentId: assignment.department_id,
          businessFunctionId: row.business_function_id,
          businessFunctionCode: row.business_function_code,
          message: "Responsibility resolved through business function department assignment.",
        });
      }
      return fallbackResult(env, context.companyId, operationCode, responsibilityType, row.fallback_behavior, "Business function has no active department assignment.", row.is_required === 1);
    }
    if (targetType === "DEPARTMENT" && row.department_id) {
      const department = await repository.findDepartment(env, context.companyId, row.department_id);
      if (!department || department.deleted_at || department.archived_at || department.is_active === 0 || department.status === "disabled" || department.status === "inactive") {
        return fallbackResult(env, context.companyId, operationCode, responsibilityType, row.fallback_behavior, "Configured department is inactive or archived.", row.is_required === 1);
      }
      return resolvedResult(operationCode, responsibilityType, { ...row, target_type: "DEPARTMENT" }, { departmentId: row.department_id, message: "Responsibility resolved to configured department." });
    }
    if (targetType === "SPECIFIC_USER" && row.user_id) {
      const user = await repository.findUser(env, context.companyId, row.user_id);
      if (!user || user.deleted_at || user.status === "disabled" || user.status === "inactive") {
        return fallbackResult(env, context.companyId, operationCode, responsibilityType, row.fallback_behavior, "Configured user is disabled or deleted.", row.is_required === 1);
      }
      return resolvedResult(operationCode, responsibilityType, { ...row, target_type: "SPECIFIC_USER" }, { userId: row.user_id, message: "Responsibility resolved to configured user." });
    }
    if (targetType === "REQUESTER_DEPARTMENT") {
      const departmentId = await activeEmployeeDepartment(env, context.companyId, input.requester_employee_id);
      if (!departmentId) return fallbackResult(env, context.companyId, operationCode, responsibilityType, row.fallback_behavior, "Requester department could not be resolved.", row.is_required === 1);
      return resolvedResult(operationCode, responsibilityType, { ...row, target_type: "REQUESTER_DEPARTMENT" }, { departmentId, message: "Responsibility resolved to requester department." });
    }
    if (targetType === "SUBJECT_DEPARTMENT") {
      const departmentId = await activeEmployeeDepartment(env, context.companyId, input.subject_employee_id);
      if (!departmentId) return fallbackResult(env, context.companyId, operationCode, responsibilityType, row.fallback_behavior, "Subject department could not be resolved.", row.is_required === 1);
      return resolvedResult(operationCode, responsibilityType, { ...row, target_type: "SUBJECT_DEPARTMENT" }, { departmentId, message: "Responsibility resolved to subject employee department." });
    }
    if (targetType === "SUPER_ADMIN") {
      const superAdmin = await repository.findSuperAdminUser(env, context.companyId);
      if (!superAdmin) return fallbackResult(env, context.companyId, operationCode, responsibilityType, row.fallback_behavior, "No active Super Admin user could be resolved.", row.is_required === 1);
      return resolvedResult(operationCode, responsibilityType, { ...row, target_type: "SUPER_ADMIN" }, { userId: superAdmin.id, message: "Responsibility resolved to active Super Admin." });
    }
  }

  return fallbackResult(env, context.companyId, operationCode, responsibilityType, responsibilities[0]?.fallback_behavior ?? "HOLD_FOR_MANUAL_ASSIGNMENT", "No resolvable responsibility target was found.", responsibilities[0]?.is_required !== 0);
};

export const getMatrixSummary = (env: Env, context: AuthActor) => repository.getMatrixSummary(env, context.companyId);

export const getSetupWarnings = async (env: Env, context: AuthActor): Promise<{ warnings: SetupWarning[] }> => {
  const [
    unassignedOperations,
    unassignedFunctions,
    operationsWithoutOwner,
    sensitiveWithoutFinalApproval,
    inactiveAssignments,
    inactiveDepartmentResponsibilities,
    disabledUserResponsibilities,
    fallbackResponsibilities,
    sensitiveFinalWithoutPermission,
    finalApprovalWithoutLevelApprover,
  ] = await Promise.all([
    repository.listUnassignedOperations(env, context.companyId),
    repository.listFunctionsWithoutAssignments(env, context.companyId),
    repository.listOperationsWithoutOwner(env, context.companyId),
    repository.listSensitiveOperationsWithoutFinalApproval(env, context.companyId),
    repository.listFunctionAssignmentsWithInactiveDepartments(env, context.companyId),
    repository.listResponsibilitiesWithInactiveDepartments(env, context.companyId),
    repository.listResponsibilitiesWithDisabledUsers(env, context.companyId),
    repository.listResponsibilitiesWithFallbacks(env, context.companyId),
    repository.listSensitiveFinalApprovalsWithoutPermission(env, context.companyId),
    repository.listFinalApprovalResponsibilitiesWithoutLevelApprover(env, context.companyId),
  ]);
  const warnings: SetupWarning[] = [
    ...unassignedOperations.map((operation) => ({
      code: operation.is_sensitive === 1 ? "SENSITIVE_OPERATION_UNASSIGNED" : "OPERATION_UNASSIGNED",
      severity: operation.is_sensitive === 1 ? "critical" as const : "warning" as const,
      operation_code: operation.operation_code,
      message: `${operation.operation_name} has no active responsibility owner configured.`,
    })),
    ...unassignedFunctions.map((businessFunction) => ({
      code: "BUSINESS_FUNCTION_UNASSIGNED",
      severity: businessFunction.is_sensitive === 1 ? "critical" as const : "warning" as const,
      business_function_code: businessFunction.code,
      message: `${businessFunction.name} is not assigned to an active department.`,
    })),
    ...operationsWithoutOwner.map((operation) => ({
      code: "OPERATION_OWNER_MISSING",
      severity: operation.is_sensitive === 1 ? "critical" as const : "warning" as const,
      operation_code: operation.operation_code,
      message: `${operation.operation_name} has no active OWNER responsibility.`,
    })),
    ...sensitiveWithoutFinalApproval.map((operation) => ({
      code: "SENSITIVE_FINAL_APPROVAL_MISSING",
      severity: "critical" as const,
      operation_code: operation.operation_code,
      message: `${operation.operation_name} is sensitive but has no active FINAL_APPROVAL responsibility.`,
    })),
    ...inactiveAssignments.map((assignment) => ({
      code: "BUSINESS_FUNCTION_INACTIVE_DEPARTMENT",
      severity: "critical" as const,
      business_function_code: assignment.business_function_code ?? undefined,
      department_id: assignment.department_id,
      message: `${assignment.business_function_name ?? "Business function"} is assigned to an inactive or archived department.`,
    })),
    ...inactiveDepartmentResponsibilities.map((responsibility) => ({
      code: "RESPONSIBILITY_INACTIVE_DEPARTMENT",
      severity: "critical" as const,
      operation_code: responsibility.operation_code,
      responsibility_id: responsibility.id,
      department_id: responsibility.department_id,
      message: `${responsibility.operation_code} responsibility points to an inactive or archived department.`,
    })),
    ...disabledUserResponsibilities.map((responsibility) => ({
      code: "RESPONSIBILITY_DISABLED_USER",
      severity: "critical" as const,
      operation_code: responsibility.operation_code,
      responsibility_id: responsibility.id,
      user_id: responsibility.user_id,
      message: `${responsibility.operation_code} responsibility points to a disabled or deleted user.`,
    })),
    ...fallbackResponsibilities.map((responsibility) => ({
      code: normalizeFallback(responsibility.fallback_behavior) === "USE_SUPER_ADMIN" ? "SUPER_ADMIN_FALLBACK_CONFIGURED" : "BLOCK_OPERATION_FALLBACK_CONFIGURED",
      severity: normalizeFallback(responsibility.fallback_behavior) === "USE_SUPER_ADMIN" ? "warning" as const : "critical" as const,
      operation_code: responsibility.operation_code,
      responsibility_id: responsibility.id,
      message: `${responsibility.operation_code} uses ${normalizeFallback(responsibility.fallback_behavior)} fallback behavior.`,
    })),
    ...sensitiveFinalWithoutPermission.map((responsibility) => ({
      code: "SENSITIVE_FINAL_APPROVAL_PERMISSION_MISSING",
      severity: "critical" as const,
      operation_code: responsibility.operation_code,
      responsibility_id: responsibility.id,
      message: `${responsibility.operation_code} final approval is sensitive but has no required permission filter.`,
    })),
    ...finalApprovalWithoutLevelApprover.map((responsibility) => ({
      code: "FINAL_APPROVAL_LEVEL_APPROVER_MISSING",
      severity: "warning" as const,
      operation_code: responsibility.operation_code,
      responsibility_id: responsibility.id,
      department_id: responsibility.department_id,
      message: `${responsibility.operation_code} final approval has no active Level 3/4 linked approver in the configured department.`,
    })),
  ];
  if (warnings.length === 0) warnings.push({ code: "OPERATION_OWNERSHIP_READY", severity: "info", message: "Operation ownership setup has no open warnings." });
  return { warnings };
};
