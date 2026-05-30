import * as repository from "./payroll.repository";
import type { AuthActor } from "../../types/api.types";
import { createPrefixedId } from "../../utils/ids";

export const preparePayrollExport = async (
  env: Env,
  context: AuthActor,
  input: { payrollRunId: string; payrollMonth: string; reason?: string; totalsScope: string; outletIds: string[] },
) => {
  const id = createPrefixedId("export_job");
  await repository.createExportJob(env, {
    id,
    companyId: context.companyId,
    filtersJson: JSON.stringify({
      payroll_run_id: input.payrollRunId,
      payroll_month: input.payrollMonth,
      totals_scope: input.totalsScope,
      outlet_scope: input.outletIds.length > 0 ? input.outletIds : "company",
    }),
    requestedBy: context.actorUserId,
    reason: input.reason,
  });
  return { export_job_id: id, totals_scope: input.totalsScope };
};
