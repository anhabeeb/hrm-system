import { PAYSLIP_AUDIT_ACTIONS } from "./payslips.constants";
import * as repository from "./payslips.repository";
import type { PayslipFilters, PayslipGenerateInput, PayslipListResult } from "./payslips.types";
import { hasFullPayrollAccess } from "../payroll/payroll.service";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, ConflictError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({ page, page_size: pageSize, total, total_pages: total === 0 ? 0 : Math.ceil(total / pageSize) });
const ensureAudit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; newValue?: unknown; reason?: string }) => {
  const result = await createAuditLog(env, { companyId: context.companyId, module: "payslips", action: input.action, entityType: "payslip", entityId: input.entityId, actorId: context.actorUserId, newValueJson: input.newValue === undefined ? undefined : JSON.stringify(input.newValue), reason: input.reason });
  if (!result.created) throw new AppError("Audit log could not be recorded. Please try again.", "SERVER_ERROR", 500);
};
const ensurePayslip = async (env: Env, context: AuthActor, id: string) => {
  const payslip = await repository.findPayslip(env, context.companyId, id);
  if (!payslip) throw new NotFoundError("Payslip could not be found.");
  if (!permissionService.hasOutletAccess(context, payslip.outlet_id)) throw new OutletAccessError("You do not have access to this payslip.");
  return payslip;
};
export const generateBatch = async (env: Env, context: AuthActor, input: PayslipGenerateInput) => {
  const run = await repository.findPayrollRun(env, context.companyId, input.payroll_run_id);
  if (!run) throw new NotFoundError("Payroll run could not be found.");
  if (!["approved", "locked", "paid"].includes(run.status)) throw new ConflictError("Payroll must be approved or locked before payslips can be generated.");
  const fullAccess = await hasFullPayrollAccess(env, context);
  if (input.outlet_id && !fullAccess && !context.outletIds.includes(input.outlet_id)) {
    throw new OutletAccessError("You do not have access to generate payslips for this outlet.");
  }
  const scopedOutletIds = input.outlet_id
    ? [input.outlet_id]
    : fullAccess
      ? undefined
      : context.outletIds;
  const [items, existingCount, scopedItemCount] = await Promise.all([
    repository.listPayrollItemsWithoutPayslips(env, context.companyId, input.payroll_run_id, scopedOutletIds),
    repository.countExistingPayslipsForRun(env, context.companyId, input.payroll_run_id, scopedOutletIds),
    repository.countPayrollItemsForRun(env, context.companyId, input.payroll_run_id, scopedOutletIds),
  ]);
  let created = 0;
  for (const item of items) {
    await repository.createPayslip(env, { id: createPrefixedId("payslip"), companyId: context.companyId, payrollRunId: input.payroll_run_id, payrollItemId: item.id, employeeId: item.employee_id, generatedBy: context.actorUserId });
    created += 1;
  }
  await ensureAudit(env, context, {
    action: PAYSLIP_AUDIT_ACTIONS.generated,
    entityId: input.payroll_run_id,
    newValue: { created, scope: fullAccess && !input.outlet_id ? "company" : "accessible_outlets", outlet_id: input.outlet_id },
    reason: input.reason,
  });
  return {
    created,
    skipped_existing: existingCount,
    skipped_inaccessible: 0,
    scope: fullAccess && !input.outlet_id ? "company" : "accessible_outlets",
    scoped_item_count: scopedItemCount,
  };
};
export const listPayslips = async (env: Env, context: AuthActor, filters: PayslipFilters): Promise<PayslipListResult<any>> => {
  const isSuperAdmin = permissionService.isSuperAdmin(context);
  const total = await repository.countPayslips(env, context.companyId, filters, context.outletIds, isSuperAdmin);
  return { rows: await repository.listPayslips(env, context.companyId, filters, context.outletIds, isSuperAdmin), pagination: pagination(filters.page, filters.page_size, total) };
};
export const getPayslip = (env: Env, context: AuthActor, id: string) => ensurePayslip(env, context, id);
export const downloadPlaceholder = async (env: Env, context: AuthActor, id: string) => {
  const payslip = await ensurePayslip(env, context, id);
  if (!payslip.file_key) return { available: false, message: "Payslip PDF generation is not available yet." };
  return { available: true, file_key: payslip.file_key };
};
