import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as payrollRepository from "../src/modules/payroll/payroll.repository";
import * as payslipRepository from "../src/modules/payslips/payslips.repository";
import * as payslipService from "../src/modules/payslips/payslips.service";
import { validatePayslipGenerate } from "../src/modules/payslips/payslips.validators";
import { ValidationError } from "../src/utils/errors";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const env = {
  DB: {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ meta: { changes: 1 } }),
      }),
    }),
  },
} as unknown as Env;
const context = {
  actorUserId: "user_super",
  companyId: "company_1",
  outletIds: ["outlet_1"],
  isSuperAdmin: true,
  isAdmin: true,
  roles: ["Super Admin"],
  roleKeys: ["super_admin"],
  permissions: ["payslips.view", "payslips.generate", "payslips.download", "payslips.print"],
} as any;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("payslip validators", () => {
  it("requires reason for batch generation", () => {
    expect(() => validatePayslipGenerate({ payroll_run_id: "pay_1" })).toThrow(ValidationError);
  });
});

describe("Phase 6C payslip hardening", () => {
  it("sanitizes payslip detail responses and never exposes file_key or storage keys", () => {
    const sanitized = payslipService.sanitizePayslipForResponse({
      id: "payslip_1",
      file_key: "private/r2/key.pdf",
      storage_key: "private/storage/key.pdf",
      employee_name: "Amina",
      payroll_month: "2026-06",
      snapshot_json: JSON.stringify({
        employee: { name: "Amina" },
        totals: { net_amount: 120000, currency: "MVR" },
      }),
    });

    expect(JSON.stringify(sanitized)).not.toContain("private/r2/key.pdf");
    expect(JSON.stringify(sanitized)).not.toContain("file_key");
    expect(sanitized.employee).toEqual({ name: "Amina" });
    expect(sanitized.totals).toEqual({ net_amount: 120000, currency: "MVR" });
  });

  it("renders print-friendly HTML from immutable snapshot data", () => {
    const payslip = payslipService.sanitizePayslipForResponse({
      id: "payslip_1",
      status: "finalized",
      payroll_month: "2026-06",
      employee_snapshot_json: JSON.stringify({ name: "Amina", code: "EMP-001", outlet_name: "Front" }),
      company_snapshot_json: JSON.stringify({ name: "Cafe Asiana" }),
      period_snapshot_json: JSON.stringify({ payroll_month: "2026-06", period_start: "2026-06-01", period_end: "2026-06-30", currency: "MVR" }),
      earnings_json: JSON.stringify([{ id: "earn_1", description: "Basic salary", amount: 100000 }]),
      deductions_json: JSON.stringify([{ id: "ded_1", description: "Advance", amount: 10000 }]),
      totals_json: JSON.stringify({ gross_amount: 100000, total_deductions_amount: 10000, net_amount: 90000, currency: "MVR" }),
    });

    const html = payslipService.renderPayslipPrintHtml(payslip);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Cafe Asiana");
    expect(html).toContain("Amina");
    expect(html).toContain("Basic salary");
    expect(html).toContain("Advance");
    expect(html).toContain("browser print dialog");
    expect(html).not.toContain("file_key");
  });

  it("uses snapshot employee and company data instead of live joined data", () => {
    const sanitized = payslipService.sanitizePayslipForResponse({
      id: "payslip_1",
      employee_name: "Changed Live Name",
      outlet_name: "Changed Live Outlet",
      employee_snapshot_json: JSON.stringify({ name: "Finalized Name", outlet_name: "Finalized Outlet" }),
      company_snapshot_json: JSON.stringify({ name: "Finalized Company" }),
      totals_json: JSON.stringify({ net_amount: 90000, currency: "MVR" }),
    });

    expect(sanitized.employee).toMatchObject({ name: "Finalized Name", outlet_name: "Finalized Outlet" });
    expect(sanitized.company).toMatchObject({ name: "Finalized Company" });
    expect((sanitized.employee as any).name).not.toBe("Changed Live Name");
  });

  it("approved but not finalized payroll cannot generate payslips", async () => {
    vi.spyOn(payslipRepository, "findPayrollRun").mockResolvedValue({
      id: "payroll_1",
      company_id: "company_1",
      payroll_month: "2026-06",
      status: "approved",
    } as any);
    const upsert = vi.spyOn(payrollRepository, "upsertPayslipSnapshots").mockResolvedValue([] as any);

    await expect(payslipService.generateBatch(env, context, {
      payroll_run_id: "payroll_1",
      reason: "Generate",
    })).rejects.toMatchObject({
      code: "PAYSLIP_PAYROLL_NOT_FINALIZED",
      message: "Payslips can only be generated after payroll is finalized.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("finalized payroll generates missing payslips with immutable snapshots", async () => {
    vi.spyOn(payslipRepository, "findPayrollRun").mockResolvedValue({
      id: "payroll_1",
      company_id: "company_1",
      payroll_month: "2026-06",
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      status: "finalized",
      currency: "MVR",
      finalized_at: "2026-07-01T08:00:00.000Z",
      finalized_by: "user_finalizer",
      calculation_version: 3,
    } as any);
    vi.spyOn(payrollRepository, "listPayrollItemsNeedingPayslipSnapshots").mockResolvedValue([{ id: "item_1" }] as any);
    vi.spyOn(payslipRepository, "countExistingPayslipsForRun").mockResolvedValue(0);
    vi.spyOn(payslipRepository, "countPayrollItemsForRun").mockResolvedValue(1);
    vi.spyOn(payrollRepository, "listPayslipSnapshotItemsForRun").mockResolvedValue([{
      id: "item_1",
      employee_id: "emp_1",
      employee_code: "EMP-001",
      employee_name: "Finalized Employee",
      employee_type: "foreign",
      outlet_id: "outlet_1",
      outlet_name: "Outlet One",
      company_name: "Cafe Asiana",
      basic_salary_amount: 100000,
      payable_basic_amount: 100000,
      gross_amount: 110000,
      total_deductions_amount: 10000,
      net_amount: 100000,
      carry_forward_deduction_amount: 0,
      calculation_version: 3,
      calculation_metadata_json: JSON.stringify({ attendance_summary: { present_days: 20 } }),
    }] as any);
    vi.spyOn(payrollRepository, "listPayslipSnapshotEarningsForRun").mockResolvedValue([{
      id: "earn_1",
      payroll_item_id: "item_1",
      earning_type: "basic_salary",
      amount: 100000,
      calculation_description: "Basic salary",
    }] as any);
    vi.spyOn(payrollRepository, "listPayslipSnapshotDeductionsForRun").mockResolvedValue([{
      id: "ded_1",
      payroll_item_id: "item_1",
      deduction_type: "salary_advance",
      amount: 10000,
      calculation_description: "Salary advance",
    }] as any);
    const upsert = vi.spyOn(payrollRepository, "upsertPayslipSnapshots").mockResolvedValue([] as any);

    const result = await payslipService.generateBatch(env, context, {
      payroll_run_id: "payroll_1",
      reason: "Generate",
    });

    expect(result.created).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][1];
    const snapshot = payload.payslipSnapshots[0];
    expect(snapshot.snapshotJson).toBeTruthy();
    expect(snapshot.employeeSnapshotJson).toContain("Finalized Employee");
    expect(snapshot.companySnapshotJson).toContain("Cafe Asiana");
    expect(snapshot.earningsJson).toContain("Basic salary");
    expect(snapshot.deductionsJson).toContain("Salary advance");
    expect(snapshot.totalsJson).toContain("100000");
    expect(JSON.parse(snapshot.periodSnapshotJson)).toMatchObject({
      finalized_at: "2026-07-01T08:00:00.000Z",
      finalized_by: "user_finalizer",
    });
  });

  it("denies payslip access outside the user's outlet", async () => {
    vi.spyOn(payslipRepository, "findPayslip").mockResolvedValue({
      id: "payslip_1",
      company_id: "company_1",
      outlet_id: "outlet_2",
    } as any);

    await expect(payslipService.getPayslip(env, {
      ...context,
      isSuperAdmin: false,
      roleKeys: [],
      outletIds: ["outlet_1"],
    }, "payslip_1")).rejects.toMatchObject({
      code: "OUTLET_ACCESS_DENIED",
      message: "You do not have access to this payslip.",
    });
  });

  it("registers safe payslip download and print routes", () => {
    const routes = read("src/routes/payslips.routes.ts");

    expect(routes).toContain("/:id/download");
    expect(routes).toContain("/:id/print");
    expect(routes).toContain("payslips.download");
    expect(routes).toContain("payslips.print");
  });

  it("registers payroll-run and employee-scoped payslip history routes", () => {
    expect(read("src/routes/payroll.routes.ts")).toContain("/runs/:id/payslips");
    expect(read("src/routes/employees.routes.ts")).toContain("/:id/payslips");
  });

  it("protects finalized payslip idempotency with unique indexes", () => {
    const migration = read("migrations/0029_payslip_hardening.sql").toLowerCase();

    expect(migration).toContain("idx_payslips_company_run_employee_unique");
    expect(migration).toContain("on payslips(company_id, payroll_run_id, employee_id)");
  });

  it("finalization preserves existing immutable snapshots on retry and repairs incomplete snapshots", () => {
    const repository = read("src/modules/payroll/payroll.repository.ts").toLowerCase();

    expect(repository).toContain("insert or ignore into payslips");
    expect(repository).toContain("snapshot_json = coalesce(snapshot_json");
    expect(repository).toContain("employee_snapshot_json = coalesce(employee_snapshot_json");
    expect(repository).toContain("totals_json = coalesce(totals_json");
    expect(repository).toContain("where company_id = ? and payroll_run_id = ? and employee_id = ?");
  });
});
