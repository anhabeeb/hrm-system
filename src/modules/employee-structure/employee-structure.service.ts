import type {
  EmployeeStructureInput,
  LevelRoleTemplateFilters,
  LevelRoleTemplateInput,
  LevelRoleTemplateRecord,
} from "./employee-structure.types";
import * as repository from "./employee-structure.repository";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, OutletAccessError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();
const todayIso = () => nowIso().slice(0, 10);

const audit = async (
  env: Env,
  context: AuthActor,
  input: { action: string; entityType: string; entityId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null },
) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "employee_structure",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason ?? undefined,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};

const ensureEmployee = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployeeStructure(env, context.companyId, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) {
    throw new OutletAccessError("You do not have access to this employee's outlet.");
  }
  return employee;
};

const ensureDepartment = async (env: Env, companyId: string, departmentId: string) => {
  const department = await repository.findDepartment(env, companyId, departmentId);
  if (!department) throw new ValidationError("Please choose a valid department.");
  if (department.status !== "active" || department.is_active === 0 || department.archived_at) {
    throw new ValidationError("Inactive or archived departments cannot be assigned.");
  }
  return department;
};

const ensurePosition = async (env: Env, companyId: string, departmentId: string, positionId: string) => {
  const position = await repository.findPosition(env, companyId, positionId);
  if (!position) throw new ValidationError("Please choose a valid position.");
  if (position.status !== "active" || position.is_active === 0 || position.archived_at) {
    throw new ValidationError("Inactive or archived positions cannot be assigned.");
  }
  if (position.department_id !== departmentId) {
    throw new ValidationError("This position belongs to a different department.");
  }
  if (position.level < 1 || position.level > 4) throw new ValidationError("Position level must be between 1 and 4.");
  return position;
};

const ensureTemplateReferences = async (env: Env, context: AuthActor, input: LevelRoleTemplateInput) => {
  const role = await repository.findRole(env, context.companyId, input.role_id);
  if (!role) throw new ValidationError("Please choose a valid role.");
  if (input.department_id) await ensureDepartment(env, context.companyId, input.department_id);
  if (input.position_id) {
    const position = await repository.findPosition(env, context.companyId, input.position_id);
    if (!position) throw new ValidationError("Please choose a valid position.");
    if (input.department_id && position.department_id !== input.department_id) {
      throw new ValidationError("Position override must belong to the selected department override.");
    }
  }
};

export const listAccessLevels = (env: Env, context: AuthActor) => repository.listAccessLevels(env, context.companyId);

export const listLevelRoleTemplates = async (env: Env, context: AuthActor, filters: LevelRoleTemplateFilters) => {
  const [total, rows] = await Promise.all([
    repository.countLevelRoleTemplates(env, context.companyId, filters),
    repository.listLevelRoleTemplates(env, context.companyId, filters),
  ]);
  const pagination: PaginationMeta = { page: filters.page, page_size: filters.page_size, total, total_pages: Math.ceil(total / filters.page_size) };
  return { rows, pagination };
};

export const createLevelRoleTemplate = async (env: Env, context: AuthActor, input: LevelRoleTemplateInput) => {
  await ensureTemplateReferences(env, context, input);
  const duplicate = await repository.findDuplicateTemplate(env, context.companyId, input);
  if (duplicate) throw new ConflictError("This level role template already exists.");
  const id = createPrefixedId("lvl_role_tpl");
  await repository.createLevelRoleTemplate(env, id, context.companyId, input, context.actorUserId);
  await audit(env, context, { action: "level_role_template_created", entityType: "level_role_template", entityId: id, newValue: input });
  return { template: await repository.findLevelRoleTemplateById(env, context.companyId, id) };
};

export const updateLevelRoleTemplate = async (env: Env, context: AuthActor, id: string, input: Partial<LevelRoleTemplateInput>) => {
  const existing = await repository.findLevelRoleTemplateById(env, context.companyId, id);
  if (!existing || existing.archived_at) throw new NotFoundError("The requested level role template could not be found.");
  const merged: LevelRoleTemplateInput = {
    level: input.level ?? existing.level,
    department_id: input.department_id !== undefined ? input.department_id : existing.department_id,
    position_id: input.position_id !== undefined ? input.position_id : existing.position_id,
    role_id: input.role_id ?? existing.role_id,
    is_default: input.is_default ?? existing.is_default === 1,
    is_required: input.is_required ?? existing.is_required === 1,
  };
  await ensureTemplateReferences(env, context, merged);
  const duplicate = await repository.findDuplicateTemplate(env, context.companyId, merged, id);
  if (duplicate) throw new ConflictError("This level role template already exists.");
  await repository.updateLevelRoleTemplate(env, context.companyId, id, merged, context.actorUserId);
  await audit(env, context, { action: "level_role_template_updated", entityType: "level_role_template", entityId: id, oldValue: existing, newValue: merged });
  return { template: await repository.findLevelRoleTemplateById(env, context.companyId, id) };
};

