import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import * as service from "../src/modules/hr-reports/hr-reports.service";
import { validateHrReportFilters } from "../src/modules/hr-reports/hr-reports.validators";
import type { AuthActor } from "../src/types/api.types";

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_1",
  fullName: "HR Admin",
  email: "hr@example.test",
  roles: ["HR Admin"],
  roleKeys: ["hr_admin"],
  permissions: [
    "hr_reports.view",
    "hr_reports.employee.view",
    "hr_reports.compliance.view",
    "hr_reports.documents.view",
    "hr_reports.leave.view",
    "hr_reports.long_leave.view",
    "hr_reports.assets.view",
    "hr_reports.lifecycle.view",
    "hr_reports.employee_360.view",
    "hr_reports.catalog.view",
  ],
  outletIds: ["outlet_1"],
  isSuperAdmin: false,
  isAdmin: false,
  ipAddress: null,
  userAgent: null,
  ...overrides,
});

type CapturedCall = { sql: string; values: unknown[]; method: "first" | "all" };

const fakeEnv = (rows: Record<string, unknown>[] = [{ employee_id: "emp_1", employee_code: "EMP-001", employee_name: "Aisha" }]) => {
  const calls: CapturedCall[] = [];
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          first: async () => {
            calls.push({ sql, values, method: "first" });
            return { total: rows.length, employees: rows.length };
          },
          all: async () => {
            calls.push({ sql, values, method: "all" });
            return { results: rows };
          },
        }),
      }),
    },
  } as unknown as Env;
  return { env, calls };
};

const source = (path: string) => readFileSync(path, "utf8");

