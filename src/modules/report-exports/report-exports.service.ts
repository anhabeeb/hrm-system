import * as attendanceReports from "../attendance/attendance-reports.service";
import { validateAttendanceReportFilters } from "../attendance/attendance-reports.validators";
import * as employeeService from "../employees/employees.service";
import * as expiryAlertsService from "../expiry-alerts/expiry-alerts.service";
import { validateExpiryAlertFilters } from "../expiry-alerts/expiry-alerts.validators";
import { HR_REPORT_DEFINITIONS } from "../hr-reports/hr-reports.definitions";
import * as hrReports from "../hr-reports/hr-reports.service";
import { validateHrReportFilters } from "../hr-reports/hr-reports.validators";
import { PAYROLL_REPORT_DEFINITIONS } from "../payroll-reports/payroll-reports.definitions";
import * as payrollReports from "../payroll-reports/payroll-reports.service";
import { validatePayrollReportFilters } from "../payroll-reports/payroll-reports.validators";
import { createAuditLog } from "../../services/audit.service";
import * as permissionService from "../../services/permission.service";
import * as settingsService from "../../services/settings.service";
import type { AuthActor, PaginationMeta } from "../../types/api.types";
import { AppError, NotFoundError, PermissionError } from "../../utils/errors";
import { excelContentType, generateExcelWorkbook, generatePdfReport, pdfContentType } from "../../utils/export-file-format";
import { createPrefixedId } from "../../utils/ids";
import * as repository from "./report-exports.repository";
import type {
  ReportExportCatalogItem,
  ReportExportColumn,
  ReportExportCreateInput,
  ReportExportFormat,
  ReportExportJob,
  ReportExportListFilters,
  ReportExportPreviewInput,
  ResolvedReportData,
} from "./report-exports.types";

const MAX_EXPORT_ROWS = 5000;
const supportedDownloadFormats = new Set<ReportExportFormat>(["xlsx", "pdf"]);
const unsafeKeys = new Set([
  "metadata_json",
  "raw_metadata",
  "password_hash",
  "token",
  "device_token",
  "raw_payload",
  "storage_key",
  "file_storage_key",
  "before_json",
  "after_json",
]);

const attendanceCatalog: ReportExportCatalogItem[] = [
  ["daily", "Daily Attendance", "Daily attendance rows with roster, leave, holiday, and source context."],
  ["monthly", "Monthly Attendance", "Monthly attendance summaries by employee."],
  ["employee_detail", "Employee Attendance Detail", "Employee-specific attendance detail rows."],
  ["exceptions", "Attendance Exceptions", "Open and historical attendance exceptions."],
  ["device_punches", "Device Punches", "Biometric/device punch report rows."],
].map(([key, name, description]) => ({
  report_key: `attendance:${key}`,
  name,
  description,
  category: "attendance" as const,
  required_permission: key === "exceptions" ? "attendance.exceptions.view" : key === "device_punches" ? "attendance.device_punches.view" : "attendance.reports.view",
  route: `/api/v1/attendance/reports/${key === "employee_detail" ? "employee/:employeeId" : key.replace("_", "-")}`,
  formats: ["xlsx", "pdf"],
  export_ready: true as const,
  sensitive: false,
  columns: [
    c("attendance_date", "Date", "date"),
    c("employee_code", "Employee Code", "text"),
    c("employee_name", "Employee", "text"),
    c("outlet_name", "Outlet", "text"),
    c("department_name", "Department", "text"),
    c("attendance_status", "Status", "status"),
    c("worked_minutes", "Worked Minutes", "number"),
    c("late_minutes", "Late Minutes", "number"),
    c("overtime_minutes", "Overtime Minutes", "number"),
    c("holiday_name", "Holiday", "text"),
  ],
}));

const expiryCatalog: ReportExportCatalogItem[] = [
  {
    report_key: "expiry:alerts",
    name: "Expiry Alerts List",
    description: "Expiry alert rows for documents, identity dates, contracts, probation, and long leave returns.",
    category: "expiry",
    required_permission: "expiry_alerts.view",
    route: "/api/v1/expiry-alerts",
    formats: ["xlsx", "pdf"],
    export_ready: true,
    sensitive: true,
    columns: [
      c("source_type", "Source", "text"),
      c("source_label", "Source Label", "text"),
      c("employee_code", "Employee Code", "text"),
      c("employee_name", "Employee", "text"),
      c("expiry_date", "Expiry Date", "date"),
      c("days_until_expiry", "Days Until Expiry", "number"),
      c("severity", "Severity", "status"),
      c("status", "Status", "status"),
      c("title", "Title", "text"),
    ],
  },
];

