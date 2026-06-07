import { UNIFORM_AUDIT_ACTIONS } from "./uniforms.constants";
import * as repository from "./uniforms.repository";
import type { UniformFilters, UniformIssueInput, UniformListResult, UniformReturnInput } from "./uniforms.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { broadcastEvent } from "../../services/realtime.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({ page, page_size: pageSize, total, total_pages: total === 0 ? 0 : Math.ceil(total / pageSize) });
const scope = (context: AuthActor) => ({ isSuperAdmin: permissionService.isSuperAdmin(context), outletIds: context.outletIds });
const audit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; outletId?: string | null; employeeId?: string; newValue?: unknown; reason?: string }) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "uniforms",
    action: input.action,
    entityType: "uniform_issue",
    entityId: input.entityId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};
const ensureEmployee = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee || employee.deleted_at) throw new NotFoundError("The requested employee could not be found.");
  if (["archived", "resigned", "terminated", "retired", "inactive"].includes(employee.employment_status)) throw new ConflictError("This employee is not active.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) throw new OutletAccessError("You do not have access to this employee's outlet.");
  return employee;
};
const ensureIssueOutlet = async (env: Env, context: AuthActor, employee: any, outletId?: string) => {
  if (!outletId) return employee.primary_outlet_id;
  const outlet = await repository.findOutlet(env, context.companyId, outletId);
  if (!outlet || outlet.status !== "active") throw new NotFoundError("Outlet not found.");
  if (!permissionService.hasOutletAccess(context, outlet.id)) throw new OutletAccessError("You do not have access to this outlet.");
  if (outlet.id !== employee.primary_outlet_id) {
    throw new AppError("Uniforms must be issued from the employee's assigned outlet.", "UNIFORM_OUTLET_MISMATCH", 409);
  }
  return outlet.id;
};

export const listUniforms = async (env: Env, context: AuthActor, filters: UniformFilters): Promise<UniformListResult<any>> => {
  const total = await repository.countUniforms(env, context.companyId, filters, scope(context));
  return { rows: await repository.listUniforms(env, context.companyId, filters, scope(context)), pagination: pagination(filters.page, filters.page_size, total) };
};
export const issueUniform = async (env: Env, context: AuthActor, input: UniformIssueInput) => {
  const employee = await ensureEmployee(env, context, input.employee_id);
  const outletId = await ensureIssueOutlet(env, context, employee, input.outlet_id);
  const id = createPrefixedId("uniform");
  await repository.createUniformIssue(env, id, context.companyId, input, outletId, context.actorUserId);
  await audit(env, context, { action: UNIFORM_AUDIT_ACTIONS.issued, entityId: id, outletId, employeeId: employee.id, newValue: input, reason: input.reason });
  await broadcastEvent(env, { roomName: `company:${context.companyId}`, type: "uniforms.issued", payload: { uniform_issue_id: id }, triggeredBy: context.actorUserId }).catch(() => undefined);
  return { uniform_issue: await repository.findUniformById(env, context.companyId, id) };
};
export const getUniform = async (env: Env, context: AuthActor, id: string) => {
  const issue = await repository.findUniformById(env, context.companyId, id);
  if (!issue) throw new NotFoundError("Uniform record not found.");
  if (!permissionService.hasOutletAccess(context, issue.employee_outlet_id ?? issue.outlet_id)) {
    throw new OutletAccessError("You do not have access to this uniform record.");
  }
  const { employee_outlet_id: _employeeOutletId, company_id: _companyId, ...safe } = issue;
  return { uniform_issue: safe };
};
export const returnUniform = async (env: Env, context: AuthActor, id: string, input: UniformReturnInput) => {
  const issue = await repository.findUniformById(env, context.companyId, id);
  if (!issue) throw new NotFoundError("Uniform issue not found.");
  if (!permissionService.hasOutletAccess(context, issue.employee_outlet_id ?? issue.outlet_id)) throw new OutletAccessError("You do not have access to this uniform issue.");
  if (issue.status === "returned") throw new ConflictError("This uniform has already been returned.");
  if (input.returned_date < issue.issued_date) throw new ConflictError("Return date cannot be before the issue date.");
  await repository.returnUniform(env, context.companyId, id, input.returned_date);
  await audit(env, context, { action: UNIFORM_AUDIT_ACTIONS.returned, entityId: id, outletId: issue.employee_outlet_id ?? issue.outlet_id, employeeId: issue.employee_id, newValue: input, reason: input.reason });
  await broadcastEvent(env, { roomName: `company:${context.companyId}`, type: "uniforms.returned", payload: { uniform_issue_id: id }, triggeredBy: context.actorUserId }).catch(() => undefined);
  return { returned: true };
};
export const pendingReturn = (env: Env, context: AuthActor, filters: UniformFilters) =>
  listUniforms(env, context, { ...filters, status: "issued" });
