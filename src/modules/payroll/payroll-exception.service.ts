import * as repository from "./payroll.repository";
import type { PayrollExceptionFilters, PayrollListResult, PayrollOutletScope } from "./payroll.types";
import type { PaginationMeta } from "../../types/api.types";
import { createPrefixedId } from "../../utils/ids";

const pagination = (page: number, pageSize: number, total: number): PaginationMeta => ({
  page,
  page_size: pageSize,
  total,
  total_pages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

export const createPayrollException = (
  env: Env,
  input: {
    companyId: string;
    payrollRunId: string;
    employeeId?: string | null;
    outletId?: string | null;
    exceptionType: string;
    severity: string;
    message: string;
  },
) =>
  repository.createException(env, {
    id: createPrefixedId("pay_exc"),
    ...input,
  });

export const listPayrollExceptions = async (
  env: Env,
  companyId: string,
  runId: string,
  filters: PayrollExceptionFilters,
  scope: PayrollOutletScope,
): Promise<PayrollListResult<any>> => {
  const total = await repository.countExceptions(env, companyId, runId, filters, scope);
  return {
    rows: await repository.listExceptions(env, companyId, runId, filters, scope),
    pagination: pagination(filters.page, filters.page_size, total),
  };
};
