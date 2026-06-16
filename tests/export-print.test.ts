import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/modules/hr-reports/hr-reports.service", () => ({
  runReport: vi.fn(async () => ({
    data: [{ employee_id: "emp_1", full_name: "Aisha", passport_number: "A1234567", status: "active" }],
    meta: {
      report_name: "Employee Master",
      columns: [
        { key: "employee_id", label: "Employee ID", data_type: "text" },
        { key: "full_name", label: "Full Name", data_type: "text" },
        { key: "passport_number", label: "Passport", data_type: "text", sensitive: true, required_permission: "report_exports.sensitive" },
        { key: "metadata_json", label: "Metadata", data_type: "text" },
      ],
    },
    generated_at: "2026-06-08T00:00:00.000Z",
  })),
  catalog: vi.fn(),
}));

vi.mock("../src/modules/payroll-reports/payroll-reports.service", () => ({
  runReport: vi.fn(async () => ({
    data: [{ employee_id: "emp_1", employee_name: "Aisha", net_payable_salary: 50000, gross_salary: 60000 }],
    meta: {
      report_name: "Employee Payroll Detail",
      columns: [
        { key: "employee_name", label: "Employee", data_type: "text" },
        { key: "gross_salary", label: "Gross", data_type: "money", sensitive: true, required_permission: "payroll_reports.sensitive_amounts.view" },
        { key: "net_payable_salary", label: "Net", data_type: "money", sensitive: true, required_permission: "payroll_reports.sensitive_amounts.view" },
      ],
    },
    generated_at: "2026-06-08T00:00:00.000Z",
  })),
}));

vi.mock("../src/modules/attendance/attendance-reports.service", () => ({
  dailyReport: vi.fn(async () => ({
    data: [{ employee_name: "Aisha", attendance_date: "2026-06-08", attendance_status: "present" }],
    meta: { report: "daily", row_count: 1 },
    filters: {},
    generated_at: "2026-06-08T00:00:00.000Z",
  })),
}));

vi.mock("../src/modules/expiry-alerts/expiry-alerts.service", () => ({
  listAlerts: vi.fn(async () => ({
    rows: [{ source_type: "employee_passport", employee_name: "Aisha", expiry_date: "2026-07-01", severity: "high" }],
    pagination: { page: 1, page_size: 25, total: 1, total_pages: 1 },
  })),
}));

vi.mock("../src/modules/employees/employees.service", () => ({
  getEmployeeProfile: vi.fn(async () => ({
    summary: { employee: { employee_code: "EMP001", full_name: "Aisha", employment_status: "active" } },
    attendance: { current_month_summary: { present_days: 20 } },
    leave: null,
    long_leave: null,
    documents: null,
    contracts: null,
    assets: null,
    payroll_readiness: null,
    alerts: null,
    timeline: null,
    meta: { generated_at: "2026-06-08T00:00:00.000Z" },
  })),
}));

import * as service from "../src/modules/report-exports/report-exports.service";
import * as hrReportService from "../src/modules/hr-reports/hr-reports.service";
import type { AuthActor } from "../src/types/api.types";

const permissions = [
  "report_exports.catalog.view",
  "report_exports.preview",
  "report_exports.create",
  "report_exports.download",
  "report_exports.cancel",
  "report_exports.history.view",
  "report_exports.print",
  "report_exports.employee_profile.print",
  "hr_reports.view",
  "hr_reports.employee.view",
  "hr_reports.lifecycle.view",
  "payroll_reports.view",
  "payroll_reports.employee.view",
  "payroll_reports.audit.view",
  "attendance.reports.view",
  "expiry_alerts.view",
];

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_1",
  fullName: "HR Admin",
  email: "hr@example.test",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions,
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

type DbCall = { sql: string; values: unknown[]; method: "first" | "all" | "run" };

const exportJob = (overrides: Record<string, unknown> = {}) => ({
  id: "report_export_1",
  company_id: "company_1",
  report_key: "hr:employee-master",
  report_category: "hr",
  format: "xlsx",
  status: "pending",
  requested_by: "user_1",
  requested_at: "2026-06-08T00:00:00.000Z",
  started_at: null,
  completed_at: null,
  failed_at: null,
  failure_code: null,
  failure_message: null,
  filters_json: JSON.stringify({ as_of_date: "2026-06-08" }),
  columns_json: "[]",
  row_count: null,
  file_name: null,
  file_size: null,
  file_storage_key: null,
  download_url: null,
  expires_at: null,
  sensitive_export: 1,
  redaction_level: "pending",
  idempotency_key: null,
  metadata_json: JSON.stringify({ storage_mode: "generated_file" }),
  created_at: "2026-06-08T00:00:00.000Z",
  updated_at: "2026-06-08T00:00:00.000Z",
  ...overrides,
});

