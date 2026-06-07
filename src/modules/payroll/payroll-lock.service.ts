import { PAYROLL_LOCKED_STATUSES } from "./payroll.constants";
import * as repository from "./payroll.repository";
import type { PayrollRunRecord } from "./payroll.types";
import { LockedRecordError } from "../../utils/errors";

export const isPayrollRunLocked = (run: PayrollRunRecord) =>
  PAYROLL_LOCKED_STATUSES.includes(run.status as any);

export const assertPayrollRunEditable = (run: PayrollRunRecord) => {
  if (isPayrollRunLocked(run)) {
    throw new LockedRecordError("This payroll period has been finalized and cannot be edited.");
  }
};

export const assertPayrollMonthUnlocked = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
) => {
  const run = await repository.findRunByMonth(env, companyId, payrollMonth);
  if (run && isPayrollRunLocked(run)) {
    throw new LockedRecordError("This payroll period has been finalized and cannot be edited.");
  }
};

export const assertPayrollPeriodNotFinalized = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
) => assertPayrollMonthUnlocked(env, companyId, payrollMonth);

export const getPayrollMonthFromDate = (date: string) => date.slice(0, 7);
