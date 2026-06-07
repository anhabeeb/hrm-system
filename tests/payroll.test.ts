import { describe, expect, it } from "vitest";

import {
  calculateDailySalary,
  countInclusiveDays,
  countWeekdays,
  getSalaryCalculationDays,
  monthEndDate,
  monthStartDate,
} from "../src/modules/payroll/payroll.calculator";
import * as repository from "../src/modules/payroll/payroll.repository";
import { validatePayrollCalculateInput } from "../src/modules/payroll/payroll.validators";
import { ValidationError } from "../src/utils/errors";

describe("payroll calculator helpers", () => {
  it("uses fixed 30 days as the default salary basis", () => {
    expect(
      getSalaryCalculationDays("2026-06", {
        salaryBasis: "fixed_30_days",
        deductAbsentDays: true,
        deductLateMinutes: false,
        deductEarlyCheckout: false,
        allowNegativeSalary: false,
        carryForwardUnpaidDeductions: true,
      }),
    ).toBe(30);
  });

  it("supports calendar day salary basis", () => {
    expect(
      getSalaryCalculationDays("2026-02", {
        salaryBasis: "calendar_days",
        deductAbsentDays: true,
        deductLateMinutes: false,
        deductEarlyCheckout: false,
        allowNegativeSalary: false,
        carryForwardUnpaidDeductions: true,
      }),
    ).toBe(28);
  });

  it("keeps money calculations in integer minor units", () => {
    expect(calculateDailySalary(900000, 30)).toBe(30000);
  });

  it("validates payroll month format", () => {
    expect(() => validatePayrollCalculateInput({ payroll_month: "June 2026" })).toThrow(ValidationError);
  });

  it("calculates month boundaries deterministically", () => {
    expect(monthStartDate("2026-06")).toBe("2026-06-01");
    expect(monthEndDate("2026-06")).toBe("2026-06-30");
    expect(countInclusiveDays("2026-06-01", "2026-06-30")).toBe(30);
    expect(countWeekdays("2026-06-01", "2026-06-07")).toBe(5);
  });
});

describe("payroll recalculation persistence safeguards", () => {
  const fakeEnv = () => {
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
        batch: async (statements: unknown[]) => ({ statements, prepared }),
      },
    } as unknown as Env;
    return { env, prepared };
  };

  it("clears only generated payroll rows during recalculation", async () => {
    const { env, prepared } = fakeEnv();

    await repository.clearRunCalculation(env, "company_1", "run_1");

    const itemDelete = prepared.find((statement) => statement.sql.startsWith("DELETE FROM payroll_items"));
    expect(prepared.map((statement) => statement.sql).join("\n")).toContain("COALESCE(generated_by_calculation, 1) = 1");
    expect(itemDelete?.sql).toContain("COALESCE(generated_by_calculation, 1) = 1");
  });

  it("publishes generated calculation rows through one controlled batch", async () => {
    const { env, prepared } = fakeEnv();

    await repository.persistRunCalculation(env, {
      companyId: "company_1",
      runId: "run_1",
      totals: { gross: 900000, deductions: 0, net: 900000 },
      results: [{
        item: {
          id: "item_1",
          company_id: "company_1",
          payroll_run_id: "run_1",
          employee_id: "emp_1",
          outlet_id: "outlet_1",
          basic_salary_amount: 900000,
          payable_basic_amount: 900000,
          gross_amount: 900000,
          total_deductions_amount: 0,
          net_amount: 900000,
          carry_forward_deduction_amount: 0,
          status: "draft",
          generated_by_calculation: 1,
          calculation_version: 2,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
        },
        earnings: [],
        deductions: [],
        exceptions: [],
        warnings: [],
      }],
    });

    const sql = prepared.map((statement) => statement.sql);
    expect(sql[0]).toContain("DELETE FROM payroll_earnings");
    expect(sql[1]).toContain("DELETE FROM payroll_deductions");
    expect(sql[2]).toContain("DELETE FROM payroll_items");
    expect(sql.some((statement) => statement.includes("INSERT INTO payroll_items"))).toBe(true);
    expect(sql.at(-1)).toContain("UPDATE payroll_runs SET total_gross_amount");
  });

  it("manual payroll totals include approved manual rows only", async () => {
    let capturedSql = "";
    const env = {
      DB: {
        prepare: (sql: string) => {
          capturedSql = sql;
          return {
            bind: () => ({
              first: async () => ({ gross: 1000, deductions: 100, net: 900 }),
            }),
          };
        },
      },
    } as unknown as Env;

    const totals = await repository.getManualItemTotals(env, "company_1", "run_1");

    expect(totals).toEqual({ gross: 1000, deductions: 100, net: 900 });
    expect(capturedSql).toContain("status = 'approved'");
    expect(capturedSql).not.toContain("'draft'");
  });
});

