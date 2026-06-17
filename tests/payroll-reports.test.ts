import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import * as service from "../src/modules/payroll-reports/payroll-reports.service";
import { validatePayrollReportFilters } from "../src/modules/payroll-reports/payroll-reports.validators";
import type { AuthActor } from "../src/types/api.types";

const payrollPermissions = [
  "payroll_reports.view",
  "payroll_reports.catalog.view",
  "payroll_reports.summary.view",
  "payroll_reports.employee.view",
  "payroll_reports.salary.view",
  "payroll_reports.deductions.view",
  "payroll_reports.advances.view",
  "payroll_reports.loans.view",
  "payroll_reports.attendance_deductions.view",
  "payroll_reports.overtime.view",
  "payroll_reports.long_leave.view",
  "payroll_reports.leave_deductions.view",
  "payroll_reports.payslips.view",
  "payroll_reports.approvals.view",
  "payroll_reports.cost.view",
  "payroll_reports.variance.view",
  "payroll_reports.audit.view",
  "payroll_reports.finance_summary.view",
  "payroll_reports.sensitive_amounts.view",
];

const actor = (overrides: Partial<AuthActor> = {}): AuthActor => ({
  companyId: "company_1",
  actorUserId: "user_1",
  fullName: "Payroll Admin",
  email: "payroll@example.test",
  roles: ["Accountant"],
  roleKeys: ["accountant"],
  permissions: payrollPermissions,
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
            if (sql.includes("FROM feature_settings")) return { feature_key: values[1], is_enabled: 1, status: "enabled", applies_to_all_outlets: 1, allowed_role_ids_json: null, allowed_outlet_ids_json: null };
            if (sql.includes("SELECT currency FROM companies")) return { currency: "MVR" };
            return {
              total: rows.length,
              payroll_runs: 1,
              employees_in_payroll: rows.length,
              gross_payroll: 125000,
              net_payable: 100000,
            };
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

describe("Phase 11C Payroll / Finance Reports", () => {
  it("catalog returns payroll reports", async () => {
    const { env } = fakeEnv();
    const result = await service.catalog(env, actor());
    const keys = result.data.map((report) => report.report_key);
    expect(keys).toContain("monthly-summary");
    expect(keys).toContain("employee-detail");
    expect(keys).toContain("finance-summary");
    expect(result.meta.export_ready).toBe(true);
  });

  it("unavailable reports hidden by permission", async () => {
    const { env } = fakeEnv();
    const result = await service.catalog(env, actor({ permissions: ["payroll_reports.view", "payroll_reports.catalog.view", "payroll_reports.summary.view"] }));
    expect(result.data.every((report) => report.required_permission === "payroll_reports.summary.view")).toBe(true);
  });

  it("catalog-only permission can view catalog but cannot run report data", async () => {
    const catalogActor = actor({ permissions: ["payroll_reports.catalog.view"], roleKeys: ["auditor"] });
    const { env } = fakeEnv();
    expect((await service.catalog(env, catalogActor)).meta.report_key).toBe("catalog");
    await expect(service.runReport(env, catalogActor, "monthly-summary", validatePayrollReportFilters({}))).rejects.toThrow(/permission/i);
  });

  it("normal employee cannot access payroll reports", async () => {
    const { env } = fakeEnv();
    await expect(service.runReport(env, actor({
      roleKeys: ["employee"],
      permissions: [],
      outletIds: [],
    }), "employee-detail", validatePayrollReportFilters({ payroll_month: "2026-06" }))).rejects.toThrow(/permission/i);
  });

  it("monthly summary uses payroll item subqueries to avoid duplicate totals", async () => {
    const { env, calls } = fakeEnv([{ payroll_month: "2026-06", payroll_run_id: "run_1", total_employees: 1, total_gross_salary: 125000 }]);
    await service.runReport(env, actor(), "monthly-summary", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM payroll_runs pr"));
    expect(query?.sql).toContain("SELECT SUM(pe.amount) FROM payroll_earnings pe WHERE pe.company_id = pi.company_id AND pe.payroll_item_id = pi.id");
    expect(query?.sql).toContain("SELECT SUM(pd.amount) FROM payroll_deductions pd WHERE pd.company_id = pi.company_id AND pd.payroll_item_id = pi.id");
    expect(query?.sql).not.toContain("LEFT JOIN payroll_earnings pe");
    expect(query?.sql).not.toContain("LEFT JOIN payroll_deductions pd");
  });

  it("monthly summary totals gross deductions net correctly from mocked payroll records", async () => {
    const row = { payroll_month: "2026-06", total_gross_salary: 125000, total_deductions: 25000, total_net_salary_payable: 100000 };
    const { env } = fakeEnv([row]);
    const result = await service.runReport(env, actor(), "monthly-summary", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0]).toMatchObject(row);
    expect(result.meta.currency).toBe("MVR");
  });

  it("sensitive amounts hidden without permission", async () => {
    const { env } = fakeEnv([{ employee_id: "emp_1", employee_code: "EMP-001", gross_salary: 125000, net_payable_salary: 100000, amounts_restricted: 1 }]);
    const result = await service.runReport(env, actor({
      permissions: payrollPermissions.filter((permission) => permission !== "payroll_reports.sensitive_amounts.view" && permission !== "payroll.view"),
    }), "employee-detail", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.meta.restricted).toBe(true);
    expect(result.meta.columns.some((column) => column.key === "gross_salary")).toBe(false);
    expect(result.data[0].gross_salary).toBeUndefined();
    expect(result.data[0].net_payable_salary).toBeUndefined();
  });

  it("sensitive amounts shown with permission", async () => {
    const { env } = fakeEnv([{ employee_id: "emp_1", employee_code: "EMP-001", gross_salary: 125000, net_payable_salary: 100000, amounts_restricted: 0 }]);
    const result = await service.runReport(env, actor(), "employee-detail", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.meta.restricted).toBe(false);
    expect(result.meta.columns.some((column) => column.key === "gross_salary")).toBe(true);
    expect(result.data[0].gross_salary).toBe(125000);
  });

  it("employee rows include payslip status attendance and long-leave deductions", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", payslip_status: "generated", long_leave_deduction: 3000, attendance_deduction: 1000 }]);
    const result = await service.runReport(env, actor(), "employee-detail", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0].payslip_status).toBe("generated");
    expect(calls.some((call) => call.sql.includes("LEFT JOIN payslips ps"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("source_type = 'long_leave'") && call.sql.includes("source_type = 'attendance'"))).toBe(true);
  });

  it("outlet scoping enforced", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ isAdmin: false, outletIds: ["outlet_1"] }), "employee-detail", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM payroll_items pi"));
    expect(query?.sql).toContain("e.primary_outlet_id IN");
    expect(query?.values).toContain("outlet_1");
  });

  it("manager cannot see other outlet rows", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ outletIds: ["outlet_1"] }), "employee-detail", validatePayrollReportFilters({ payroll_month: "2026-06", outlet_id: "outlet_2" }));
    expect(calls.some((call) => call.sql.includes("1 = 0"))).toBe(true);
  });

  it("salary compensation hides salary amount when unauthorized", async () => {
    const { env } = fakeEnv([{ employee_id: "emp_1", base_salary: 90000, salary_status: "active" }]);
    const result = await service.runReport(env, actor({
      permissions: payrollPermissions.filter((permission) => permission !== "payroll_reports.sensitive_amounts.view" && permission !== "payroll.view"),
    }), "salary-compensation", validatePayrollReportFilters({}));
    expect(result.data[0].base_salary).toBeUndefined();
    expect(result.data[0].salary_status).toBe("active");
  });

  it("deductions report includes source reference safely", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", deduction_type: "advance", source_reference: "ADV-1" }]);
    const result = await service.runReport(env, actor(), "deductions", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0].source_reference).toBe("ADV-1");
    expect(calls.some((call) => call.sql.includes("payroll_deductions pd") && call.sql.includes("source_reference"))).toBe(true);
  });

  it("advance and loan reports work", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", advance_amount: 5000, loan_amount: 20000, paid_this_month: 2000, total_paid_to_date: 10000, remaining_balance: 10000 }]);
    await service.runReport(env, actor(), "advances", validatePayrollReportFilters({ from_date: "2026-01-01", to_date: "2026-12-31" }));
    await service.runReport(env, actor(), "salary-loans", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(calls.some((call) => call.sql.includes("FROM advance_payments a"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("FROM salary_loans l"))).toBe(true);
  });

  it("Salary Loan paid_this_month and total_paid_to_date are different where expected", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", loan_amount: 20000, paid_this_month: 2000, total_paid_to_date: 10000, remaining_balance: 10000 }]);
    const result = await service.runReport(env, actor(), "salary-loans", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0]).toMatchObject({ paid_this_month: 2000, total_paid_to_date: 10000, remaining_balance: 10000 });
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM salary_loans l"));
    expect(query?.sql).toContain("AS paid_this_month");
    expect(query?.sql).toContain("AS total_paid_to_date");
    expect(query?.sql).toContain("row_i.payroll_month = ?");
    expect(query?.values).toContain("2026-06");
  });

  it("sensitive amount guard hides salary loan paid values without permission", async () => {
    const { env } = fakeEnv([{ employee_id: "emp_1", paid_this_month: 2000, total_paid_to_date: 10000, remaining_balance: 10000 }]);
    const result = await service.runReport(env, actor({
      permissions: payrollPermissions.filter((permission) => permission !== "payroll_reports.sensitive_amounts.view" && permission !== "payroll.view"),
    }), "salary-loans", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.meta.columns.some((column) => column.key === "paid_this_month")).toBe(false);
    expect(result.meta.columns.some((column) => column.key === "total_paid_to_date")).toBe(false);
    expect(result.data[0].paid_this_month).toBeUndefined();
    expect(result.data[0].total_paid_to_date).toBeUndefined();
    expect(result.data[0].remaining_balance).toBeUndefined();
  });

  it("attendance deduction report uses attendance summary", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", absent_days: 2, attendance_deduction_amount: 1000 }]);
    const result = await service.runReport(env, actor(), "attendance-deductions", validatePayrollReportFilters({ from_date: "2026-06-01", to_date: "2026-06-30" }));
    expect(result.data[0].absent_days).toBe(2);
    expect(calls.some((call) => call.sql.includes("FROM attendance_daily_summary s"))).toBe(true);
  });

  it("overtime report includes overtime minutes and holiday indicator", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", overtime_minutes: 120, holiday_overtime: 1 }]);
    const result = await service.runReport(env, actor(), "overtime", validatePayrollReportFilters({ from_date: "2026-06-01", to_date: "2026-06-30" }));
    expect(result.data[0].holiday_overtime).toBe(1);
    expect(calls.some((call) => call.sql.includes("s.overtime_minutes") && call.sql.includes("s.is_holiday"))).toBe(true);
  });

  it("long-leave deduction report uses Phase 9C payroll impacts", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", long_leave_id: "ll_1", holiday_days: 1, payable_holiday_days: 1, deduction_amount: 12000 }]);
    const result = await service.runReport(env, actor(), "long-leave-deductions", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0].holiday_days).toBe(1);
    expect(calls.some((call) => call.sql.includes("long_leave_payroll_impacts"))).toBe(true);
  });

  it("payslip status includes missing finalized warning", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", payslip_status: "missing", missing_finalized_warning: 1 }]);
    const result = await service.runReport(env, actor(), "payslip-status", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0].missing_finalized_warning).toBe(1);
    expect(calls.some((call) => call.sql.includes("pr.status IN ('finalized', 'locked', 'paid') AND ps.id IS NULL"))).toBe(true);
  });

  it("approval finalization report shows payroll approval status", async () => {
    const { env, calls } = fakeEnv([{ payroll_month: "2026-06", approval_status: "approved", pending_approval_count: 0 }]);
    const result = await service.runReport(env, actor(), "approval-finalization", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0].approval_status).toBe("approved");
    expect(calls.some((call) => call.sql.includes("approval_requests ar") && call.sql.includes("approval_actions aa"))).toBe(true);
  });

  it("Payroll Approval / Finalization outlet scoping uses payroll items for outlet-scoped users", async () => {
    const { env, calls } = fakeEnv([{ payroll_month: "2026-06", approval_status: "pending" }]);
    await service.runReport(env, actor({ isAdmin: false, outletIds: ["outlet_1"] }), "approval-finalization", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM payroll_runs pr"));
    expect(query?.sql).toContain("EXISTS");
    expect(query?.sql).toContain("FROM payroll_items scoped_pi");
    expect(query?.sql).toContain("e.primary_outlet_id IN");
    expect(query?.values).toContain("outlet_1");
  });

  it("outlet-scoped approval report does not include other-outlet payroll runs", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ outletIds: ["outlet_1"] }), "approval-finalization", validatePayrollReportFilters({ outlet_id: "outlet_2", payroll_month: "2026-06" }));
    expect(calls.some((call) => call.sql.includes("1 = 0"))).toBe(true);
  });

  it("Admin/Super Admin can see company-wide approval finalization report", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ isAdmin: true, outletIds: [] }), "approval-finalization", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM payroll_runs pr"));
    expect(query?.sql).not.toContain("FROM payroll_items scoped_pi");
    expect(query?.sql).not.toContain("e.primary_outlet_id IN");
  });

  it("outlet and department cost reports group costs", async () => {
    const { env, calls } = fakeEnv([{ grouping: "outlet", group_name: "Male", employee_count: 3 }]);
    await service.runReport(env, actor(), "outlet-cost", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    await service.runReport(env, actor(), "department-cost", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(calls.some((call) => call.sql.includes("'outlet' AS grouping"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("'department' AS grouping"))).toBe(true);
  });

  it("variance report compares periods and calculates difference", async () => {
    const { env, calls } = fakeEnv([{ employee_id: "emp_1", difference_amount: 5000, difference_percent: 5 }]);
    const result = await service.runReport(env, actor(), "variance", validatePayrollReportFilters({ payroll_month: "2026-06", variance_threshold: "1000" }));
    expect(result.data[0].difference_amount).toBe(5000);
    expect(calls.some((call) => call.sql.includes("strftime('%Y-%m', date(pr.payroll_month || '-01', '-1 month'))"))).toBe(true);
  });

  it("payroll audit report hides unsafe metadata", async () => {
    const { env } = fakeEnv([{ payroll_run_id: "run_1", action: "finalized", before_after_summary: "Values changed; details restricted to source record." }]);
    const result = await service.runReport(env, actor(), "audit", validatePayrollReportFilters({ from_date: "2026-01-01", to_date: "2026-12-31" }));
    expect(JSON.stringify(result)).not.toMatch(/metadata_json|snapshot_json|calculation_metadata_json|file_key|password_hash|device_token|raw_payload/);
  });

  it("Payroll Audit report outlet scoping applies employee and related entity scope", async () => {
    const { env, calls } = fakeEnv([{ payroll_run_id: "item_1", employee_id: "emp_1", action: "payroll_item_updated" }]);
    await service.runReport(env, actor({ isAdmin: false, outletIds: ["outlet_1"] }), "audit", validatePayrollReportFilters({ from_date: "2026-01-01", to_date: "2026-12-31" }));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM audit_logs al"));
    expect(query?.sql).toContain("FROM employees e");
    expect(query?.sql).toContain("e.primary_outlet_id IN");
    expect(query?.sql).toContain("e.id = al.employee_id");
    expect(query?.sql).toContain("payroll_items scoped_pi");
    expect(query?.sql).toContain("payslips scoped_ps");
    expect(query?.sql).toContain("advance_payments scoped_adv");
    expect(query?.sql).toContain("salary_loans scoped_loan");
    expect(query?.sql).toContain("long_leave_payroll_impacts scoped_lli");
    expect(query?.sql).toContain("employee_salary_history scoped_salary");
    expect(query?.values).toContain("outlet_1");
  });

  it("Payroll Audit unscoped rows hidden from outlet-scoped users", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ outletIds: ["outlet_1"] }), "audit", validatePayrollReportFilters({ from_date: "2026-01-01", to_date: "2026-12-31" }));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM audit_logs al"));
    expect(query?.sql).toContain("AND (");
    expect(query?.sql).not.toContain("OR al.employee_id IS NULL");
  });

  it("outlet-scoped payroll user does not see other-outlet audit rows", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ outletIds: ["outlet_1"] }), "audit", validatePayrollReportFilters({ outlet_id: "outlet_2", from_date: "2026-01-01", to_date: "2026-12-31" }));
    expect(calls.some((call) => call.sql.includes("1 = 0"))).toBe(true);
  });

  it("Super Admin/Admin can see company-wide payroll audit rows", async () => {
    const { env, calls } = fakeEnv();
    await service.runReport(env, actor({ isAdmin: true, outletIds: [] }), "audit", validatePayrollReportFilters({ from_date: "2026-01-01", to_date: "2026-12-31" }));
    const query = calls.find((call) => call.method === "all" && call.sql.includes("FROM audit_logs al"));
    expect(query?.sql).not.toContain("FROM employees e");
    expect(query?.sql).not.toContain("e.primary_outlet_id IN");
  });

  it("finance summary report returns payroll finance totals only", async () => {
    const { env, calls } = fakeEnv([{ payroll_month: "2026-06", gross_payroll: 125000, net_payable: 100000 }]);
    const result = await service.runReport(env, actor(), "finance-summary", validatePayrollReportFilters({ payroll_month: "2026-06" }));
    expect(result.data[0].net_payable).toBe(100000);
    expect(calls.some((call) => /ledger|gl_posting|bank_file/i.test(call.sql))).toBe(false);
  });

  it("page_size max enforced and unbounded history capped", async () => {
    const filters = validatePayrollReportFilters({ page_size: "500", from_date: "2026-01-01", to_date: "2026-12-31" }, { periodRequired: true });
    expect(filters.page_size).toBe(100);
    const { env } = fakeEnv();
    const result = await service.runReport(env, actor(), "deductions", filters);
    expect(result.pagination.page_size).toBe(100);
  });

  it("Payroll Reports route/page exists", () => {
    const router = source("frontend/src/app/router.tsx");
    const routes = source("src/routes/payroll-reports.routes.ts");
    const page = source("frontend/src/features/payroll-reports/PayrollReportsPage.tsx");
    expect(router).toContain("/payroll-reports");
    expect(routes.indexOf('"/catalog"')).toBeLessThan(routes.indexOf('requirePermission("payroll_reports.view")'));
    expect(page).toContain("Report catalog");
    expect(page).toContain("Payroll Summary");
    expect(page).toContain("ReportExportActions");
    expect(page).toContain("payroll:");
  });

  it("frontend report table amount formatting and View Employee 360 action exist", () => {
    const page = source("frontend/src/features/payroll-reports/PayrollReportsPage.tsx");
    expect(page).toContain("DataTable");
    expect(page).toContain("formatMoneyMinor");
    expect(page).toContain("View Employee 360");
    expect(page).not.toContain("dark:");
    expect(page).not.toContain("metadata_json");
  });
});
