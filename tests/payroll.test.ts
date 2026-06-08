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