export const archiveLevelRoleTemplate = async (env: Env, context: AuthActor, id: string) => {
  const existing = await repository.findLevelRoleTemplateById(env, context.companyId, id);
  if (!existing || existing.archived_at) throw new NotFoundError("The requested level role template could not be found.");
  await repository.archiveLevelRoleTemplate(env, context.companyId, id, context.actorUserId);
  await audit(env, context, { action: "level_role_template_deleted", entityType: "level_role_template", entityId: id, oldValue: existing });
  return { archived: true };
};

export const getEmployeeStructure = async (env: Env, context: AuthActor, employeeId: string) => ({
  structure: await ensureEmployee(env, context, employeeId),
});

export const updateEmployeeStructure = async (env: Env, context: AuthActor, employeeId: string, input: EmployeeStructureInput) => {
  const employee = await ensureEmployee(env, context, employeeId);
  await ensureDepartment(env, context.companyId, input.department_id);
  const position = await ensurePosition(env, context.companyId, input.department_id, input.position_id);
  const effectiveFrom = input.effective_from ?? todayIso();
  await repository.closeOpenStructureHistory(env, context.companyId, employeeId, effectiveFrom);
  await repository.updateEmployeeStructure(env, context.companyId, employeeId, {
    departmentId: input.department_id,
    positionId: input.position_id,
    level: position.level,
    actorId: context.actorUserId,
  });
  await repository.createStructureHistory(env, {
    id: createPrefixedId("emp_struct_hist"),
    companyId: context.companyId,
    employeeId,
    previousDepartmentId: employee.department_id,
    previousPositionId: employee.position_id,
    previousLevel: employee.level,
    newDepartmentId: input.department_id,
    newPositionId: input.position_id,
    newLevel: position.level,
    reason: input.reason ?? null,
    effectiveFrom,
    changedBy: context.actorUserId,
  });
  await audit(env, context, {
    action: "employee_structure_changed",
    entityType: "employee",
    entityId: employeeId,
    oldValue: employee,
    newValue: { department_id: input.department_id, position_id: input.position_id, level: position.level },
    reason: input.reason,
  });
  return { structure: await repository.findEmployeeStructure(env, context.companyId, employeeId) };
};

export const listEmployeeStructureHistory = async (env: Env, context: AuthActor, employeeId: string) => {
  await ensureEmployee(env, context, employeeId);
  return { history: await repository.listStructureHistory(env, context.companyId, employeeId) };
};

const dedupeTemplates = (templates: LevelRoleTemplateRecord[]) => {
  const seen = new Set<string>();
  return templates.filter((template) => {
    if (seen.has(template.role_id)) return false;
    seen.add(template.role_id);
    return true;
  });
};

export const applyLevelRoleTemplate = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await ensureEmployee(env, context, employeeId);
  if (!employee.linked_user_id) {
    return { employee_id: employeeId, user_id: null, roles_added: [], roles_skipped: [] };
  }
  if (!employee.department_id || !employee.position_id || !employee.level) {
    return { employee_id: employeeId, user_id: employee.linked_user_id, roles_added: [], roles_skipped: [] };
  }
  const templates = dedupeTemplates(await repository.findTemplatesForStructure(env, context.companyId, {
    level: employee.level,
    departmentId: employee.department_id,
    positionId: employee.position_id,
  }));
  const existingRoleIds = new Set((await repository.getUserRoleIds(env, context.companyId, employee.linked_user_id)).map((row) => row.role_id));
  const toAdd = templates.filter((template) => !existingRoleIds.has(template.role_id));
  await repository.addUserRoles(env, context.companyId, employee.linked_user_id, toAdd.map((template) => template.role_id));
  const result = {
    employee_id: employeeId,
    user_id: employee.linked_user_id,
    roles_added: toAdd.map((template) => ({ role_id: template.role_id, role_name: template.role_name ?? null })),
    roles_skipped: templates
      .filter((template) => existingRoleIds.has(template.role_id))
      .map((template) => ({ role_id: template.role_id, role_name: template.role_name ?? null, reason: "Already assigned" })),
  };
  await audit(env, context, {
    action: "level_role_template_applied",
    entityType: "user",
    entityId: employee.linked_user_id,
    newValue: result,
    reason: "Applied employee structure role template.",
  });
  return result;
};