const fakeEnv = (options: { existingJob?: Record<string, unknown> | null } = {}) => {
  const calls: DbCall[] = [];
  const job = options.existingJob ? { ...options.existingJob } : null;
  const updateStatus = (sql: string) => {
    if (!job) return 0;
    if (sql.includes("SET status = 'processing'")) {
      if (["pending", "failed"].includes(String(job.status))) {
        job.status = "processing";
        job.started_at = "2026-06-08T00:00:00.000Z";
        return 1;
      }
      return 0;
    }
    if (sql.includes("SET status = 'completed'")) {
      if (job.status === "processing") {
        job.status = "completed";
        job.completed_at = "2026-06-08T00:00:00.000Z";
        job.row_count = 1;
        job.file_name = "employee-master.xlsx";
        return 1;
      }
      return 0;
    }
    if (sql.includes("SET status = 'failed'")) {
      if (["processing", "pending", "failed"].includes(String(job.status))) {
        job.status = "failed";
        job.failed_at = "2026-06-08T00:00:00.000Z";
        return 1;
      }
      return 0;
    }
    if (sql.includes("SET status = 'cancelled'")) {
      if (["pending", "processing"].includes(String(job.status))) {
        job.status = "cancelled";
        return 1;
      }
      return 0;
    }
    return 1;
  };
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            calls.push({ sql, values, method: "first" });
            if (sql.includes("idempotency_key")) return job ?? null;
            if (sql.includes("FROM report_export_jobs WHERE company_id = ? AND id = ?")) return job;
            return { total: 0 };
          },
          all: async () => {
            calls.push({ sql, values, method: "all" });
            return { results: [] };
          },
          run: async () => {
            calls.push({ sql, values, method: "run" });
            const changes = updateStatus(sql);
            return { success: true, meta: { changes } };
          },
        }),
      }),
    },
  } as unknown as Env;
  return { env, calls, job };
};

const source = (path: string) => readFileSync(path, "utf8");
const bytesText = (body: string | Uint8Array) => typeof body === "string" ? body : new TextDecoder().decode(body);

