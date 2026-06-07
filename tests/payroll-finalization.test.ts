import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as repository from "../src/modules/payroll/payroll.repository";
import * as service from "../src/modules/payroll/payroll.service";
import * as settingsService from "../src/services/settings.service";
import * as syncService from "../src/modules/sync/sync.service";

const context = {
  actorUserId: "user_super",
  companyId: "company_1",
  outletIds: ["outlet_1"],
  isSuperAdmin: true,
  isAdmin: true,
  permissions: ["payroll.finalize", "payroll.lock", "payroll.reopen", "payroll.request_reopen", "payroll.approve_reopen"],
} as any;

const env = {
  DB: {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }),
  },
} as unknown as Env;

const read = (path: string) => readFileSync(path, "utf8");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Phase 6B payroll finalization safeguards", () => {
  it("registers the payroll finalization routes without replacing existing payroll routes", () => {
    const routes = read("src/routes/payroll.routes.ts");

    expect(routes).toContain('payrollRoutes.post("/runs/:id/finalize"');
    expect(routes).toContain('payrollRoutes.post("/:id/finalize"');
    expect(routes).toContain('requirePermission("payroll.finalize")');
    expect(routes).toContain('payrollRoutes.post("/:id/recalculate"');
  });

  it("declares immutable repayment ledger schema and finalization snapshot fields", () => {
    const migration = read("migrations/0028_payroll_finalization_repayments.sql").toLowerCase();

    expect(migration).toContain("create table if not exists payroll_repayment_applications");
    expect(migration).toContain("unique(company_id, payroll_run_id, source_type, source_id)");
    expect(migration).toContain("add column finalized_by");
    expect(migration).toContain("add column finalized_at");
    expect(migration).toContain("add column finalization_started_at");
    expect(migration).toContain("add column repaid_amount");
    expect(migration).toContain("add column paid_amount");
    expect(migration).toContain("add column snapshot_json");
    expect(migration).toContain("idx_payslips_company_item_unique");
  });

  it("finalization persists repayment ledger rows, repayment state, payslip snapshots, and finalized run status in one batch", async () => {
    const prepared: Array<{ sql: string; values: unknown[] }> = [];
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: (...values: unknown[]) => {
            const statement = { sql, values };
            prepared.push(statement);
            return statement;
          },
        }),
        batch: async (statements: unknown[]) => ({ statements }),
      },
    } as unknown as Env;

    await repository.finalizeRunBatch(env, {
      companyId: "company_1",
      actorId: "user_1",
      finalizedAt: "2026-07-01T08:00:00.000Z",
      run: {
        id: "payroll_1",
        company_id: "company_1",
        payroll_month: "2026-06",
        status: "finalizing",
        currency: "MVR",
      } as any,
      repaymentApplications: [
        {
          id: "pay_repay_1",
          payrollItemId: "item_1",
          employeeId: "emp_1",
          sourceType: "salary_advance",
          sourceId: "adv_1",
          appliedAmount: 10000,
          currency: "MVR",
        },
        {
          id: "pay_repay_2",
          payrollItemId: "item_1",
          employeeId: "emp_1",
          sourceType: "salary_loan_installment",
          sourceId: "loan_inst_1",
          appliedAmount: 20000,
          currency: "MVR",
        },
      ],
      payslipSnapshots: [
        {
          id: "payslip_1",
          payrollItemId: "item_1",
          employeeId: "emp_1",
          calculationVersion: 4,
          snapshotJson: JSON.stringify({ payroll_run_id: "payroll_1" }),
          employeeSnapshotJson: JSON.stringify({ id: "emp_1" }),
          companySnapshotJson: JSON.stringify({ id: "company_1" }),
          periodSnapshotJson: JSON.stringify({ payroll_month: "2026-06" }),
          earningsJson: JSON.stringify([]),
          deductionsJson: JSON.stringify([]),
          nonCashBenefitsJson: JSON.stringify([]),
          totalsJson: JSON.stringify({ net_amount: 0 }),
        },
      ],
    });

    const sql = prepared.map((statement) => statement.sql).join("\n");
    expect(sql).toContain("INSERT OR IGNORE INTO payroll_repayment_applications");
    expect(sql).toContain("UPDATE advance_payments");
    expect(sql).toContain("repaid_amount");
    expect(sql).toContain("UPDATE salary_loan_installments");
    expect(sql).toContain("paid_amount");
    expect(sql).toContain("UPDATE salary_loans");
    expect(sql).toContain("INSERT OR IGNORE INTO payslips");
    expect(sql).toContain("snapshot_json");
    expect(sql).toContain("SET status = 'finalized'");
    expect(sql).toContain("UPDATE attendance_daily_summary SET payroll_status = 'locked'");
  });

  it("old lock route service returns a replacement error and does not mutate payroll status", async () => {
    vi.spyOn(repository, "findRunById").mockResolvedValue({
      id: "payroll_1",
      company_id: "company_1",
      payroll_month: "2026-06",
      status: "approved",
    } as any);
    const lockRun = vi.spyOn(repository, "lockRun").mockResolvedValue({ meta: { changes: 1 } } as any);
    const updateAttendance = vi.spyOn(repository, "updateAttendancePayrollStatus").mockResolvedValue({ meta: { changes: 1 } } as any);

    await expect(service.lockPayroll(env, context, "payroll_1", { reason: "Old lock attempt" })).rejects.toMatchObject({
      code: "PAYROLL_LOCK_REPLACED_BY_FINALIZATION",
      message: "Payroll locking is now handled by payroll finalization. Use Finalize Payroll instead.",
    });
    expect(lockRun).not.toHaveBeenCalled();
    expect(updateAttendance).not.toHaveBeenCalled();
  });

  it("reopen request, approval, and reopen services are disabled without mutating status or attendance", async () => {
    vi.spyOn(repository, "findRunById").mockResolvedValue({
      id: "payroll_1",
      company_id: "company_1",
      payroll_month: "2026-06",
      status: "finalized",
    } as any);
    const reopenRun = vi.spyOn(repository, "reopenRun").mockResolvedValue({ meta: { changes: 1 } } as any);
    const updateAttendance = vi.spyOn(repository, "updateAttendancePayrollStatus").mockResolvedValue({ meta: { changes: 1 } } as any);

    for (const action of [
      () => service.requestReopen(env, context, "payroll_1", { reason: "Request reopen" }),
      () => service.approveReopen(env, context, "payroll_1", { reason: "Approve reopen" }),
      () => service.reopenPayroll(env, context, "payroll_1", { reason: "Reopen" }),
    ]) {
      await expect(action()).rejects.toMatchObject({
        code: "PAYROLL_REOPEN_NOT_IMPLEMENTED",
        message: "Payroll reopen/reversal requires a dedicated safe reversal workflow and is not available yet.",
      });
    }
    expect(reopenRun).not.toHaveBeenCalled();
    expect(updateAttendance).not.toHaveBeenCalled();
  });

  it("finalization service does not return success when final status update does not finalize the run", async () => {
    vi.spyOn(settingsService, "shouldRequireApproval").mockResolvedValue(false);
    vi.spyOn(settingsService, "getPayrollSettings").mockResolvedValue({});
    vi.spyOn(syncService, "getPayrollSyncBlockers").mockResolvedValue({} as any);
    vi.spyOn(repository, "findRunById")
      .mockResolvedValueOnce({
        id: "payroll_1",
        company_id: "company_1",
        payroll_month: "2026-06",
        status: "approved",
        currency: "MVR",
        calculation_version: 4,
      } as any)
      .mockResolvedValueOnce({
        id: "payroll_1",
        company_id: "company_1",
        payroll_month: "2026-06",
        status: "finalizing",
        currency: "MVR",
        calculation_version: 4,
      } as any)
      .mockResolvedValueOnce({
        id: "payroll_1",
        company_id: "company_1",
        payroll_month: "2026-06",
        status: "finalizing",
        currency: "MVR",
        calculation_version: 4,
      } as any);
    vi.spyOn(repository, "countItemsForRun").mockResolvedValue(1);
    vi.spyOn(repository, "countOpenCriticalExceptions").mockResolvedValue(0);
    vi.spyOn(repository, "countPendingAttendanceConflicts").mockResolvedValue(0);
    vi.spyOn(repository, "countPendingAttendanceCorrections").mockResolvedValue(0);
    vi.spyOn(repository, "countProblemAttendanceSummaries").mockResolvedValue(0);
    vi.spyOn(repository, "countEmployeesMissingSalaryHistory").mockResolvedValue(0);
    vi.spyOn(repository, "listUnconfirmedLongLeave").mockResolvedValue([]);
    vi.spyOn(repository, "claimRunFinalization").mockResolvedValue(true);
    vi.spyOn(repository, "listRepaymentSourcesForRun").mockResolvedValue([]);
    vi.spyOn(repository, "listExistingRepaymentApplications").mockResolvedValue([]);
    vi.spyOn(repository, "listPayslipSnapshotItemsForRun").mockResolvedValue([]);
    vi.spyOn(repository, "finalizeRunBatch").mockResolvedValue([] as any);
    const markFailed = vi.spyOn(repository, "markRunFinalizationFailed").mockResolvedValue({ meta: { changes: 1 } } as any);

    await expect(service.finalizePayroll(env, context, "payroll_1", { reason: "Finalize" })).rejects.toMatchObject({
      code: "PAYROLL_FINALIZATION_INCOMPLETE",
    });
    expect(markFailed).toHaveBeenCalledWith(
      env,
      "company_1",
      "payroll_1",
      "Payroll finalization failed. Please review the payroll source data and try again.",
    );
  });

  it("repayment planning skips existing ledger rows and caps partial item repayments", () => {
    const applications = service.buildRepaymentApplications(
      { id: "payroll_1", currency: "MVR" } as any,
      [
        {
          payroll_run_id: "payroll_1",
          payroll_item_id: "item_1",
          employee_id: "emp_1",
          source_type: "salary_advance",
          source_id: "adv_existing",
          amount: 5000,
          item_total_deductions_amount: 12000,
          currency: "MVR",
        },
        {
          payroll_run_id: "payroll_1",
          payroll_item_id: "item_1",
          employee_id: "emp_1",
          source_type: "salary_loan_installment",
          source_id: "loan_1",
          amount: 20000,
          item_total_deductions_amount: 12000,
          currency: "MVR",
        },
        {
          payroll_run_id: "payroll_1",
          payroll_item_id: "item_1",
          employee_id: "emp_1",
          source_type: "salary_advance",
          source_id: "adv_after_cap",
          amount: 2000,
          item_total_deductions_amount: 12000,
          currency: "MVR",
        },
      ],
      [{ source_type: "salary_advance", source_id: "adv_existing", applied_amount: 5000 }],
    );

    expect(applications).toHaveLength(1);
    expect(applications[0]).toMatchObject({
      payrollItemId: "item_1",
      sourceType: "salary_loan_installment",
      sourceId: "loan_1",
      appliedAmount: 12000,
    });
  });

  it("service validates full payroll lifecycle access before company-wide status mutations", () => {
    const serviceSource = read("src/modules/payroll/payroll.service.ts");

    for (const fn of [
      "submitApproval",
      "approvePayroll",
      "rejectPayroll",
      "lockPayroll",
      "finalizePayroll",
      "requestReopen",
      "approveReopen",
      "reopenPayroll",
    ]) {
      const start = serviceSource.indexOf(`export const ${fn}`);
      expect(start, `${fn} should exist`).toBeGreaterThan(-1);
      const body = serviceSource.slice(start, start + 500);
      expect(body).toContain("assertFullPayrollLifecycleAccess");
    }
  });

  it("finalization retry paths skip existing repayment applications instead of double-applying them", () => {
    const service = read("src/modules/payroll/payroll.service.ts");
    const repositorySource = read("src/modules/payroll/payroll.repository.ts");

    expect(service).toContain("listExistingRepaymentApplications");
    expect(service).toContain("existingKeys.has(key)");
    expect(repositorySource).toContain("INSERT OR IGNORE INTO payroll_repayment_applications");
    expect(repositorySource).toContain("status = 'finalized'");
  });

  it("frontend exposes finalize action and finalized lifecycle state", () => {
    expect(read("frontend/src/features/payroll/payroll.api.ts")).toContain("finalize:");
    expect(read("frontend/src/features/payroll/PayrollPage.tsx")).toContain("payroll.finalize");
    expect(read("frontend/src/features/payroll/PayrollRunsTable.tsx")).toContain("label: \"Finalize\"");
    expect(read("frontend/src/features/payroll/PayrollFlowStepper.tsx")).toContain("Finalized");
    expect(read("frontend/src/features/payroll/PayrollFilters.tsx")).toContain("finalized");
  });
});
