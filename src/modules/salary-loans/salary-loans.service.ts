import { SALARY_LOAN_AUDIT_ACTIONS } from "./salary-loans.constants";
import * as repository from "./salary-loans.repository";
import type { SalaryLoanActionInput, SalaryLoanFilters, SalaryLoanInput, SalaryLoanListResult, SalaryLoanUpdateInput } from "./salary-loans.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, LockedRecordError, NotFoundError, OutletAccessError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({ page, page_size: pageSize, total, total_pages: total === 0 ? 0 : Math.ceil(total / pageSize) });
const ensureAudit = async (env: Env, context: AuthActor, input: { action: string; entityId: string; employeeId?: string; outletId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string }) => {
  const result = await createAuditLog(env, {
    companyId: context.companyId,
    outletId: input.outletId ?? undefined,
    module: "salary_loans",
    action: input.action,
    entityType: "salary_loan",
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
const ensureLoan = async (env: Env, context: AuthActor, id: string) => {
  const loan = await repository.findLoan(env, context.companyId, id);
  if (!loan) throw new NotFoundError("Salary loan could not be found.");
  if (!permissionService.hasOutletAccess(context, loan.outlet_id)) throw new OutletAccessError("You do not have access to this employee's outlet.");
  return loan;
};
const addMonths = (month: string, offset: number) => {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};
const scheduleMonths = (loanAmount: number, installmentAmount: number, startMonth: string) => {
  const months: string[] = [];
  let remaining = loanAmount;
  let offset = 0;
  while (remaining > 0) {
    months.push(addMonths(startMonth, offset));
    remaining -= Math.min(remaining, installmentAmount);
    offset += 1;
  }
  return months;
};
const assertLoanMonthsUnlocked = async (env: Env, companyId: string, months: string[]) => {
  const uniqueMonths = [...new Set(months)];
  const locked = await repository.listLockedPayrollMonths(env, companyId, uniqueMonths);
  if (locked.length > 0) {
    throw new LockedRecordError("This salary loan affects a locked payroll period.");
  }
};
const approvedLoanError = () =>
  new AppError("This salary loan has already been approved.", "SALARY_LOAN_ALREADY_APPROVED", 409);
export const listLoans = async (env: Env, context: AuthActor, filters: SalaryLoanFilters): Promise<SalaryLoanListResult<any>> => {
  const isSuperAdmin = permissionService.isSuperAdmin(context);
  const total = await repository.countLoans(env, context.companyId, filters, context.outletIds, isSuperAdmin);
  return { rows: await repository.listLoans(env, context.companyId, filters, context.outletIds, isSuperAdmin), pagination: pagination(filters.page, filters.page_size, total) };
};
export const getLoan = (env: Env, context: AuthActor, id: string) => ensureLoan(env, context, id);
export const createLoan = async (env: Env, context: AuthActor, input: SalaryLoanInput) => {
  const employee = await ensureEmployeeAccess(env, context, input.employee_id);
  const id = createPrefixedId("salary_loan");
  await repository.createLoan(env, id, context.companyId, input, context.actorUserId);
  await ensureAudit(env, context, { action: SALARY_LOAN_AUDIT_ACTIONS.created, entityId: id, employeeId: input.employee_id, outletId: employee.primary_outlet_id, newValue: input, reason: input.reason });
  return { salary_loan: await repository.findLoan(env, context.companyId, id) };
};
export const updateLoan = async (env: Env, context: AuthActor, id: string, input: SalaryLoanUpdateInput) => {
  const existing = await ensureLoan(env, context, id);
  if (input.employee_id) await ensureEmployeeAccess(env, context, input.employee_id);
  if (input.loan_amount !== undefined || input.installment_amount !== undefined || input.start_month !== undefined || input.employee_id !== undefined) {
    const existingMonths = await repository.listMutableInstallmentMonths(env, context.companyId, id);
    const proposedMonths = scheduleMonths(
      input.loan_amount ?? existing.loan_amount,
      input.installment_amount ?? existing.installment_amount,
      input.start_month ?? existing.start_month,
    );
    await assertLoanMonthsUnlocked(env, context.companyId, [...existingMonths, ...proposedMonths]);
  }
  await repository.updateLoan(env, context.companyId, id, input);
  await ensureAudit(env, context, { action: SALARY_LOAN_AUDIT_ACTIONS.updated, entityId: id, employeeId: existing.employee_id, outletId: existing.outlet_id, oldValue: existing, newValue: input, reason: input.reason });
  return { updated: true };
};
export const approveLoan = async (env: Env, context: AuthActor, id: string, input: SalaryLoanActionInput) => {
  const loan = await ensureLoan(env, context, id);
  if (!["pending", "review"].includes(loan.status)) throw approvedLoanError();
  if ((await repository.countInstallments(env, context.companyId, id)) > 0) throw approvedLoanError();
  await assertLoanMonthsUnlocked(env, context.companyId, scheduleMonths(loan.loan_amount, loan.installment_amount, loan.start_month));
  await repository.updateLoanStatus(env, context.companyId, id, "approved");
  await repository.createInstallments(env, context.companyId, loan);
  await ensureAudit(env, context, { action: SALARY_LOAN_AUDIT_ACTIONS.approved, entityId: id, employeeId: loan.employee_id, outletId: loan.outlet_id, oldValue: loan, newValue: { status: "approved" }, reason: input.reason });
  return { approved: true };
};
export const pauseLoan = async (env: Env, context: AuthActor, id: string, input: SalaryLoanActionInput) => {
  const loan = await ensureLoan(env, context, id);
  await assertLoanMonthsUnlocked(env, context.companyId, await repository.listMutableInstallmentMonths(env, context.companyId, id));
  await repository.updateLoanStatus(env, context.companyId, id, "paused");
  await repository.pauseFutureInstallments(env, context.companyId, id);
  await ensureAudit(env, context, { action: SALARY_LOAN_AUDIT_ACTIONS.paused, entityId: id, employeeId: loan.employee_id, outletId: loan.outlet_id, oldValue: loan, newValue: { status: "paused" }, reason: input.reason });
  return { paused: true };
};
export const settleLoan = async (env: Env, context: AuthActor, id: string, input: SalaryLoanActionInput) => {
  const loan = await ensureLoan(env, context, id);
  await assertLoanMonthsUnlocked(env, context.companyId, await repository.listMutableInstallmentMonths(env, context.companyId, id));
  await repository.updateLoanStatus(env, context.companyId, id, "settled", 0);
  await repository.settleFutureInstallments(env, context.companyId, id);
  await ensureAudit(env, context, { action: SALARY_LOAN_AUDIT_ACTIONS.settled, entityId: id, employeeId: loan.employee_id, outletId: loan.outlet_id, oldValue: loan, newValue: { status: "settled", outstanding_amount: 0 }, reason: input.reason });
  return { settled: true };
};
export const listInstallments = async (env: Env, context: AuthActor, id: string) => {
  await ensureLoan(env, context, id);
  return repository.listInstallments(env, context.companyId, id);
};