describe("payroll module placeholders", () => {
  it.todo("calculate draft payroll");
  it.todo("salary basis fixed_30_days");
  it.todo("salary basis calendar_days");
  it.todo("custom salary days");
  it.todo("missing salary creates critical exception");
  it.todo("joining month proration");
  it.todo("resignation month proration");
  it.todo("absent deduction");
  it.todo("unpaid leave deduction");
  it.todo("long leave salary impact overrides payable basic");
  it.todo("zero worked days long leave gives zero payable salary");
  it.todo("unconfirmed long leave creates critical exception");
  it.todo("approved advance deducts");
  it.todo("pending advance does not deduct");
  it.todo("salary loan installment deducts");
  it.todo("disabled overtime does not add overtime");
  it.todo("disabled benefits do not add benefits");
  it.todo("negative salary carry-forward works when negative is not allowed");
  it.todo("pending sync blocks payroll lock");
  it.todo("unresolved sync conflict blocks payroll lock");
  it.todo("unresolved attendance conflict blocks payroll lock");
  it.todo("pending attendance correction blocks payroll lock");
  it.todo("attendance_conflicts pending blocks payroll lock");
  it.todo("attendance_corrections pending blocks payroll lock");
  it.todo("missing_clock_in blocks payroll lock");
  it.todo("missing_clock_out blocks payroll lock");
  it.todo("conflict summary blocks payroll lock");
  it.todo("missing attendance summary blocks lock when attendance_to_payroll_enabled");
  it.todo("critical exception blocks payroll lock");
  it.todo("missing salary blocks payroll lock");
  it.todo("payroll remains unlocked when blockers exist");
  it.todo("approve payroll");
  it.todo("reject payroll");
  it.todo("lock payroll");
  it.todo("outlet-limited user cannot submit payroll for approval");
  it.todo("outlet-limited user cannot approve payroll");
  it.todo("outlet-limited user cannot reject payroll");
  it.todo("outlet-limited user cannot lock payroll");
  it.todo("outlet-limited user cannot request payroll reopen");
  it.todo("outlet-limited user cannot approve payroll reopen");
  it.todo("outlet-limited user cannot reopen payroll");
  it.todo("Super Admin can submit, approve, lock, and reopen payroll");
  it.todo("full-access Admin can submit, approve, lock, and reopen payroll when permissions exist");
  it.todo("blocked lifecycle action does not change payroll status");
  it.todo("blocked lifecycle action does not create approval_request");
  it.todo("blocked lifecycle action does not create misleading success audit log");
  it.todo("approve does not set lock fields");
  it.todo("lock sets locked_by and locked_at");
  it.todo("reopen clears locked_by and locked_at");
  it.todo("cannot recalculate locked payroll");
  it.todo("request reopen requires reason");
  it.todo("reopen requires approval or direct mode");
  it.todo("reopened payroll can be recalculated");
  it.todo("outlet-filtered calculation is blocked");
  it.todo("outlet-limited user cannot calculate company-wide payroll");
  it.todo("outlet-limited user cannot recalculate company-wide payroll");
  it.todo("clearRunCalculation is not called before full-access validation");
  it.todo("limited user sees only accessible outlet totals");
  it.todo("Super Admin sees company totals");
  it.todo("payroll detail returns totals_scope correctly");
  it.todo("payroll export excludes inaccessible outlets");
  it.todo("payroll export records outlet scope");
  it.todo("payroll item list is outlet-filtered");
  it.todo("users without payroll.view cannot view payroll");
  it.todo("realtime events do not include salary amounts");
  it.todo("audit logs created for sensitive payroll actions");
});
