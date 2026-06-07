import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/payroll/payroll.repository", () => ({
  findSalaryForMonth: vi.fn(),
  listSalaryHistoryForPeriod: vi.fn(),
  listCompensationComponentsForPeriod: vi.fn(async () => []),
  listLongLeaveImpacts: vi.fn(async () => []),
  listAttendanceSummaries: vi.fn(async () => []),
  listApprovedAttendanceCorrections: vi.fn(async () => []),
  listApprovedLeaveRequests: vi.fn(async () => []),
  listApprovedAdvances: vi.fn(async () => []),
  listLoanInstallments: vi.fn(async () => []),
  listAssetDeductions: vi.fn(async () => []),
}));

import { calculateEmployeePayroll } from "../src/modules/payroll/payroll.calculator";
import * as repository from "../src/modules/payroll/payroll.repository";

const employee = {
  id: "emp_1",
  employee_code: "EMP-000001",
  full_name: "Aisha Hassan",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  employment_status: "active",
  joined_at: "2026-01-01",
  resigned_at: null,
  terminated_at: null,
  deleted_at: null,
};

const settings = {
  salaryBasis: "fixed_30_days",
  deductAbsentDays: true,
  deductLateMinutes: false,
  deductEarlyCheckout: false,
  allowNegativeSalary: false,
  carryForwardUnpaidDeductions: true,
} as const;

const calculate = (payrollMonth: string) =>
  calculateEmployeePayroll({} as Env, {
    companyId: "company_1",
    payrollRunId: "pay_run_1",
    payrollMonth,
    employee,
    settings,
  });

describe("payroll salary lookup uses employee salary history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.listSalaryHistoryForPeriod).mockImplementation(async (_env, _companyId, _employeeId, monthEndDate) => {
      if (monthEndDate < "2026-07-01") {
        return [{ id: "sal_old", monthly_salary_amount: 750000, currency: "MVR", effective_from: "2026-01-01", effective_to: "2026-06-30" }];
      }
      return [{ id: "sal_new", monthly_salary_amount: 850000, currency: "MVR", effective_from: "2026-07-01", effective_to: null }];
    });
  });

  it("payroll before salary change effective date uses the old salary", async () => {
    const result = await calculate("2026-06");

    expect(repository.listSalaryHistoryForPeriod).toHaveBeenCalledWith(
      expect.anything(),
      "company_1",
      "emp_1",
      "2026-06-30",
      "2026-06-01",
    );
    expect(result.item.basic_salary_amount).toBe(750000);
  });

  it("payroll on and after salary change effective month uses the new salary", async () => {
    const july = await calculate("2026-07");
    const august = await calculate("2026-08");

    expect(july.item.basic_salary_amount).toBe(850000);
    expect(august.item.basic_salary_amount).toBe(850000);
  });

  it("missing salary history creates a critical exception instead of using position salary", async () => {
    vi.mocked(repository.listSalaryHistoryForPeriod).mockResolvedValueOnce([]);

    const result = await calculateEmployeePayroll({} as Env, {
      companyId: "company_1",
      payrollRunId: "pay_run_1",
      payrollMonth: "2026-06",
      employee: {
        ...employee,
        position_id: "pos_with_default_salary",
        position_salary_amount: 999999,
      } as any,
      settings,
    });

    expect(result.item.basic_salary_amount).toBe(0);
    expect(result.item.payable_basic_amount).toBe(0);
    expect(result.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exception_type: "missing_salary",
          severity: "critical",
        }),
      ]),
    );
  });
});
