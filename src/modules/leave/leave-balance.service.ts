import type { LeaveBalanceRecord, LeaveEmployeeRecord, LeavePolicyRecord } from "./leave.types";
import * as repository from "./leave.repository";
import { ConflictError } from "../../utils/errors";
import { createPrefixedId } from "../../utils/ids";

const nowIso = () => new Date().toISOString();

export const initializeBalanceIfNeeded = async (
  env: Env,
  companyId: string,
  employee: LeaveEmployeeRecord,
  leaveTypeId: string,
  year: number,
  policy: LeavePolicyRecord | null,
): Promise<LeaveBalanceRecord> => {
  const existing = await repository.findBalance(env, companyId, employee.id, leaveTypeId, year);
  if (existing) return existing;

  const entitlement = policy?.entitlement_days ?? 0;
  const carryForward = policy?.carry_forward_days ?? 0;
  const balance: LeaveBalanceRecord = {
    id: createPrefixedId("leave_balance"),
    company_id: companyId,
    employee_id: employee.id,
    leave_type_id: leaveTypeId,
    year,
    opening_balance: carryForward,
    accrued_days: entitlement,
    used_days: 0,
    remaining_days: entitlement + carryForward,
    updated_at: nowIso(),
  };
  await repository.upsertBalance(env, balance);
  return balance;
};

export const assertSufficientBalance = (
  balance: LeaveBalanceRecord,
  requestedDays: number,
  policy: LeavePolicyRecord | null,
) => {
  if (policy?.allow_negative_balance === 1) return;
  if (balance.remaining_days < requestedDays) {
    throw new ConflictError("Leave balance is not enough for this request.");
  }
};

export const deductBalance = async (
  env: Env,
  balance: LeaveBalanceRecord,
  days: number,
) => {
  await repository.upsertBalance(env, {
    ...balance,
    used_days: balance.used_days + days,
    remaining_days: balance.remaining_days - days,
    updated_at: nowIso(),
  });
};

export const restoreBalance = async (
  env: Env,
  balance: LeaveBalanceRecord,
  days: number,
) => {
  await repository.upsertBalance(env, {
    ...balance,
    used_days: Math.max(0, balance.used_days - days),
    remaining_days: balance.remaining_days + days,
    updated_at: nowIso(),
  });
};
