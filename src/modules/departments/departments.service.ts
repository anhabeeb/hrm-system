import type { DepartmentFilters, DepartmentRecord, DepartmentWriteInput } from "./departments.types";
import * as departmentsRepository from "./departments.repository";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const audit = async (env: Env, context: AuthActor, action: string, id: string, oldValue?: unknown, newValue?: unknown, reason?: string) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "departments",
    action,
    entityType: "department",
    entityId: id,
    actorId: context.actorUserId,
    oldValueJson: oldValue === undefined ? undefined : JSON.stringify(oldValue),
    newValueJson: newValue === undefined ? undefined : JSON.stringify(newValue),
    reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};
const ensure = async (env: Env, companyId: string, id: string) => {
  const row = await departmentsRepository.findDepartmentById(env, companyId, id);
  if (!row) throw new NotFoundError("The requested department could not be found.");
  return row;
};
const merge = (existing: DepartmentRecord, input: Partial<DepartmentWriteInput>): DepartmentWriteInput & { deleted_at?: string | null } => ({
  name: input.name ?? existing.name,
  code: input.code !== undefined ? input.code : existing.code,
  description: input.description !== undefined ? input.description : existing.description ?? null,
  head_employee_id: input.head_employee_id !== undefined ? input.head_employee_id : existing.head_employee_id ?? null,
  day_to_day_management_min_level: input.day_to_day_management_min_level ?? existing.day_to_day_management_min_level ?? 3,
  status: input.status ?? existing.status,
  archived_at: existing.archived_at ?? null,
  deleted_at: existing.deleted_at,
});
const unique = async (env: Env, companyId: string, code?: string | null, currentId?: string) => {
  if (!code) return;
  const existing = await departmentsRepository.findDepartmentByCode(env, companyId, code);
  if (existing && existing.id !== currentId) throw new ConflictError("This department code is already in use.");
};
const uniqueName = async (env: Env, companyId: string, name: string, currentId?: string) => {
  const existing = await departmentsRepository.findDepartmentByName(env, companyId, name);
  if (existing && existing.id !== currentId) throw new ConflictError("This department name is already in use.");
};
const validateHeadEmployee = async (env: Env, companyId: string, employeeId?: string | null) => {
  if (!employeeId) return;
  const employee = await departmentsRepository.findHeadEmployee(env, companyId, employeeId);
  if (!employee) throw new ValidationError("Department head must be an employee in the same company.");
};
export const listDepartments = async (env: Env, context: AuthActor, filters: DepartmentFilters) => {
  const [total, rows] = await Promise.all([
    departmentsRepository.countDepartments(env, context.companyId, filters),
    departmentsRepository.listDepartments(env, context.companyId, filters),
  ]);
  const pagination: PaginationMeta = { page: filters.page, page_size: filters.page_size, total, total_pages: Math.ceil(total / filters.page_size) };
  return { rows, pagination };
};
export const getDepartment = (env: Env, context: AuthActor, id: string) => ensure(env, context.companyId, id);
export const createDepartment = async (env: Env, context: AuthActor, input: DepartmentWriteInput) => {
  await unique(env, context.companyId, input.code);
  await uniqueName(env, context.companyId, input.name);
  await validateHeadEmployee(env, context.companyId, input.head_employee_id);
  const id = createPrefixedId("dept");
  await departmentsRepository.createDepartment(env, id, context.companyId, {
    ...input,
    created_by: context.actorUserId,
    updated_by: context.actorUserId,
  });
  await audit(env, context, "department_created", id, undefined, input);
  return { department: await ensure(env, context.companyId, id) };
};
export const updateDepartment = async (env: Env, context: AuthActor, id: string, input: Partial<DepartmentWriteInput>) => {
  const existing = await ensure(env, context.companyId, id);
  const merged = merge(existing, input);
  await unique(env, context.companyId, merged.code, id);
  await uniqueName(env, context.companyId, merged.name, id);
  await validateHeadEmployee(env, context.companyId, merged.head_employee_id);
  await departmentsRepository.updateDepartment(env, context.companyId, id, {
    ...merged,
    updated_by: context.actorUserId,
  });
  await audit(env, context, "department_updated", id, existing, merged);
  return { department: await ensure(env, context.companyId, id) };
};
export const setDepartmentStatus = async (env: Env, context: AuthActor, id: string, status: "active" | "disabled", reason?: string) => {
  const existing = await ensure(env, context.companyId, id);
  const merged = merge(existing, { status });
  await departmentsRepository.updateDepartment(env, context.companyId, id, {
    ...merged,
    updated_by: context.actorUserId,
  });
  await audit(env, context, status === "active" ? "department_enabled" : "department_disabled", id, existing, merged, reason);
  return { department: await ensure(env, context.companyId, id) };
};
export const deleteDepartment = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const existing = await ensure(env, context.companyId, id);
  const [assigned, positions] = await Promise.all([
    departmentsRepository.countAssignedEmployees(env, context.companyId, id),
    departmentsRepository.countAssignedPositions(env, context.companyId, id),
  ]);
  if (assigned > 0 || positions > 0) throw new ValidationError("This department has active employees or positions assigned. Please reassign them before archiving it.");
  const merged = merge(existing, { status: "disabled" });
  merged.deleted_at = new Date().toISOString();
  merged.archived_at = merged.deleted_at;
  await departmentsRepository.updateDepartment(env, context.companyId, id, {
    ...merged,
    updated_by: context.actorUserId,
  });
  await audit(env, context, "department_archived", id, existing, merged, reason);
  return { archived: true };
};
