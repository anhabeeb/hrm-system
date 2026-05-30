import type { PositionFilters, PositionRecord, PositionWriteInput } from "./positions.types";
import * as positionsRepository from "./positions.repository";
import { createAuditLog } from "../../services/audit.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const audit = async (env: Env, context: AuthActor, action: string, id: string, oldValue?: unknown, newValue?: unknown, reason?: string) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    module: "positions",
    action,
    entityType: "position",
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
  const row = await positionsRepository.findPositionById(env, companyId, id);
  if (!row) throw new NotFoundError("The requested position could not be found.");
  return row;
};
const merge = (existing: PositionRecord, input: Partial<PositionWriteInput>): PositionWriteInput & { deleted_at?: string | null } => ({
  title: input.title ?? existing.title,
  department_id: input.department_id !== undefined ? input.department_id : existing.department_id,
  code: input.code !== undefined ? input.code : existing.code,
  default_salary_amount: input.default_salary_amount !== undefined ? input.default_salary_amount : existing.default_salary_amount,
  status: input.status ?? existing.status,
  deleted_at: existing.deleted_at,
});
const unique = async (env: Env, companyId: string, code?: string | null, currentId?: string) => {
  if (!code) return;
  const existing = await positionsRepository.findPositionByCode(env, companyId, code);
  if (existing && existing.id !== currentId) throw new ConflictError("This position code is already in use.");
};
const validateDepartment = async (env: Env, companyId: string, departmentId?: string | null) => {
  if (!departmentId) return;
  const department = await positionsRepository.findDepartment(env, companyId, departmentId);
  if (!department || department.status !== "active") throw new ValidationError("Please choose an active department.");
};
export const listPositions = async (env: Env, context: AuthActor, filters: PositionFilters) => {
  const [total, rows] = await Promise.all([
    positionsRepository.countPositions(env, context.companyId, filters),
    positionsRepository.listPositions(env, context.companyId, filters),
  ]);
  const pagination: PaginationMeta = { page: filters.page, page_size: filters.page_size, total, total_pages: Math.ceil(total / filters.page_size) };
  return { rows, pagination };
};
export const getPosition = (env: Env, context: AuthActor, id: string) => ensure(env, context.companyId, id);
export const createPosition = async (env: Env, context: AuthActor, input: PositionWriteInput) => {
  await unique(env, context.companyId, input.code);
  await validateDepartment(env, context.companyId, input.department_id);
  const id = createPrefixedId("pos");
  await positionsRepository.createPosition(env, id, context.companyId, input);
  await audit(env, context, "position_created", id, undefined, input);
  return { position: await ensure(env, context.companyId, id) };
};
export const updatePosition = async (env: Env, context: AuthActor, id: string, input: Partial<PositionWriteInput>) => {
  const existing = await ensure(env, context.companyId, id);
  const merged = merge(existing, input);
  await unique(env, context.companyId, merged.code, id);
  await validateDepartment(env, context.companyId, merged.department_id);
  await positionsRepository.updatePosition(env, context.companyId, id, merged);
  await audit(env, context, "position_updated", id, existing, merged);
  return { position: await ensure(env, context.companyId, id) };
};
export const deletePosition = async (env: Env, context: AuthActor, id: string, reason: string) => {
  const existing = await ensure(env, context.companyId, id);
  const assigned = await positionsRepository.countAssignedEmployees(env, context.companyId, id);
  if (assigned > 0) throw new ValidationError("This position has active employees assigned. Please reassign them before deleting it.");
  const merged = merge(existing, { status: "disabled" });
  merged.deleted_at = new Date().toISOString();
  await positionsRepository.updatePosition(env, context.companyId, id, merged);
  await audit(env, context, "position_deleted", id, existing, merged, reason);
  return { deleted: true };
};
