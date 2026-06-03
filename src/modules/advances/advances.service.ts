import { ADVANCE_AUDIT_ACTIONS } from "./advances.constants";
import * as repository from "./advances.repository";
import type { AdvanceActionInput, AdvanceFilters, AdvanceInput, AdvanceListResult, AdvanceUpdateInput } from "./advances.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import { assertPayrollMonthUnlocked } from "../payroll/payroll-lock.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({ page, page_size: pageSize, total, total_pages: total === 0 ? 0 : Math.ceil(total / pageSize) });
const ensureAudit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; employeeId?: string; outletId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string }) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "advances",
    action: input.action,
    entityType: "advance_payment",
    entityId: input.entityId,
    employeeId: input.employeeId,
    actorId: context.actorUserId,
    oldValueJson: input.oldValue === undefined ? undefined : JSON.stringify(input.oldValue),
    newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue),
    reason: input.reason,
  });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};
const ensureEmployeeAccess = async (env: Env, context: AuthActor, employeeId: string) => {
  const employee = await repository.findEmployee(env, context.companyId, employeeId);
  if (!employee) throw new NotFoundError("The requested employee could not be found.");
  if (!permissionService.hasOutletAccess(context, employee.primary_outlet_id)) throw new OutletAccessError("You do not have access to this employee's outlet.");
  return employee;
};
const ensureAdvance = async (env: Env, context: AuthActor, id: string) => {
  const advance = await repository.findAdvance(env, context.companyId, id);
  if (!advance) throw new NotFoundError("Advance payment could not be found.");
  if (!permissionService.hasOutletAccess(context, advance.outlet_id)) throw new OutletAccessError("You do not have access to this employee's outlet.");
  return advance;
};

export const listAdvances = async (env: Env, context: AuthActor, filters: AdvanceFilters): Promise<AdvanceListResult<any>> => {
  const isSuperAdmin = permissionService.isSuperAdmin(context);
  const total = await repository.countAdvances(env, context.companyId, filters, context.outletIds, isSuperAdmin);
  return { rows: await repository.listAdvances(env, context.companyId, filters, context.outletIds, isSuperAdmin), pagination: pagination(filters.page, filters.page_size, total) };
};
export const getAdvance = (env: Env, context: AuthActor, id: string) => ensureAdvance(env, context, id);
export const createAdvance = async (env: Env, context: AuthActor, input: AdvanceInput) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  await assertPayrollMonthUnlocked(env, context.companyId, input.deduction_month);
  const id = createPrefixedId("advance");
  await repository.createAdvance(env, id, context.companyId, input, context.actorUserId);
  await ensureAudit(env, context, { action: ADVANCE_AUDIT_ACTIONS.created, entityId: id, employeeId: input.employee_id, outletId: employee.primary_outlet_id, newValue: input, reason: input.reason });
  return { advance: await repository.findAdvance(env, context.companyId, id) };
};
export const updateAdvance = async (env: Env, context: AuthActor, id: string, input: AdvanceUpdateInput) => {
  const existing = await ensureAdvance(env, context, id);
  await assertPayrollMonthUnlocked(env, context.companyId, input.deduction_month ?? existing.deduction_month);
  if (input.employee_id) await ensureEmployeeAccess(env, context, input.employee_id);
  await repository.updateAdvance(env, context.companyId, id, input);
  await ensureAudit(env, context, { action: ADVANCE_AUDIT_ACTIONS.updated, entityId: id, employeeId: existing.employee_id, outletId: existing.outlet_id, oldValue: existing, newValue: input, reason: input.reason });
  return { updated: true };
};
export const approveAdvance = async (env: Env, context: AuthActor, id: string, input: AdvanceActionInput) => {
  const advance = await ensureAdvance(env, context, id);
  await assertPayrollMonthUnlocked(env, context.companyId, advance.deduction_month);
  await repository.updateStatus(env, context.companyId, id, "approved");
  await ensureAudit(env, context, { action: ADVANCE_AUDIT_ACTIONS.approved, entityId: id, employeeId: advance.employee_id, outletId: advance.outlet_id, oldValue: advance, newValue: { status: "approved" }, reason: input.reason });
  return { approved: true };
};
export const rejectAdvance = async (env: Env, context: AuthActor, id: string, input: AdvanceActionInput) => {
  const advance = await ensureAdvance(env, context, id);
  await repository.updateStatus(env, context.companyId, id, "rejected");
  await ensureAudit(env, context, { action: ADVANCE_AUDIT_ACTIONS.rejected, entityId: id, employeeId: advance.employee_id, outletId: advance.outlet_id, oldValue: advance, newValue: { status: "rejected" }, reason: input.reason });
  return { rejected: true };
};
