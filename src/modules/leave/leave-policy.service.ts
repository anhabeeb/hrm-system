import type { LeaveEmployeeRecord, LeavePolicyRecord, LeaveTypeRecord } from "./leave.types";
import * as repository from "./leave.repository";

export const findApplicablePolicy = (
  env: Env,
  companyId: string,
  employee: LeaveEmployeeRecord,
  leaveTypeId: string,
  effectiveDate: string,
): Promise<LeavePolicyRecord | null> =>
  repository.findActivePolicyForEmployee(
    env,
    companyId,
    employee.employee_type,
    leaveTypeId,
    effectiveDate,
  );

export const shouldCheckBalance = (leaveType: LeaveTypeRecord): boolean =>
  leaveType.is_paid === 1 && (leaveType.default_days ?? 0) > 0;
