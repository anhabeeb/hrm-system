import * as balanceService from "./leave-balance.service";
import * as policyService from "./leave-policy.service";
import * as repository from "./leave.repository";
import type { LeaveAccrualInput, LeaveEmployeeRecord, LeaveTypeRecord } from "./leave.types";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import type { AuthActor } from "../../types/api.types";

const monthKey = (date: string) => date.slice(0, 7);
const yearKey = (date: string) => date.slice(0, 4);
const daysInMonth = (date: string) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
const dayOfMonth = (date: string) => Number(date.slice(8, 10));
const yearFromDate = (date: string) => Number(date.slice(0, 4));
const joinDate = (employee: LeaveEmployeeRecord) =>
  employee.date_of_joining ?? employee.hire_date ?? employee.joined_at?.slice(0, 10) ?? null;
const terminationDate = (employee: LeaveEmployeeRecord) =>
  employee.exit_date ?? employee.termination_date ?? null;

const previewBalance = async (
  env: Env,
  companyId: string,
  employee: LeaveEmployeeRecord,
  leaveType: LeaveTypeRecord,
  year: number,
  policy: Awaited<ReturnType<typeof policyService.findApplicablePolicy>>,
) => {
  const existing = await repository.findBalance(env, companyId, employee.id, leaveType.id, year);
  if (existing) return balanceService.normalizeBalance(existing);
  const entitlement = Number(policy?.entitlement_days ?? leaveType.annual_entitlement_days ?? leaveType.default_days ?? 0);
  const accruedDays = (leaveType.accrual_enabled ?? 0) === 1 ? 0 : entitlement;
  return balanceService.normalizeBalance({
    id: `preview:${employee.id}:${leaveType.id}:${year}`,
    company_id: companyId,
    employee_id: employee.id,
    leave_type_id: leaveType.id,
    year,
    opening_balance: 0,
    accrued_days: accruedDays,
    used_days: 0,
    pending_days: 0,
    adjusted_days: 0,
    carried_forward_days: 0,
    expired_days: 0,
    entitlement_days: entitlement,
    remaining_days: accruedDays,
    updated_at: new Date().toISOString(),
  });
};

const accrualPeriodKey = (leaveType: LeaveTypeRecord, asOfDate: string) => {
  switch (leaveType.accrual_frequency) {
    case "daily":
      return asOfDate;
    case "yearly":
      return yearKey(asOfDate);
    case "monthly":
    default:
      return monthKey(asOfDate);
  }
};

const baseAccrualAmount = (leaveType: LeaveTypeRecord) => {
  if (leaveType.accrual_amount !== null && leaveType.accrual_amount !== undefined) return Number(leaveType.accrual_amount);
  const annual = Number(leaveType.annual_entitlement_days ?? leaveType.default_days ?? 0);
  if (leaveType.accrual_frequency === "yearly") return annual;
  if (leaveType.accrual_frequency === "daily") return annual / 365;
  return annual / 12;
};

const prorateAmount = (amount: number, leaveType: LeaveTypeRecord, employee: LeaveEmployeeRecord, asOfDate: string) => {
  const joined = joinDate(employee);
  if ((leaveType.prorate_on_joining ?? 0) !== 1 || !joined) return amount;
  if (leaveType.accrual_frequency === "monthly" && joined.slice(0, 7) === asOfDate.slice(0, 7)) {
    const days = daysInMonth(asOfDate);
    return amount * ((days - dayOfMonth(joined) + 1) / days);
  }
  if (leaveType.accrual_frequency === "yearly" && joined.slice(0, 4) === asOfDate.slice(0, 4)) {
    const start = Date.parse(`${joined}T00:00:00Z`);
    const end = Date.parse(`${asOfDate.slice(0, 4)}-12-31T00:00:00Z`);
    return amount * (((end - start) / 86400000 + 1) / 365);
  }
  return amount;
};

const isEligible = (employee: LeaveEmployeeRecord, asOfDate: string) => {
  const joined = joinDate(employee);
  if (joined && joined > asOfDate) return "Employee has not joined yet.";
  const ended = terminationDate(employee);
  if (ended && ended < asOfDate) return "Employee has already exited before this accrual date.";
  if (!["active", "confirmed", "on_leave"].includes(employee.employment_status)) {
    return "Employee is not active for leave accrual.";
  }
  return null;
};

