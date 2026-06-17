import type { Context } from "hono";
import type { AppContext, AuthActor } from "../../types/api.types";
import { ok } from "../../utils/response";
import * as service from "./payroll-reports.service";
import { validatePayrollReportFilters } from "./payroll-reports.validators";

const actor = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const request = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const query = (c: Context<AppContext>, periodRequired = false) =>
  validatePayrollReportFilters(c.req.query(), { periodRequired });

export const catalog = async (c: Context<AppContext>) =>
  ok(await service.catalog(c.env, actor(c)), "Payroll report catalog loaded successfully.", request(c));

export const summary = async (c: Context<AppContext>) =>
  ok(await service.summary(c.env, actor(c), query(c)), "Payroll report summary loaded successfully.", request(c));

const report = (reportKey: string, periodRequired = false) => async (c: Context<AppContext>) =>
  ok(
    await service.runReport(c.env, actor(c), reportKey, query(c, periodRequired)),
    "Payroll report loaded successfully.",
    request(c),
  );

export const monthlySummary = report("monthly-summary");
export const employeeDetail = report("employee-detail", true);
export const salaryCompensation = report("salary-compensation");
export const salaryChanges = report("salary-changes", true);
export const deductions = report("deductions", true);
export const advances = report("advances", true);
export const salaryLoans = report("salary-loans");
export const attendanceDeductions = report("attendance-deductions", true);
export const overtime = report("overtime", true);
export const longLeaveDeductions = report("long-leave-deductions", true);
export const leaveDeductions = report("leave-deductions", true);
export const payslipStatus = report("payslip-status", true);
export const approvalFinalization = report("approval-finalization");
export const outletCost = report("outlet-cost", true);
export const departmentCost = report("department-cost", true);
export const variance = report("variance", true);
export const audit = report("audit", true);
export const financeSummary = report("finance-summary", true);