const employeeProfileCatalog: ReportExportCatalogItem[] = [
  {
    report_key: "employee-profile:profile",
    name: "Employee 360 Profile Export",
    description: "Export-friendly Employee 360 profile summary with only sections the actor may view.",
    category: "employee_profile",
    required_permission: "employees.view",
    route: "/api/v1/report-exports/jobs",
    formats: ["xlsx", "pdf"],
    export_ready: true,
    sensitive: true,
    columns: [
      c("section", "Section", "text"),
      c("item", "Item", "text"),
      c("value", "Value", "text"),
    ],
  },
];

function c(key: string, label: string, data_type: string, sensitive = false, required_permission?: string): ReportExportColumn {
  return { key, label, data_type, sensitive, required_permission, default_visible: true };
}

const hrCatalog = (): ReportExportCatalogItem[] => HR_REPORT_DEFINITIONS.map((definition) => ({
  report_key: `hr:${definition.report_key}`,
  name: definition.name,
  description: definition.description,
  category: "hr",
  required_permission: definition.required_permission,
  route: definition.route,
  formats: ["xlsx", "pdf"],
  export_ready: true,
  sensitive: definition.columns.some((column) => ["passport", "work_permit", "national_id", "phone", "email"].some((key) => column.key.includes(key))),
  columns: definition.columns.map((column) => ({
    ...column,
    sensitive: ["passport", "work_permit", "national_id", "phone", "email"].some((key) => column.key.includes(key)),
    required_permission: ["passport", "work_permit", "national_id"].some((key) => column.key.includes(key)) ? "report_exports.sensitive" : undefined,
    default_visible: true,
  })),
}));

const payrollCatalog = (): ReportExportCatalogItem[] => PAYROLL_REPORT_DEFINITIONS.map((definition) => ({
  report_key: `payroll:${definition.report_key}`,
  name: definition.name,
  description: definition.description,
  category: "payroll",
  required_permission: definition.required_permission,
  route: definition.route,
  formats: ["xlsx", "pdf"],
  export_ready: true,
  sensitive: definition.sensitive,
  columns: definition.columns.map((column) => ({
    ...column,
    required_permission: column.sensitive ? "payroll_reports.sensitive_amounts.view" : undefined,
    default_visible: true,
  })),
}));

const allCatalog = () => [...attendanceCatalog, ...hrCatalog(), ...payrollCatalog(), ...expiryCatalog, ...employeeProfileCatalog];

const canExportCatalogItem = (actor: AuthActor, item: ReportExportCatalogItem) =>
  permissionService.hasPermission(actor, "report_exports.catalog.view") &&
  permissionService.hasAnyPermission(actor, [item.required_permission, item.category === "attendance" ? "attendance.reports.view" : item.required_permission]);

const requireExportPermission = (actor: AuthActor, item: ReportExportCatalogItem, action: "preview" | "create" | "generate" | "download") => {
  const actionPermission = action === "preview"
    ? "report_exports.preview"
    : action === "create" || action === "generate"
      ? "report_exports.create"
      : "report_exports.download";
  if (!permissionService.hasPermission(actor, actionPermission)) {
    throw new PermissionError("You do not have permission to export reports.", "REPORT_EXPORT_PERMISSION_DENIED");
  }
  if (!permissionService.hasAnyPermission(actor, [item.required_permission, item.category === "attendance" ? "attendance.reports.view" : item.required_permission])) {
    throw new PermissionError("You do not have permission to export this report.", "REPORT_EXPORT_PERMISSION_DENIED");
  }
};

const canViewSensitiveExport = (actor: AuthActor, column: ReportExportColumn) => {
  if (!column.sensitive) return true;
  const required = column.required_permission ?? "report_exports.sensitive";
  return permissionService.hasPermission(actor, "report_exports.sensitive") && permissionService.hasAnyPermission(actor, [required, "employees.view_sensitive", "documents.view_sensitive"]);
};

const resolveColumns = (columns: ReportExportColumn[], actor: AuthActor) =>
  columns
    .filter((column) => !unsafeKeys.has(column.key))
    .map((column) => canViewSensitiveExport(actor, column) ? column : { ...column, redacted: true });

const sanitizeRows = (rows: Array<Record<string, unknown>>, columns: ReportExportColumn[]) =>
  rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const column of columns) {
      if (column.redacted) {
        next[column.key] = "REDACTED";
      } else if (!unsafeKeys.has(column.key)) {
        next[column.key] = row[column.key] ?? "";
      }
    }
    return next;
  });

const stringifyFilters = (filters: Record<string, unknown>) =>
  JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([key]) => !unsafeKeys.has(key))));

const safeFailure = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : "Export generation failed.";

