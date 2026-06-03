import type { Context } from "hono";
import type { AppContext, AuthActor } from "../../types/api.types";
import { ok } from "../../utils/response";
import { REPORT_MESSAGES } from "./reports.constants";
import * as service from "./reports.service";
import { validateGenerateReport, validateReportFilters } from "./reports.validators";

const auth = (c: Context<AppContext>) => c.get("authUser") as AuthActor;
const requestId = (c: Context<AppContext>) => ({ requestId: c.get("requestId") });
const json = async (c: Context<AppContext>) => c.req.json().catch(() => ({}));

export const listReports = (c: Context<AppContext>) => ok(service.listReports(auth(c)), REPORT_MESSAGES.list, requestId(c));
export const catalog = (c: Context<AppContext>) => ok(service.getCatalog(auth(c)), REPORT_MESSAGES.catalog, requestId(c));
export const generate = async (c: Context<AppContext>) => ok(await service.generateReport(c.env, auth(c), validateGenerateReport(await json(c))), REPORT_MESSAGES.generated, requestId(c));
export const dashboardSummary = async (c: Context<AppContext>) => ok(await service.getDashboardSummary(c.env, auth(c)), REPORT_MESSAGES.dashboard, requestId(c));

const report = (key: string, message: string) => async (c: Context<AppContext>) =>
  ok(await service.generateByKey(c.env, auth(c), key, validateReportFilters(c.req.query())), message, requestId(c));

export const getByKey = async (c: Context<AppContext>) =>
  ok(await service.generateByKey(c.env, auth(c), c.req.param("reportKey") ?? "", validateReportFilters(c.req.query())), REPORT_MESSAGES.generated, requestId(c));
export const employeeSummary = report("employee_summary", REPORT_MESSAGES.employee);
export const attendanceSummary = report("attendance_summary", REPORT_MESSAGES.attendance);
export const leaveSummary = report("leave_summary", REPORT_MESSAGES.leave);
export const payrollSummary = report("payroll_summary", REPORT_MESSAGES.payroll);
export const assetSummary = report("asset_summary", REPORT_MESSAGES.assets);
export const documentSummary = report("document_summary", REPORT_MESSAGES.documents);
export const expiringDocuments = report("expiring_documents", REPORT_MESSAGES.expiringDocuments);
export const missingDocuments = report("missing_documents", REPORT_MESSAGES.missingDocuments);
export const auditActivity = report("audit_activity", REPORT_MESSAGES.audit);
export const deviceHealth = report("device_health", REPORT_MESSAGES.deviceHealth);
export const syncStatus = report("sync_status", REPORT_MESSAGES.syncStatus);