const auditBestEffort = (
  env: Env,
  context: AuthActor,
  action: string,
  newValue: unknown,
  reason?: string | null,
) => createAuditLog(env, {
  companyId: context.companyId,
  module: "leave",
  action,
  entityType: "leave_accrual",
  entityId: `leave_accrual:${new Date().toISOString()}`,
  actorId: context.actorUserId,
  newValueJson: JSON.stringify(newValue),
  reason: reason ?? undefined,
  requestId: context.requestId,
  ipAddress: context.ipAddress,
  userAgent: context.userAgent,
}).catch((error) => console.error("Leave accrual audit failed", error));

const scope = (context: AuthActor) => ({
  isSuperAdmin: permissionService.isSuperAdmin(context),
  outletIds: context.outletIds,
});

export const previewCompanyAccrual = async (env: Env, context: AuthActor, input: LeaveAccrualInput) => {
  const employees = await repository.listEligibleEmployeesForAccrual(env, context.companyId, input, scope(context));
  const leaveTypes = await repository.listAccrualLeaveTypes(env, context.companyId, input.leave_type_id);
  const rows = [];

  for (const employee of employees) {
    const skipReason = isEligible(employee, input.as_of_date);
    for (const leaveType of leaveTypes) {
      const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, input.as_of_date);
      const year = yearFromDate(input.as_of_date);
      const balance = await previewBalance(env, context.companyId, employee, leaveType, year, policy);
      const periodKey = accrualPeriodKey(leaveType, input.as_of_date);
      const existing = await repository.findTransactionByIdempotencyKey(
        env,
        context.companyId,
        `accrual:${employee.id}:${leaveType.id}:${periodKey}`,
      );
      const amount = skipReason || existing ? 0 : Number(prorateAmount(baseAccrualAmount(leaveType), leaveType, employee, input.as_of_date).toFixed(4));
      rows.push({
        employee_id: employee.id,
        employee_code: employee.employee_code,
        employee_name: employee.full_name,
        leave_type_id: leaveType.id,
        leave_type_name: leaveType.leave_name,
        period_key: periodKey,
        current_balance: balance.available_days ?? balance.remaining_days,
        accrual_amount: amount,
        resulting_balance: (balance.available_days ?? balance.remaining_days) + amount,
        skipped: Boolean(skipReason || existing),
        skipped_reason: skipReason ?? (existing ? "Leave accrual was already applied for this period." : null),
      });
    }
  }
  await auditBestEffort(env, context, "leave_accrual_preview_generated", { filters: input, row_count: rows.length }, input.reason);
  return { rows, summary: { employees: employees.length, leave_types: leaveTypes.length, rows: rows.length } };
};

export const applyCompanyAccrual = async (env: Env, context: AuthActor, input: LeaveAccrualInput) => {
  const preview = await previewCompanyAccrual(env, context, input);
  const applied = [];
  const skipped = [];
  for (const row of preview.rows) {
    if (row.skipped || row.accrual_amount <= 0) {
      skipped.push(row);
      continue;
    }
    const employee = await repository.findEmployee(env, context.companyId, row.employee_id);
    const leaveType = await repository.findLeaveType(env, context.companyId, row.leave_type_id);
    if (!employee || !leaveType) {
      skipped.push({ ...row, skipped_reason: "Employee or leave type no longer exists." });
      continue;
    }
    const policy = await policyService.findApplicablePolicy(env, context.companyId, employee, leaveType.id, input.as_of_date);
    const balance = await balanceService.initializeBalanceIfNeeded(env, context.companyId, employee, leaveType.id, yearFromDate(input.as_of_date), policy, leaveType);
    const result = await balanceService.applyAccrual(env, {
      balance,
      leaveType,
      policy,
      amount: row.accrual_amount,
      periodKey: row.period_key,
      effectiveDate: input.as_of_date,
      actorId: context.actorUserId,
    });
    if (result.applied) applied.push({ ...row, transaction_id: result.transaction.id });
    else skipped.push({ ...row, skipped_reason: "Leave accrual was already applied for this period." });
  }
  await auditBestEffort(env, context, "leave_accrual_applied", { applied: applied.length, skipped: skipped.length, filters: input }, input.reason);
  return { applied, skipped, summary: { applied: applied.length, skipped: skipped.length } };
};