const parseJobFilters = (job: ReportExportJob) => {
  try {
    return job.filters_json ? JSON.parse(job.filters_json) as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const requireCatalogItem = (reportKey: string) => {
  const item = allCatalog().find((entry) => entry.report_key === reportKey);
  if (!item) throw new AppError("Please choose a valid exportable report.", "REPORT_EXPORT_NOT_FOUND", 404);
  return item;
};

const attendancePayrollDeductionsEnabled = async (env: Env, actor: AuthActor) => {
  const attendanceEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor);
  if (!attendanceEnabled) return false;
  const attendanceSettings = await settingsService.getAttendanceSettings(env, actor.companyId).catch(() => ({})) as Record<string, unknown>;
  const configured =
    attendanceSettings["attendance.payroll_deductions_enabled"] ??
    attendanceSettings.absent_day_deduction_enabled ??
    attendanceSettings.deduct_absent_days;
  return configured !== false;
};

const payrollEnabled = (env: Env, actor: AuthActor) =>
  settingsService.isFeatureEnabled(env, actor.companyId, "payroll", actor);

const payrollSubFeatureEnabled = (env: Env, actor: AuthActor, key: settingsService.PayrollSubFeatureKey) =>
  settingsService.isPayrollSubFeatureEnabled(env, actor.companyId, key);

const requirePayrollEnabled = async (env: Env, actor: AuthActor) => {
  if (!(await payrollEnabled(env, actor))) {
    throw new AppError("Payroll Management is disabled. Enable it in Settings to use this module.", "PAYROLL_MANAGEMENT_DISABLED", 403);
  }
};

const payrollReportEnabledForKey = async (env: Env, actor: AuthActor, reportKey: string) => {
  if (!(await payrollEnabled(env, actor))) return false;
  if (["payroll:monthly-summary", "payroll:employee-detail", "payroll:salary-compensation", "payroll:salary-changes", "payroll:outlet-cost", "payroll:department-cost", "payroll:variance", "payroll:finance-summary"].includes(reportKey)) {
    return payrollSubFeatureEnabled(env, actor, "payroll.salary_processing_enabled");
  }
  if (reportKey === "payroll:deductions") return payrollSubFeatureEnabled(env, actor, "payroll.manual_deductions_enabled");
  if (reportKey === "payroll:advances") return payrollSubFeatureEnabled(env, actor, "payroll.advances_enabled");
  if (reportKey === "payroll:salary-loans") return payrollSubFeatureEnabled(env, actor, "payroll.salary_loans_enabled");
  if (reportKey === "payroll:overtime") return payrollSubFeatureEnabled(env, actor, "payroll.overtime_enabled");
  if (reportKey === "payroll:payslip-status") return payrollSubFeatureEnabled(env, actor, "payroll.payslips_enabled");
  if (reportKey === "payroll:approval-finalization") return payrollSubFeatureEnabled(env, actor, "payroll.approvals_enabled");
  if (reportKey === "payroll:long-leave-deductions") {
    const [longLeaveEnabled, subFeatureEnabled] = await Promise.all([
      settingsService.isFeatureEnabled(env, actor.companyId, "long_leave_management", actor),
      payrollSubFeatureEnabled(env, actor, "payroll.long_leave_deductions_enabled"),
    ]);
    return longLeaveEnabled && subFeatureEnabled;
  }
  if (reportKey === "payroll:attendance-deductions") {
    const [attendanceDeductions, subFeatureEnabled] = await Promise.all([
      attendancePayrollDeductionsEnabled(env, actor),
      payrollSubFeatureEnabled(env, actor, "payroll.attendance_deductions_enabled"),
    ]);
    return attendanceDeductions && subFeatureEnabled;
  }
  return true;
};

const moduleEnabledForCatalogItem = async (env: Env, actor: AuthActor, item: ReportExportCatalogItem) => {
  if (item.category === "payroll" || item.report_key.startsWith("payroll:")) {
    return payrollReportEnabledForKey(env, actor, item.report_key);
  }
  if (item.category === "attendance" || item.report_key.startsWith("attendance:")) {
    return settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor);
  }
  if (item.report_key === "payroll:attendance-deductions") {
    return attendancePayrollDeductionsEnabled(env, actor);
  }
  if (item.report_key === "hr:contracts") {
    return settingsService.isFeatureEnabled(env, actor.companyId, "contract_tracking", actor);
  }
  if (["hr:document-compliance", "hr:foreign-compliance"].includes(item.report_key)) {
    return settingsService.isFeatureEnabled(env, actor.companyId, "documents", actor);
  }
  if (item.report_key === "hr:assets-uniforms") {
    const [assetsEnabled, uniformsEnabled] = await Promise.all([
      settingsService.isFeatureEnabled(env, actor.companyId, "asset_tracking", actor),
      settingsService.isFeatureEnabled(env, actor.companyId, "uniform_tracking", actor),
    ]);
    return assetsEnabled || uniformsEnabled;
  }
  return true;
};