describe("Phase 11B HR Reports", () => {
  it("catalog returns HR reports", () => {
    const result = service.catalog(actor());
    expect(result.data.map((report) => report.report_key)).toContain("employee-master");
    expect(result.data.map((report) => report.report_key)).toContain("document-compliance");
    expect(result.data.map((report) => report.report_key)).toContain("employee-360-summary");
    expect(result.meta.export_ready).toBe(true);
  });

  it("unavailable reports hidden by permission", () => {
    const result = service.catalog(actor({ permissions: ["hr_reports.view", "hr_reports.catalog.view", "hr_reports.employee.view"] }));
    expect(result.data.every((report) => report.required_permission === "hr_reports.employee.view")).toBe(true);
  });

  it("normal employee cannot access HR reports", async () => {
    const { env } = fakeEnv();
    await expect(service.runReport(env, actor({
      roleKeys: ["employee"],
      permissions: [],
      outletIds: [],
    }), "employee-master", validateHrReportFilters({}))).rejects.toThrow(/permission/i);
  });

  it("Employee Master report returns employee rows and safe metadata", async () => {
    const { env } = fakeEnv([{ employee_id: "emp_1", employee_code: "EMP-001", employee_name: "Aisha", profile_completeness: "complete" }]);
    const result = await service.runReport(env, actor(), "employee-master", validateHrReportFilters({}));
    expect(result.data[0].employee_code).toBe("EMP-001");
    expect(result.meta.columns.length).toBeGreaterThan(5);
    expect(JSON.stringify(result)).not.toMatch(/password_hash|token_hash|raw_payload|metadata_json|file_key/);
  });

  it("outlet scoping enforced", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ isAdmin: false, outletIds: ["outlet_1"] }), "employee-master", validateHrReportFilters({}));
    const rowQuery = calls.find((call) => call.method === "all" && call.sql.includes("FROM employees e"));
    expect(rowQuery?.sql).toContain("e.primary_outlet_id IN");
    expect(rowQuery?.values).toContain("outlet_1");
  });

  it("local/foreign filter works", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor(), "employee-master", validateHrReportFilters({ employee_type: "foreign" }));
    expect(calls.some((call) => call.sql.includes("e.employee_type = ?") && call.values.includes("foreign"))).toBe(true);
  });

  it("archived filter works", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor(), "employee-master", validateHrReportFilters({ include_archived: "true" }));
    const rowQuery = calls.find((call) => call.method === "all" && call.sql.includes("FROM employees e"));
    expect(rowQuery?.sql).not.toContain("e.deleted_at IS NULL");
  });

  it("document compliance includes missing expired and expiring documents", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", missing_documents: 1, expired_documents: 1, expiring_documents: 1 }]);
    const result = await service.runReport(env, actor(), "document-compliance", validateHrReportFilters({}));
    expect(result.data[0].missing_documents).toBe(1);
    expect(calls.some((call) => call.sql.includes("employee_documents doc") && call.sql.includes("expired_documents"))).toBe(true);
  });

  it("New Joiners report returns probation document contract and profile columns", async () => {
    const { env, calls } = fakeEnv([{
      employee_id: "emp_1",
      employee_code: "EMP-001",
      employee_name: "Aisha",
      joined_at: "2026-06-01",
      probation_end_date: "2026-09-01",
      onboarding_document_status: "complete",
      contract_status: "active",
      profile_completeness: "complete",
    }]);
    const result = await service.runReport(env, actor(), "new-joiners", validateHrReportFilters({ from_date: "2026-06-01", to_date: "2026-06-30" }));
    expect(result.data[0]).toMatchObject({
      probation_end_date: "2026-09-01",
      onboarding_document_status: "complete",
      contract_status: "active",
      profile_completeness: "complete",
    });
    const query = calls.find((call) => call.method === "all" && call.sql.includes("e.joined_at BETWEEN"));
    expect(query?.sql).toContain("probation_end_date");
    expect(query?.sql).toContain("onboarding_document_status");
    expect(query?.sql).toContain("document_categories cat");
    expect(query?.sql).toContain("employee_contracts c");
  });

  it("Document Compliance uses required document category applicability rules", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", required_documents_count: 2, uploaded_documents: 1, missing_documents: 1, compliance_status: "missing" }]);
    const result = await service.runReport(env, actor(), "document-compliance", validateHrReportFilters({ employee_type: "foreign" }));
    expect(result.data[0]).toMatchObject({ required_documents_count: 2, uploaded_documents: 1, missing_documents: 1 });
    const query = calls.find((call) => call.method === "all" && call.sql.includes("required_documents_count"));
    expect(query?.sql).toContain("FROM document_categories cat");
    expect(query?.sql).toContain("cat.status = 'active'");
    expect(query?.sql).toContain("cat.applies_to_foreign_employee = 1");
    expect(query?.sql).toContain("cat.applies_to_local_employee = 1");
    expect(query?.sql).toContain("NOT EXISTS");
    expect(query?.sql).toContain("doc.document_category = cat.category_key");
  });

  it("Document Compliance ignores inactive categories and uploaded required documents clear missing count", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", required_documents_count: 1, uploaded_documents: 1, missing_documents: 0, expired_documents: 0, compliance_status: "compliant" }]);
    const result = await service.runReport(env, actor(), "document-compliance", validateHrReportFilters({ employee_type: "local" }));
    expect(result.data[0].missing_documents).toBe(0);
    expect(result.data[0].compliance_status).toBe("compliant");
    const query = calls.find((call) => call.method === "all" && call.sql.includes("missing_documents"));
    expect(query?.sql).toContain("cat.status = 'active'");
    expect(query?.sql).toContain("doc.status NOT IN ('archived', 'replaced', 'deleted', 'rejected', 'metadata_only', 'pending_file', 'missing_file')");
  });

  it("Document Compliance reports expired uploaded required documents", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", required_documents_count: 1, uploaded_documents: 1, missing_documents: 0, expired_documents: 1, compliance_status: "expired" }]);
    const result = await service.runReport(env, actor(), "document-compliance", validateHrReportFilters({}));
    expect(result.data[0].expired_documents).toBe(1);
    expect(result.data[0].compliance_status).toBe("expired");
    expect(calls.some((call) => call.sql.includes("doc.status = 'expired'") && call.sql.includes("doc.expiry_date IS NOT NULL"))).toBe(true);
  });

  it("masked identity numbers by default", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", passport_number_masked: "****1234" }]);
    await service.runReport(env, actor({ permissions: ["hr_reports.view", "hr_reports.compliance.view"] }), "foreign-compliance", validateHrReportFilters({}));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("passport_number_masked"));
    expect(query?.sql).toContain("substr('****************'");
  });

  it("leave balance report uses Phase 9A balances", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", available_days: -1, negative_balance_warning: 1 }]);
    const result = await service.runReport(env, actor(), "leave-balances", validateHrReportFilters({}));
    expect(result.data[0].negative_balance_warning).toBe(1);
    expect(calls.some((call) => call.sql.includes("FROM leave_balances lb") && call.sql.includes("available_days"))).toBe(true);
  });

  it("leave request report includes approval status and holiday-adjusted duration", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", approval_status: "pending_approval", requested_duration_days: 3, holiday_adjusted_duration: 2 }]);
    const result = await service.runReport(env, actor(), "leave-requests", validateHrReportFilters({ from_date: "2026-01-01", to_date: "2026-01-31" }));
    expect(result.data[0].approval_status).toBe("pending_approval");
    expect(result.data[0].requested_duration_days).toBe(3);
    expect(result.data[0].holiday_adjusted_duration).toBe(2);
    expect(calls.some((call) => call.sql.includes("COALESCE(l.approval_status, l.status)") && call.sql.includes("holiday_adjusted_duration"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("julianday(l.end_date)") && call.sql.includes("l.total_days AS holiday_adjusted_duration"))).toBe(true);
  });

  it("catalog-only permission can view catalog but cannot run report data", async () => {
    const catalogActor = actor({
      permissions: ["hr_reports.catalog.view"],
      roleKeys: ["auditor"],
      roles: ["Auditor"],
    });
    const catalog = service.catalog(catalogActor);
    expect(catalog.meta.report_key).toBe("catalog");
    const { env } = fakeEnv();
    await expect(service.runReport(env, catalogActor, "employee-master", validateHrReportFilters({}))).rejects.toThrow(/permission/i);
  });

  it("long leave report includes payroll review status without full payroll report", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", payroll_status: "pending_review", estimated_deduction: 100 }]);
    const result = await service.runReport(env, actor(), "long-leave", validateHrReportFilters({ from_date: "2026-01-01", to_date: "2026-03-31" }));
    expect(result.data[0].payroll_status).toBe("pending_review");
    expect(calls.some((call) => call.sql.includes("long_leave_payroll_impacts"))).toBe(true);
    expect(calls.some((call) => /payroll_items|net_amount|gross_amount/.test(call.sql))).toBe(false);
  });

  it("lifecycle pagination is bounded", async () => {
    const filters = validateHrReportFilters({ page_size: "500", from_date: "2026-01-01", to_date: "2026-12-31" }, { historyRequired: true });
    expect(filters.page_size).toBe(100);
    const { env } = fakeEnv();
    const result = await service.runReport(env, actor(), "lifecycle", filters);
    expect(result.pagination.page_size).toBe(100);
  });

  it("manager cannot access other outlet report rows", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ isAdmin: false, roleKeys: ["outlet_manager"], outletIds: ["outlet_1"] }), "employee-master", validateHrReportFilters({ outlet_id: "outlet_2" }));
    expect(calls.some((call) => call.sql.includes("1 = 0"))).toBe(true);
  });

  it("Super Admin/Admin can access full report", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ isAdmin: true, outletIds: [] }), "employee-master", validateHrReportFilters({}));
    const rowQuery = calls.find((call) => call.method === "all" && call.sql.includes("FROM employees e"));
    expect(rowQuery?.sql).not.toContain("e.primary_outlet_id IN");
    expect(rowQuery?.sql).not.toContain("1 = 0");
  });

  it("HR Reports route/page exists", () => {
    const router = source("frontend/src/app/router.tsx");
    const routes = source("src/routes/hr-reports.routes.ts");
    const page = source("frontend/src/features/hr-reports/HrReportsPage.tsx");
    expect(router).toContain("/hr-reports");
    expect(routes.indexOf('"/catalog"')).toBeLessThan(routes.indexOf('requirePermission("hr_reports.view")'));
    expect(page).toContain("Report catalog");
    expect(page).toContain("ReportExportActions");
    expect(page).toContain("hr:");
  });

  it("frontend report table and View Employee 360 action exist", () => {
    const page = source("frontend/src/features/hr-reports/HrReportsPage.tsx");
    expect(page).toContain("DataTable");
    expect(page).toContain("View Employee 360");
    expect(page).not.toContain("dark:");
    expect(page).not.toContain("metadata_json");
  });
});
