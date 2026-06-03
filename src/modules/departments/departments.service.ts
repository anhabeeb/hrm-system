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
  status: input.status ?? existing.status,
  deleted_at: existing.deleted_at,
});
const unique = async (env: Env, companyId: string, code?: string | null, currentId?: string) => {
  if (!code) return;
  const existing = await departmentsRepository.findDepartmentByCode(env, companyId, code);
  if (existing && existing.id !== currentId) throw new ConflictError("This department code is already in use.");
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
  const id = createPrefixedId("dept");
  await departmentsRepository.createDepartment(env, id, context.companyId, input);
  await audit(env, context, "department_created", id, undefined, input);
  return { department: await ensure(env, context.companyId, id) };
};
export const updateDepartment = async (env: Env, context: AuthActor, id: string, input: Partial<DepartmentWriteInput>) => {
  const existing = await ensure(env, context.companyId, id);
  const merged = merge(existing, input);
  await unique(env, context.companyId, merged.code, id);
  await departmentsRepository.updateDepartment(env, context.companyId, id, merged);
  await audit(env, context, "department_updated", id, existing, merged);
  return { department: await ensure(env, context.companyId, id) };
};
export const deleteDepartment = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const existing = await ensure(env, context.companyId, id);
  const assigned = await departmentsRepository.countAssignedEmployees(env, context.companyId, id);
  if (assigned > 0) throw new ValidationError("This department has active employees assigned. Please reassign them before deleting it.");
  const merged = merge(existing, { status: "disabled" });
  merged.deleted_at = new Date().toISOString();
  await departmentsRepository.updateDepartment(env, context.companyId, id, merged);
  await audit(env, context, "department_deleted", id, existing, merged, reason);
  return { deleted: true };
};