const assertCatalogItemEnabled = async (env: Env, actor: AuthActor, item: ReportExportCatalogItem) => {
  if (await moduleEnabledForCatalogItem(env, actor, item)) return;
  throw new AppError("This report is disabled because its module or sub-feature is disabled.", "REPORT_EXPORT_MODULE_DISABLED", 403);
};

const requireBoundedExport = (reportKey: string, filters: Record<string, unknown>, format: ReportExportFormat): Record<string, unknown> => {
  const hasDate = Boolean(filters.from_date || filters.to_date || filters.date || filters.month || filters.payroll_month || filters.as_of_date || filters.employee_id);
  const historyHeavy = /audit|lifecycle|history|device_punches|exceptions|employee_detail/.test(reportKey);
  if (historyHeavy && !hasDate) {
    throw new AppError("Please add a date range, month, or employee filter before exporting this history-heavy report.", "REPORT_EXPORT_FILTER_REQUIRED", 400);
  }
  const requestedPageSize = Number(filters.page_size ?? 25);
  return { ...filters, page_size: Math.min(Math.max(requestedPageSize, 1), MAX_EXPORT_ROWS), page: Number(filters.page ?? 1) || 1 };
};

const normalizeDataResult = (
  item: ReportExportCatalogItem,
  actor: AuthActor,
  raw: any,
  filters: Record<string, unknown>,
): ResolvedReportData => {
  const rawRows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.rows) ? raw.rows : [];
  const rawColumns = raw?.meta?.columns?.length ? raw.meta.columns : item.columns;
  const columns = resolveColumns(rawColumns.map((column: any) => ({ ...column, default_visible: true })), actor);
  const rows = sanitizeRows(rawRows, columns);
  return {
    report_key: item.report_key,
    report_name: raw?.meta?.report_name ?? item.name,
    category: item.category,
    filters,
    columns,
    rows,
    generated_at: raw?.generated_at ?? new Date().toISOString(),
    sensitive: item.sensitive || columns.some((column) => column.sensitive),
    redaction_level: columns.some((column) => column.redacted) ? "redacted" : "full",
    warnings: columns.some((column) => column.redacted) ? ["Sensitive columns were redacted because your role lacks export-sensitive permission."] : [],
  };
};

const buildDownloadFile = (data: ResolvedReportData, format: ReportExportFormat) => {
  const columns = data.columns.map((column) => ({ key: column.key, label: column.label }));
  const safeName = data.report_key.replace(/[:/]/g, "-");
  if (format === "pdf") {
    const body = generatePdfReport(data.report_name, columns, data.rows);
    return { body, contentType: pdfContentType, fileName: `${safeName}-${data.generated_at.slice(0, 10)}.pdf` };
  }
  const body = generateExcelWorkbook(data.report_name, columns, data.rows);
  return { body, contentType: excelContentType, fileName: `${safeName}-${data.generated_at.slice(0, 10)}.xlsx` };
};

const exportBodySize = (body: string | Uint8Array) => typeof body === "string" ? new TextEncoder().encode(body).length : body.byteLength;