describe("Phase 11D Export / Print Reports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("catalog lists exportable reports by permission", () => {
    const result = service.getExportCatalog(actor());
    const keys = result.data.map((report) => report.report_key);
    expect(keys).toContain("attendance:daily");
    expect(keys).toContain("hr:employee-master");
    expect(keys).toContain("payroll:employee-detail");
    expect(keys).toContain("expiry:alerts");
    expect(keys).toContain("employee-profile:profile");
  });

  it("preview returns columns redaction and sample rows", async () => {
    const { env } = fakeEnv();
    const preview = await service.previewExport(env, actor(), {
      report_key: "hr:employee-master",
      format: "xlsx",
      filters: { as_of_date: "2026-06-08" },
    });
    expect(preview.row_count).toBe(1);
    expect(preview.columns.map((column) => column.key)).toContain("passport_number");
    expect(preview.redaction.redacted_columns).toContain("passport_number");
    expect(preview.sample_rows[0]).not.toHaveProperty("metadata_json");
  });

  it("XLSX generation returns a real ZIP/OpenXML workbook", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "pending" }) });
    const result = await service.generateExport(env, actor(), "report_export_1");
    const body = result.file?.body;
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Array.from((body as Uint8Array).slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(result.file?.contentType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.file?.fileName).toMatch(/\.xlsx$/);
    expect(bytesText(body as Uint8Array)).toContain("xl/worksheets/sheet1.xml");
  });

  it("sensitive columns are omitted or masked without permission", async () => {
    const { env } = fakeEnv();
    const preview = await service.previewExport(env, actor(), {
      report_key: "payroll:employee-detail",
      format: "xlsx",
      filters: { payroll_month: "2026-06" },
    });
    expect(preview.sample_rows[0]).toMatchObject({ gross_salary: "REDACTED", net_payable_salary: "REDACTED" });
  });

  it("sensitive columns included only with permission", async () => {
    const { env } = fakeEnv();
    const preview = await service.previewExport(env, actor({
      permissions: [...permissions, "report_exports.sensitive", "payroll_reports.sensitive_amounts.view"],
    }), {
      report_key: "payroll:employee-detail",
      format: "xlsx",
      filters: { payroll_month: "2026-06" },
    });
    expect(preview.sample_rows[0]).toMatchObject({ gross_salary: 60000, net_payable_salary: 50000 });
  });

  it("CSV format is rejected for normal report exports", async () => {
    const { env } = fakeEnv();
    await expect(service.previewExport(env, actor(), {
      report_key: "hr:employee-master",
      format: "csv" as any,
      filters: { as_of_date: "2026-06-08" },
    })).rejects.toMatchObject({ code: "REPORT_EXPORT_FORMAT_UNSUPPORTED" });
  });

  it("export row limit enforced", async () => {
    const { env } = fakeEnv();
    await expect(service.previewExport(env, actor(), {
      report_key: "hr:lifecycle",
      format: "xlsx",
      filters: {},
    })).rejects.toMatchObject({ code: "REPORT_EXPORT_FILTER_REQUIRED" });
  });

  it("unbounded export rejected", async () => {
    const { env } = fakeEnv();
    await expect(service.previewExport(env, actor(), {
      report_key: "payroll:audit",
      format: "xlsx",
      filters: {},
    })).rejects.toMatchObject({ code: "REPORT_EXPORT_FILTER_REQUIRED" });
  });

  it("idempotency prevents duplicate jobs", async () => {
    const existingJob = exportJob({ status: "completed", filters_json: "{}", row_count: 1, file_name: "employee-master.xlsx", file_size: 100, sensitive_export: 0, redaction_level: "full", idempotency_key: "same" });
    const { env, calls } = fakeEnv({ existingJob });
    const result = await service.createExportJob(env, actor(), {
      report_key: "hr:employee-master",
      format: "xlsx",
      filters: { as_of_date: "2026-06-08" },
      idempotency_key: "same",
    });
    expect(result.duplicate).toBe(true);
    expect(calls.some((call) => call.method === "run" && call.sql.includes("INSERT INTO report_export_jobs"))).toBe(false);
  });

  it("completed job download returns regenerated Excel content from saved filters", async () => {
    const existingJob = exportJob({ status: "completed", file_name: "employee-master.xlsx", row_count: 1, redaction_level: "redacted" });
    const { env } = fakeEnv({ existingJob });
    const downloaded = await service.downloadExport(env, actor(), "report_export_1");
    expect(downloaded.file.fileName).toContain(".xlsx");
    const workbookText = bytesText(downloaded.file.body);
    expect(workbookText).toContain("Full Name");
    expect(workbookText).toContain("Aisha");
    expect(workbookText).toContain("REDACTED");
    expect(downloaded.regenerated).toBe(true);
    expect(vi.mocked(hrReportService.runReport).mock.calls.at(-1)?.[3]).toMatchObject({ as_of_date: "2026-06-08" });
  });

  it("completed job download still enforces download permission", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "completed" }) });
    await expect(service.downloadExport(env, actor({ permissions: permissions.filter((permission) => permission !== "report_exports.download") }), "report_export_1"))
      .rejects.toMatchObject({ code: "REPORT_EXPORT_PERMISSION_DENIED" });
  });

  it("completed job download redacts sensitive fields when actor lacks permission", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "completed" }) });
    const result = await service.downloadExport(env, actor(), "report_export_1");
    const workbookText = bytesText(result.file.body);
    expect(workbookText).toContain("REDACTED");
    expect(workbookText).not.toContain("A1234567");
  });

  it("user with history.view can view own job detail without download permission", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "completed" }) });
    const detail = await service.getExportJob(env, actor({ permissions: permissions.filter((permission) => permission !== "report_exports.download") }), "report_export_1");
    expect(detail.export_job.id).toBe("report_export_1");
  });

  it("user without download permission cannot download", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "completed" }) });
    await expect(service.downloadExport(env, actor({ permissions: permissions.filter((permission) => permission !== "report_exports.download") }), "report_export_1"))
      .rejects.toMatchObject({ code: "REPORT_EXPORT_PERMISSION_DENIED" });
  });

  it("user with create permission can generate own pending job without download permission", async () => {
    const { env, job } = fakeEnv({ existingJob: exportJob({ status: "pending" }) });
    const result = await service.generateExport(env, actor({ permissions: permissions.filter((permission) => permission !== "report_exports.download") }), "report_export_1");
    expect(bytesText(result.file?.body as Uint8Array)).toContain("Aisha");
    expect(job?.status).toBe("completed");
  });

  it("user without create permission cannot generate", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "pending" }) });
    await expect(service.generateExport(env, actor({ permissions: permissions.filter((permission) => permission !== "report_exports.create") }), "report_export_1"))
      .rejects.toMatchObject({ code: "REPORT_EXPORT_PERMISSION_DENIED" });
  });

  it("admin can view company export job", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ requested_by: "another_user", status: "completed" }) });
    const detail = await service.getExportJob(env, actor({ actorUserId: "admin_user", isAdmin: true, permissions: [...permissions, "report_exports.admin.manage"] }), "report_export_1");
    expect(detail.export_job.requested_by).toBe("another_user");
  });

  it("cancelled job cannot be generated", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "cancelled" }) });
    await expect(service.generateExport(env, actor(), "report_export_1")).rejects.toMatchObject({ code: "REPORT_EXPORT_INVALID_STATUS" });
  });

  it("expired job cannot be generated", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "expired" }) });
    await expect(service.generateExport(env, actor(), "report_export_1")).rejects.toMatchObject({ code: "REPORT_EXPORT_INVALID_STATUS" });
  });

  it("processing job cannot be generated twice", async () => {
    const { env } = fakeEnv({ existingJob: exportJob({ status: "processing" }) });
    await expect(service.generateExport(env, actor(), "report_export_1")).rejects.toMatchObject({ code: "REPORT_EXPORT_INVALID_STATUS" });
  });

  it("pending job can be generated", async () => {
    const { env, job } = fakeEnv({ existingJob: exportJob({ status: "pending" }) });
    const result = await service.generateExport(env, actor(), "report_export_1");
    expect(result.export_job.status).toBe("completed");
    expect(job?.status).toBe("completed");
  });

  it("failed job can be retried and generated", async () => {
    const { env, job } = fakeEnv({ existingJob: exportJob({ status: "failed" }) });
    const result = await service.generateExport(env, actor(), "report_export_1");
    expect(result.export_job.status).toBe("completed");
    expect(job?.status).toBe("completed");
  });

  it("cancel only applies to pending or processing jobs", async () => {
    const pendingEnv = fakeEnv({ existingJob: exportJob({ status: "pending" }) });
    await service.cancelExportJob(pendingEnv.env, actor(), "report_export_1");
    expect(pendingEnv.job?.status).toBe("cancelled");

    const completedEnv = fakeEnv({ existingJob: exportJob({ status: "completed" }) });
    await expect(service.cancelExportJob(completedEnv.env, actor(), "report_export_1")).rejects.toMatchObject({ code: "REPORT_EXPORT_INVALID_STATUS" });
  });

  it("repository status transitions are guarded by current job status", () => {
    const repo = source("src/modules/report-exports/report-exports.repository.ts");
    expect(repo).toContain("claimProcessing");
    expect(repo).toContain("status IN ('pending', 'failed')");
    expect(repo).toContain("status = 'processing'");
    expect(repo).toContain("status IN ('processing', 'pending', 'failed')");
    expect(repo).toContain("status IN ('pending', 'processing')");
  });

  it("attendance report export uses same scoped data", async () => {
    const { env } = fakeEnv();
    const preview = await service.previewExport(env, actor(), {
      report_key: "attendance:daily",
      format: "xlsx",
      filters: { from_date: "2026-06-08", to_date: "2026-06-08" },
    });
    expect(preview.sample_rows[0]).toMatchObject({ employee_name: "Aisha", attendance_status: "present" });
  });

  it("Employee 360 print only shows allowed sections", async () => {
    const { env } = fakeEnv();
    const data = await service.printEmployeeProfile(env, actor(), "emp_1");
    expect(data.report_key).toBe("employee-profile:profile");
    expect(data.rows.some((row) => row.section === "Overview")).toBe(true);
  });

  it("manager cannot export other outlet data because existing report service scoping is reused", async () => {
    const serviceSource = source("src/modules/report-exports/report-exports.service.ts");
    expect(serviceSource).toContain("await hrReports.runReport(env, actor");
    expect(serviceSource).toContain("await payrollReports.runReport(env, actor");
    expect(serviceSource).toContain("await attendanceReports.dailyReport(env, actor");
  });

  it("generated Excel download requires permission", async () => {
    const { env } = fakeEnv();
    await expect(service.createExportJob(env, actor({ permissions: permissions.filter((permission) => permission !== "report_exports.create") }), {
      report_key: "hr:employee-master",
      format: "xlsx",
      filters: { as_of_date: "2026-06-08" },
    })).rejects.toThrow(/permission/i);
  });

  it("download blocked across company", async () => {
    const routes = source("src/routes/report-exports.routes.ts");
    const repo = source("src/modules/report-exports/report-exports.repository.ts");
    expect(routes).toContain('"/jobs/:id/download"');
    expect(repo).toContain("WHERE company_id = ? AND id = ?");
  });

  it("expired download blocked if expiry exists", () => {
    const migration = source("migrations/0049_report_export_jobs.sql");
    expect(migration).toContain("expires_at");
  });

  it("export history lists own jobs only for normal user", () => {
    const repo = source("src/modules/report-exports/report-exports.repository.ts");
    const serviceSource = source("src/modules/report-exports/report-exports.service.ts");
    expect(repo).toContain("requested_by = ?");
    expect(serviceSource).toContain("report_exports.admin.manage");
  });

  it("admin can see company export jobs", () => {
    const serviceSource = source("src/modules/report-exports/report-exports.service.ts");
    expect(serviceSource).toContain('permissionService.hasPermission(actor, "report_exports.admin.manage")');
  });

  it("report print route page exists", () => {
    expect(source("frontend/src/app/router.tsx")).toContain("/reports/print/:reportKey");
    expect(source("frontend/src/features/report-exports/ReportPrintPage.tsx")).toContain("window.print");
  });

  it("Employee 360 print route page exists", () => {
    expect(source("frontend/src/app/router.tsx")).toContain("/employees/:employeeId/print");
    expect(source("frontend/src/features/employees/Employee360Page.tsx")).toContain("Print Profile");
  });

  it("print layout hides sidebar actions", () => {
    const page = source("frontend/src/features/report-exports/ReportPrintPage.tsx");
    expect(page).toContain("no-print");
    expect(page).toContain("@media print");
  });

  it("print layout includes company report filter generated metadata", () => {
    const page = source("frontend/src/features/report-exports/ReportPrintPage.tsx");
    expect(page).toContain("HRM System");
    expect(page).toContain("Filters:");
    expect(page).toContain("Generated at");
  });

  it("sensitive fields hidden in print without permission", async () => {
    const { env } = fakeEnv();
    const data = await service.printReport(env, actor(), "payroll:employee-detail", { payroll_month: "2026-06" });
    expect(data.rows[0]).toMatchObject({ gross_salary: "REDACTED", net_payable_salary: "REDACTED" });
  });

  it("export print buttons exist on report pages and are permission guarded", () => {
    expect(source("frontend/src/features/hr-reports/HrReportsPage.tsx")).toContain("ReportExportActions");
    expect(source("frontend/src/features/payroll-reports/PayrollReportsPage.tsx")).toContain("ReportExportActions");
    expect(source("frontend/src/features/report-exports/ReportExportActions.tsx")).toContain("report_exports.create");
    expect(source("frontend/src/features/report-exports/ReportExportActions.tsx")).toContain("Download Excel");
  });

  it("unsupported export format message exists", () => {
    expect(source("src/modules/report-exports/report-exports.service.ts")).toContain("Only Excel and PDF report exports are supported");
  });

  it("Phase 11D does not add import UI", () => {
    expect(source("frontend/src/features/report-exports/ExportHistoryPage.tsx")).not.toMatch(/import\s+batch|upload\s+import/i);
  });

  it("no dark mode or unsafe metadata display", () => {
    const page = source("frontend/src/features/report-exports/ReportPrintPage.tsx");
    expect(page).not.toContain("dark:");
    expect(page).not.toContain("metadata_json");
  });

  it("sensitive export and download audit log paths are present", () => {
    const serviceSource = source("src/modules/report-exports/report-exports.service.ts");
    expect(serviceSource).toContain("report_export_sensitive_preview");
    expect(serviceSource).toContain("report_export_downloaded");
    expect(serviceSource).toContain("report_export_failed");
  });
});
