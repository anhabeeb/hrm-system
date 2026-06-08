import type { Context } from "hono";
import type { AppContext, AuthActor } from "../../types/api.types";
import { ok } from "../../utils/response";
import * as service from "./hr-reports.service";
import { validateHrReportFilters } from "./hr-reports.validators";

const actor = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const request = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const query = (c: Context<AppContext>, historyRequired = false) =>
  validateHrReportFilters(c.req.query(), { historyRequired });

export const catalog = (c: Context<AppContext>) =>
  ok(service.catalog(actor(c)), "HR report catalog loaded successfully.", request(c));

export const summary = async (c: Context<AppContext>) =>
  ok(await service.summary(c.env, actor(c), query(c)), "HR report summary loaded successfully.", request(c));

const report = (reportKey: string, historyRequired = false) => async (c: Context<AppContext>) =>
  ok(
    await service.runReport(c.env, actor(c), reportKey, query(c, historyRequired)),
    "HR report loaded successfully.",
    request(c),
  );

export const employeeMaster = report("employee-master");
export const employeeStatus = report("employee-status");
export const localForeign = report("local-foreign");
export const headcount = report("headcount");
export const newJoiners = report("new-joiners");
export const probation = report("probation");
export const contracts = report("contracts");
export const documentCompliance = report("document-compliance");
export const foreignCompliance = report("foreign-compliance");
export const leaveBalances = report("leave-balances");
export const leaveRequests = report("leave-requests", true);
export const longLeave = report("long-leave", true);
export const assetsUniforms = report("assets-uniforms");
export const complianceSummary = report("compliance-summary");
export const lifecycle = report("lifecycle", true);
export const employee360Summary = report("employee-360-summary");