const runReport = async (
  env: Env,
  actor: AuthActor,
  item: ReportExportCatalogItem,
  filtersInput: Record<string, unknown>,
  format: ReportExportFormat,
): Promise<ResolvedReportData> => {
  const filters = requireBoundedExport(item.report_key, filtersInput, format);
  const [namespace, key] = item.report_key.split(":");
  if (namespace === "hr") {
    if (key === "document-compliance" || key === "foreign-compliance") {
      const documentsEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "documents", actor);
      if (!documentsEnabled) {
        throw new AppError("Document Tracking is disabled. Enable it in Settings to use this module.", "DOCUMENT_TRACKING_DISABLED", 403);
      }
    }
    if (key === "contracts") {
      const contractTrackingEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "contract_tracking", actor);
      if (!contractTrackingEnabled) {
        throw new AppError("Contract Tracking is disabled. Enable it in Settings to use this module.", "CONTRACT_TRACKING_DISABLED", 403);
      }
    }
    if (key === "leave-balances" || key === "leave-requests") {
      const leaveEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "leave_management", actor);
      if (!leaveEnabled) {
        throw new AppError("Leave Management is disabled. Enable it in Settings to use this module.", "LEAVE_MANAGEMENT_DISABLED", 403);
      }
    }
    if (key === "long-leave") {
      const longLeaveEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "long_leave_management", actor);
      if (!longLeaveEnabled) {
        throw new AppError("Long Leave Management is disabled. Enable it in Settings to use this module.", "LONG_LEAVE_MANAGEMENT_DISABLED", 403);
      }
    }
    if (key === "assets-uniforms") {
      const [assetsEnabled, uniformsEnabled] = await Promise.all([
        settingsService.isFeatureEnabled(env, actor.companyId, "asset_tracking", actor),
        settingsService.isFeatureEnabled(env, actor.companyId, "uniform_tracking", actor),
      ]);
      if (!assetsEnabled && !uniformsEnabled) {
        throw new AppError("Asset Tracking or Uniform Tracking must be enabled before exporting this report.", "ASSETS_UNIFORMS_REPORT_DISABLED", 403);
      }
    }
    const validated = validateHrReportFilters(filters, { historyRequired: /leave-requests|long-leave|lifecycle/.test(key) });
    return normalizeDataResult(item, actor, await hrReports.runReport(env, actor, key, validated), { ...validated });
  }
  if (namespace === "payroll") {
    await requirePayrollEnabled(env, actor);
    if (["monthly-summary", "employee-detail", "salary-compensation", "salary-changes", "outlet-cost", "department-cost", "variance", "finance-summary"].includes(key)) {
      if (!(await payrollSubFeatureEnabled(env, actor, "payroll.salary_processing_enabled"))) {
        throw new AppError("Salary Processing is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_SALARY_PROCESSING_DISABLED", 403);
      }
    }
    if (key === "deductions" && !(await payrollSubFeatureEnabled(env, actor, "payroll.manual_deductions_enabled"))) {
      throw new AppError("Manual Deductions are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_MANUAL_DEDUCTIONS_DISABLED", 403);
    }
    if (key === "attendance-deductions") {
      if (!(await payrollSubFeatureEnabled(env, actor, "payroll.attendance_deductions_enabled"))) {
        throw new AppError("Attendance Payroll Deductions are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_ATTENDANCE_DEDUCTIONS_DISABLED", 403);
      }
      if (!(await attendancePayrollDeductionsEnabled(env, actor))) {
        throw new AppError("Attendance Payroll Deductions are disabled. Enable them in Attendance Settings to use this report.", "ATTENDANCE_PAYROLL_DEDUCTIONS_DISABLED", 403);
      }
    }
    if (key === "overtime") {
      if (!(await payrollSubFeatureEnabled(env, actor, "payroll.overtime_enabled"))) {
        throw new AppError("Overtime is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_OVERTIME_DISABLED", 403);
      }
    }
    if (key === "advances" && !(await payrollSubFeatureEnabled(env, actor, "payroll.advances_enabled"))) {
      throw new AppError("Advance Salary is disabled. Enable it in Payroll Settings to use this report.", "PAYROLL_ADVANCES_DISABLED", 403);
    }
    if (key === "salary-loans" && !(await payrollSubFeatureEnabled(env, actor, "payroll.salary_loans_enabled"))) {
      throw new AppError("Salary Loans are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_SALARY_LOANS_DISABLED", 403);
    }
    if (key === "leave-deductions") {
      const leaveEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "leave_management", actor);
      if (!leaveEnabled) {
        throw new AppError("Leave Management is disabled. Enable it in Settings to use this module.", "LEAVE_MANAGEMENT_DISABLED", 403);
      }
    }
    if (key === "long-leave-deductions") {
      if (!(await payrollSubFeatureEnabled(env, actor, "payroll.long_leave_deductions_enabled"))) {
        throw new AppError("Long Leave Deductions are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_LONG_LEAVE_DEDUCTIONS_DISABLED", 403);
      }
      const longLeaveEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "long_leave_management", actor);
      if (!longLeaveEnabled) {
        throw new AppError("Long Leave Management is disabled. Enable it in Settings to use this module.", "LONG_LEAVE_MANAGEMENT_DISABLED", 403);
      }
    }
    if (key === "payslip-status" && !(await payrollSubFeatureEnabled(env, actor, "payroll.payslips_enabled"))) {
      throw new AppError("Payslips are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_PAYSLIPS_DISABLED", 403);
    }
    if (key === "approval-finalization" && !(await payrollSubFeatureEnabled(env, actor, "payroll.approvals_enabled"))) {
      throw new AppError("Payroll Approvals are disabled. Enable them in Payroll Settings to use this report.", "PAYROLL_APPROVALS_DISABLED", 403);
    }
    const validated = validatePayrollReportFilters(filters, { periodRequired: /audit|variance|approval-finalization|employee-detail/.test(key) });
    return normalizeDataResult(item, actor, await payrollReports.runReport(env, actor, key, validated), { ...validated });
  }
  if (namespace === "attendance") {
    const attendanceEnabled = await settingsService.isFeatureEnabled(env, actor.companyId, "attendance", actor);
    if (!attendanceEnabled) {
      throw new AppError("Attendance Management is disabled. Enable it in Settings to use this module.", "ATTENDANCE_MANAGEMENT_DISABLED", 403);
    }
    const reportKind = key as any;
    const queryInput = Object.fromEntries(Object.entries(filters).map(([filterKey, value]) => [filterKey, value === undefined || value === null ? undefined : String(value)])) as Record<string, string | undefined>;
    const validated = validateAttendanceReportFilters(queryInput, reportKind);
    const raw = reportKind === "monthly"
      ? await attendanceReports.monthlyReport(env, actor, validated)
      : reportKind === "employee_detail"
        ? await attendanceReports.employeeReport(env, actor, String(validated.employee_id), validated)
        : reportKind === "exceptions"
          ? await attendanceReports.exceptionsReport(env, actor, validated)
          : reportKind === "device_punches"
            ? await attendanceReports.devicePunchesReport(env, actor, validated)
            : await attendanceReports.dailyReport(env, actor, validated);
    return normalizeDataResult(item, actor, raw, { ...validated });
  }
  if (namespace === "expiry") {
    const validated = validateExpiryAlertFilters(filters);
    const raw = await expiryAlertsService.listAlerts(env, actor, validated);
    return normalizeDataResult(item, actor, { data: raw.rows, pagination: raw.pagination, generated_at: new Date().toISOString() }, { ...validated });
  }
  if (namespace === "employee-profile") {
    const employeeId = String(filters.employee_id ?? "");
    if (!employeeId) throw new AppError("Choose an employee before exporting an Employee 360 profile.", "REPORT_EXPORT_FILTER_REQUIRED", 400);
    const profile = await employeeService.getEmployeeProfile(env, actor, employeeId, 25);
    const rows = flattenEmployeeProfile(profile);
    return normalizeDataResult(item, actor, { data: rows, generated_at: profile.meta.generated_at }, filters);
  }
  throw new AppError("This report is not available for export yet.", "REPORT_EXPORT_NOT_FOUND", 404);
};

const flattenEmployeeProfile = (profile: any) => {
  const rows: Array<Record<string, unknown>> = [];
  const push = (section: string, item: string, value: unknown) => rows.push({ section, item, value: typeof value === "object" ? JSON.stringify(value) : value });
  const employee = profile?.summary?.employee ?? {};
  for (const key of ["employee_code", "full_name", "employment_status", "employee_type", "primary_outlet_name", "department_name", "position_title"]) {
    push("Overview", key, employee[key]);
  }
  for (const [section, value] of Object.entries(profile ?? {})) {
    if (["summary", "meta"].includes(section)) continue;
    if (!value) continue;
    push(section, "summary", value);
  }
  return rows;
};

export const getExportCatalog = async (env: Env, actor: AuthActor) => {
  const items = await Promise.all(
    allCatalog().map(async (item) => ({
      item,
      enabled: await moduleEnabledForCatalogItem(env, actor, item),
    })),
  );
  return {
    data: items.filter(({ item, enabled }) => enabled && canExportCatalogItem(actor, item)).map(({ item }) => item),
    generated_at: new Date().toISOString(),
  };
};

export const previewExport = async (env: Env, actor: AuthActor, input: ReportExportPreviewInput) => {
  const item = requireCatalogItem(input.report_key);
  requireExportPermission(actor, item, "preview");
  await assertCatalogItemEnabled(env, actor, item);
  if (input.format && !item.formats.includes(input.format)) {
    throw new AppError("This export format is not supported for the selected report.", "REPORT_EXPORT_FORMAT_UNSUPPORTED", 400);
  }
  if (input.format && !supportedDownloadFormats.has(input.format)) {
    throw new AppError("Only Excel and PDF report exports are supported.", "REPORT_EXPORT_FORMAT_UNSUPPORTED", 400);
  }
  const data = await runReport(env, actor, item, input.filters ?? {}, input.format ?? "xlsx");
  const maxRows = MAX_EXPORT_ROWS;
  if (data.rows.length > maxRows) throw new AppError("This export is too large. Please narrow your filters.", "REPORT_EXPORT_TOO_LARGE", 400);
  const sensitiveColumns = data.columns.filter((column) => column.sensitive || column.redacted);
  if (sensitiveColumns.length > 0) {
    await auditExport(env, actor, "report_export_sensitive_preview", item, { row_count: data.rows.length, redaction_level: data.redaction_level });
  }
  return {
    report_key: data.report_key,
    format: input.format ?? "xlsx",
    row_count: data.rows.length,
    columns: data.columns,
    redaction: { level: data.redaction_level, redacted_columns: data.columns.filter((column) => column.redacted).map((column) => column.key) },
    sample_rows: data.rows.slice(0, 5),
    warnings: data.warnings,
    generated_at: data.generated_at,
  };
};

export const createExportJob = async (env: Env, actor: AuthActor, input: ReportExportCreateInput) => {
  const item = requireCatalogItem(input.report_key);
  requireExportPermission(actor, item, "create");
  await assertCatalogItemEnabled(env, actor, item);
  if (!supportedDownloadFormats.has(input.format)) {
    throw new AppError("Only Excel and PDF report exports are supported.", "REPORT_EXPORT_FORMAT_UNSUPPORTED", 400);
  }
  const filters = requireBoundedExport(item.report_key, input.filters ?? {}, input.format);
  const idempotencyKey = input.idempotency_key ?? `${actor.actorUserId}:${item.report_key}:${input.format}:${stringifyFilters(filters)}`;
  const existing = await repository.findByIdempotency(env, actor.companyId, idempotencyKey);
  if (existing) return { export_job: safeJob(existing), duplicate: true };
  const now = new Date().toISOString();
  const job: ReportExportJob = {
    id: createPrefixedId("report_export"),
    company_id: actor.companyId,
    report_key: item.report_key,
    report_category: item.category,
    format: input.format,
    status: "pending",
    requested_by: actor.actorUserId,
    requested_at: now,
    started_at: null,
    completed_at: null,
    failed_at: null,
    failure_code: null,
    failure_message: null,
    filters_json: stringifyFilters(filters),
    columns_json: JSON.stringify(resolveColumns(item.columns, actor)),
    row_count: null,
    file_name: null,
    file_size: null,
    file_storage_key: null,
    download_url: null,
    expires_at: null,
    sensitive_export: item.sensitive ? 1 : 0,
    redaction_level: "pending",
    idempotency_key: idempotencyKey,
    metadata_json: JSON.stringify({ storage_mode: "generated_file", worker_safe: true }),
    created_at: now,
    updated_at: now,
  };
  await repository.insertJob(env, job);
  await auditExport(env, actor, "report_export_job_created", item, { export_job_id: job.id, format: input.format });
  return { export_job: safeJob(job), duplicate: false };
};

export const generateExport = async (env: Env, actor: AuthActor, jobId: string) => {
  const job = await requireJob(env, actor, jobId, "generate");
  if (job.status === "completed") return { export_job: safeJob(job), already_completed: true };
  if (!["pending", "failed"].includes(job.status)) {
    throw new AppError("This export job cannot be generated from its current status.", "REPORT_EXPORT_INVALID_STATUS", 409);
  }
  const now = new Date().toISOString();
  const claimed = await repository.claimProcessing(env, actor.companyId, job.id, now);
  if (!claimed) {
    throw new AppError("This export job is already being processed or is no longer eligible for generation.", "REPORT_EXPORT_INVALID_STATUS", 409);
  }
  try {
    const item = requireCatalogItem(job.report_key);
    const data = await runReport(env, actor, item, parseJobFilters(job), job.format as ReportExportFormat);
    const file = buildDownloadFile(data, job.format as ReportExportFormat);
    const completed = await repository.markCompleted(env, actor.companyId, job.id, {
      rowCount: data.rows.length,
      fileName: file.fileName,
      fileSize: exportBodySize(file.body),
      columnsJson: JSON.stringify(data.columns),
      completedAt: now,
    });
    if (!completed) {
      throw new AppError("This export job could not be completed because its status changed.", "REPORT_EXPORT_INVALID_STATUS", 409);
    }
    await auditExport(env, actor, "report_export_generated", item, { export_job_id: job.id, row_count: data.rows.length, sensitive_export: data.sensitive });
    return { export_job: safeJob(await repository.getJob(env, actor.companyId, job.id) ?? job), file, data };
  } catch (error) {
    await repository.markFailed(env, actor.companyId, job.id, { code: "REPORT_EXPORT_GENERATION_FAILED", message: safeFailure(error), failedAt: now });
    await auditExport(env, actor, "report_export_failed", requireCatalogItem(job.report_key), { export_job_id: job.id, failure: safeFailure(error) });
    throw error;
  }
};

export const downloadExport = async (env: Env, actor: AuthActor, jobId: string) => {
  const job = await requireJob(env, actor, jobId, "download");
  if (job.status !== "completed") {
    throw new AppError("Please generate this export before downloading it.", "REPORT_EXPORT_INVALID_STATUS", 409);
  }
  const item = requireCatalogItem(job.report_key);
  const data = await runReport(env, actor, item, parseJobFilters(job), job.format as ReportExportFormat);
  const file = buildDownloadFile(data, job.format as ReportExportFormat);
  await auditExport(env, actor, "report_export_downloaded", item, { export_job_id: jobId, row_count: data.rows.length });
  return { export_job: safeJob(job), file, data, regenerated: true };
};

export const getExportJob = async (env: Env, actor: AuthActor, id: string) => ({
  export_job: safeJob(await requireJob(env, actor, id, "view")),
});

export const listExportJobs = async (env: Env, actor: AuthActor, filters: ReportExportListFilters) => {
  const admin = permissionService.hasPermission(actor, "report_exports.admin.manage");
  if (!permissionService.hasAnyPermission(actor, ["report_exports.history.view", "report_exports.admin.manage"])) {
    throw new PermissionError("You do not have permission to view export history.", "REPORT_EXPORT_PERMISSION_DENIED");
  }
  const [total, rows] = await Promise.all([
    repository.countJobs(env, actor.companyId, filters, admin, actor.actorUserId),
    repository.listJobs(env, actor.companyId, filters, admin, actor.actorUserId),
  ]);
  const pagination: PaginationMeta = {
    page: filters.page,
    page_size: filters.page_size,
    total,
    total_pages: total === 0 ? 0 : Math.ceil(total / filters.page_size),
  };
  return { data: rows.map(safeJob), filters, pagination, generated_at: new Date().toISOString() };
};

export const cancelExportJob = async (env: Env, actor: AuthActor, id: string) => {
  const job = await requireJob(env, actor, id, "cancel");
  if (!["pending", "processing"].includes(job.status)) {
    throw new AppError("Only pending or processing export jobs can be cancelled.", "REPORT_EXPORT_INVALID_STATUS", 409);
  }
  const cancelled = await repository.cancelJob(env, actor.companyId, job.id, new Date().toISOString());
  if (!cancelled) {
    throw new AppError("This export job could not be cancelled because its status changed.", "REPORT_EXPORT_INVALID_STATUS", 409);
  }
  return getExportJob(env, actor, id);
};

type JobAction = "view" | "generate" | "download" | "cancel";

const requireJob = async (env: Env, actor: AuthActor, id: string, action: JobAction) => {
  const job = await repository.getJob(env, actor.companyId, id);
  if (!job) throw new NotFoundError("Export job could not be found.");
  const isAdmin = permissionService.hasPermission(actor, "report_exports.admin.manage");
  const isOwner = job.requested_by === actor.actorUserId;
  if (!isOwner && !isAdmin) {
    throw new PermissionError("You do not have permission to access this export job.", "REPORT_EXPORT_PERMISSION_DENIED");
  }
  if (action === "view" && !permissionService.hasAnyPermission(actor, ["report_exports.history.view", "report_exports.admin.manage"])) {
    throw new PermissionError("You do not have permission to view export history.", "REPORT_EXPORT_PERMISSION_DENIED");
  }
  if (action === "generate") {
    requireExportPermission(actor, requireCatalogItem(job.report_key), "generate");
  }
  if (action === "download") {
    requireExportPermission(actor, requireCatalogItem(job.report_key), "download");
  }
  if (action === "cancel" && !permissionService.hasAnyPermission(actor, ["report_exports.cancel", "report_exports.admin.manage"])) {
    throw new PermissionError("You do not have permission to cancel export jobs.", "REPORT_EXPORT_PERMISSION_DENIED");
  }
  return job;
};

const safeJob = (job: ReportExportJob) => ({
  id: job.id,
  report_key: job.report_key,
  report_category: job.report_category,
  format: job.format,
  status: job.status,
  requested_by: job.requested_by,
  requested_at: job.requested_at,
  started_at: job.started_at,
  completed_at: job.completed_at,
  failed_at: job.failed_at,
  failure_code: job.failure_code,
  failure_message: job.failure_message,
  row_count: job.row_count,
  file_name: job.file_name,
  file_size: job.file_size,
  expires_at: job.expires_at,
  sensitive_export: job.sensitive_export === 1,
  redaction_level: job.redaction_level,
});

const auditExport = (env: Env, actor: AuthActor, action: string, item: ReportExportCatalogItem, details: Record<string, unknown>) =>
  createAuditLog(env, {
    companyId: actor.companyId,
    module: "report_exports",
    action,
    entityType: "report_export",
    entityId: String(details.export_job_id ?? item.report_key),
    actorId: actor.actorUserId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    details: {
      report_key: item.report_key,
      report_category: item.category,
      sensitive_export: item.sensitive,
      ...details,
    },
    requestId: actor.requestId,
  });
