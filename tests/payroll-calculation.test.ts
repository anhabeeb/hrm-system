import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildSalarySegments,
  calculateEmployeePayroll,
  parsePayrollSettings,
} from "../src/modules/payroll/payroll.calculator";
import * as repository from "../src/modules/payroll/payroll.repository";
import type { PayrollCalculationSettings, PayrollEmployee } from "../src/modules/payroll/payroll.types";

const employee: PayrollEmployee = {
  id: "emp_1",
  employee_code: "E001",
  full_name: "Aisha Mohamed",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  employment_status: "active",
  joined_at: "2026-01-01",
  resigned_at: null,
  terminated_at: null,
  deleted_at: null,
};

const settings: PayrollCalculationSettings = parsePayrollSettings({
  payroll_currency: "MVR",
  daily_rate_method: "fixed_30_days",
  absent_day_deduction_enabled: true,
  unpaid_leave_deduction_enabled: true,
  automatic_advance_deduction_enabled: true,
  automatic_loan_installment_deduction_enabled: true,
  prorate_basic_salary_for_mid_month_changes: true,
  prorate_recurring_components: true,
  negative_net_pay_policy: "carry_forward_excess_deduction",
});

const env = {} as Env;

const salaryRecord = { id: "sal_1", employee_id: "emp_1", monthly_salary_amount: 900000, currency: "MVR", effective_from: "2026-01-01", effective_to: null } as any;

const juneWeekdays = [
  "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05",
  "2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12",
  "2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19",
  "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26",
  "2026-06-29", "2026-06-30",
];

const presentRowsExcept = (excludedDates: string[] = []) =>
  juneWeekdays
    .filter((date) => !excludedDates.includes(date))
    .map((date) => ({ id: `att_${date}`, attendance_date: date, status: "present" }));

const stubCommonSources = () => {
  vi.spyOn(repository, "listCompensationComponentsForPeriod").mockResolvedValue([]);
  vi.spyOn(repository, "listLongLeaveImpacts").mockResolvedValue([]);
  vi.spyOn(repository, "listAttendanceSummaries").mockResolvedValue([]);
  vi.spyOn(repository, "listApprovedAttendanceCorrections").mockResolvedValue([]);
  vi.spyOn(repository, "listApprovedLeaveRequests").mockResolvedValue([]);
  vi.spyOn(repository, "listApprovedAdvances").mockResolvedValue([]);
  vi.spyOn(repository, "listLoanInstallments").mockResolvedValue([]);
  vi.spyOn(repository, "listAssetDeductions").mockResolvedValue([]);
};

const stubSalary = () => vi.spyOn(repository, "listSalaryHistoryForPeriod").mockResolvedValue([salaryRecord]);

const calculateWithComponents = async (components: any[]) => {
  stubCommonSources();
  stubSalary();
  vi.spyOn(repository, "listCompensationComponentsForPeriod").mockResolvedValue(components);
  return calculateEmployeePayroll(env, {
    companyId: "company_1",
    payrollRunId: "pay_1",
    payrollMonth: "2026-06",
    employee,
    settings,
  });
};

const component = (overrides: Record<string, unknown>) => ({
  id: "comp_1",
  component_definition_id: "def_1",
  component_type: "allowance",
  component_code: "COMP",
  component_name: "Recurring component",
  amount: 100000,
  currency: "MVR",
  calculation_type: "fixed_amount",
  affects_gross_pay: 1,
  affects_net_pay: 1,
  effective_from: "2026-01-01",
  effective_to: null,
  status: "active",
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Phase 6A payroll calculation hardening", () => {
  it("calculates a full-month salary from employee_salary_history only", async () => {
    stubCommonSources();
    stubSalary();

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
      calculationVersion: 3,
    });

    expect(result.item.basic_salary_amount).toBe(900000);
    expect(result.item.payable_basic_amount).toBe(900000);
    expect(result.item.gross_amount).toBe(900000);
    expect(result.earnings[0].source_type).toBe("basic_salary");
    expect(result.earnings[0].calculation_metadata_json).toContain("sal_1");
    expect(result.item.calculation_metadata_json).toContain("salary_segments");
    expect(result.item.calculation_metadata_json).toContain("classification_counts");
  });

  it("segments a mid-month salary change with fixed 30-day daily rate", () => {
    const segments = buildSalarySegments({
      payrollMonth: "2026-06",
      employee,
      settings,
      salaryRecords: [
        { id: "sal_old", monthly_salary_amount: 900000, currency: "MVR", effective_from: "2026-01-01", effective_to: "2026-06-14" },
        { id: "sal_new", monthly_salary_amount: 1200000, currency: "MVR", effective_from: "2026-06-15", effective_to: null },
      ] as any,
    });

    expect(segments).toMatchObject([
      { salary_record_id: "sal_old", segment_start: "2026-06-01", segment_end: "2026-06-14", payable_days: 14, daily_rate: 30000, segment_total: 420000 },
      { salary_record_id: "sal_new", segment_start: "2026-06-15", segment_end: "2026-06-30", payable_days: 16, daily_rate: 40000, segment_total: 640000 },
    ]);
  });

  it("creates a critical exception when salary history is missing", async () => {
    stubCommonSources();
    vi.spyOn(repository, "listSalaryHistoryForPeriod").mockResolvedValue([]);

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });

    expect(result.item.status).toBe("exception");
    expect(result.exceptions.some((entry) => entry.exception_type === "missing_salary" && entry.severity === "critical")).toBe(true);
  });

  it("includes active cash compensation components and excludes non-cash benefits from payable salary", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listCompensationComponentsForPeriod").mockResolvedValue([
      {
        id: "comp_allowance",
        component_definition_id: "def_1",
        component_type: "allowance",
        component_code: "FOOD",
        component_name: "Food allowance",
        amount: 100000,
        currency: "MVR",
        calculation_type: "fixed_amount",
        affects_gross_pay: 1,
        affects_net_pay: 1,
        effective_from: "2026-01-01",
        effective_to: null,
        status: "active",
      },
      {
        id: "comp_non_cash",
        component_definition_id: "def_2",
        component_type: "benefit",
        component_code: "HOUSING_NC",
        component_name: "Housing provided",
        amount: 200000,
        currency: "MVR",
        calculation_type: "non_cash_benefit",
        affects_gross_pay: 0,
        affects_net_pay: 0,
        effective_from: "2026-01-01",
        effective_to: null,
        status: "active",
      },
    ] as any);

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });

    expect(result.item.gross_amount).toBe(1000000);
    expect(result.earnings.some((line) => line.source_id === "comp_allowance" && line.amount === 100000)).toBe(true);
    expect(result.earnings.some((line) => line.source_id === "comp_non_cash")).toBe(false);
    expect(result.warnings?.some((warning) => warning.warning_type === "non_cash_benefit_excluded")).toBe(true);
    expect(result.item.calculation_metadata_json).toContain("compensation_components");
    expect(result.item.calculation_metadata_json).toContain("comp_non_cash");
  });

  it("prevents double deduction between approved unpaid leave and attendance absence", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listAttendanceSummaries").mockResolvedValue([
      { id: "att_1", attendance_date: "2026-06-10", status: "absent" },
    ]);
    vi.spyOn(repository, "listApprovedLeaveRequests").mockResolvedValue([
      { id: "leave_1", start_date: "2026-06-10", end_date: "2026-06-10", is_paid: 0, affects_payroll: 1 },
    ]);

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });

    expect(result.deductions.filter((line) => line.deduction_type === "absent_days")).toHaveLength(0);
    expect(result.deductions.filter((line) => line.deduction_type === "unpaid_leave")).toMatchObject([{ amount: 30000 }]);
  });

  it("includes approved advances and loan installments without marking repayments paid", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listApprovedAdvances").mockResolvedValue([{ id: "adv_1", amount: 100000, deduction_month: "2026-06" }]);
    vi.spyOn(repository, "listLoanInstallments").mockResolvedValue([{ id: "inst_1", salary_loan_id: "loan_1", amount: 50000 }]);

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });

    expect(result.deductions.some((line) => line.source_type === "salary_advance" && line.source_id === "adv_1")).toBe(true);
    expect(result.deductions.some((line) => line.source_type === "salary_loan_installment" && line.source_id === "inst_1")).toBe(true);
    expect(result.item.net_amount).toBe(750000);
  });

  it("deducts explicit attendance status absent", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listAttendanceSummaries").mockResolvedValue([
      { id: "att_absent", attendance_date: "2026-06-10", status: "absent" },
    ]);

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });

    expect(result.deductions.filter((line) => line.deduction_type === "absent_days")).toMatchObject([{ amount: 30000 }]);
  });

  it("blocks missing expected working days when attendance completion is required", async () => {
    stubCommonSources();
    stubSalary();

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings: { ...settings, requireCompleteAttendanceBeforeCalculation: true },
    });

    expect(result.item.status).toBe("exception");
    expect(result.exceptions.some((entry) => entry.exception_type === "missing_attendance_summary")).toBe(true);
  });

  it("deducts missing expected working days only when policy counts missing attendance as absent", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listAttendanceSummaries").mockResolvedValue(presentRowsExcept(["2026-06-10"]));

    const notDeducted = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings: { ...settings, missingAttendanceCountsAsAbsent: false },
    });
    expect(notDeducted.deductions.some((line) => line.deduction_type === "absent_days")).toBe(false);

    const deducted = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings: { ...settings, missingAttendanceCountsAsAbsent: true },
    });
    expect(deducted.deductions.filter((line) => line.deduction_type === "absent_days")).toMatchObject([{ amount: 30000 }]);
  });

  it("paid leave prevents absence deduction for the same date", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listAttendanceSummaries").mockResolvedValue([
      { id: "att_absent", attendance_date: "2026-06-10", status: "absent" },
    ]);
    vi.spyOn(repository, "listApprovedLeaveRequests").mockResolvedValue([
      { id: "leave_paid", start_date: "2026-06-10", end_date: "2026-06-10", is_paid: 1, affects_payroll: 1 },
    ]);

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });

    expect(result.deductions.some((line) => line.deduction_type === "absent_days")).toBe(false);
    expect(result.deductions.some((line) => line.deduction_type === "unpaid_leave")).toBe(false);
  });

  it("approved correction changes absent to present and pending corrections are ignored", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listAttendanceSummaries").mockResolvedValue([
      { id: "att_absent", attendance_date: "2026-06-10", status: "absent" },
    ]);
    vi.spyOn(repository, "listApprovedAttendanceCorrections").mockResolvedValue([
      { id: "corr_approved", new_value_json: JSON.stringify({ attendance_date: "2026-06-10", status: "present" }) },
    ]);

    const corrected = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });
    expect(corrected.deductions.some((line) => line.deduction_type === "absent_days")).toBe(false);

    vi.mocked(repository.listApprovedAttendanceCorrections).mockResolvedValue([]);
    const pendingIgnored = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings,
    });
    expect(pendingIgnored.deductions.filter((line) => line.deduction_type === "absent_days")).toMatchObject([{ amount: 30000 }]);
  });

  it("does not classify holiday or rest days as absent by default", async () => {
    stubCommonSources();
    stubSalary();
    vi.spyOn(repository, "listAttendanceSummaries").mockResolvedValue(presentRowsExcept());

    const result = await calculateEmployeePayroll(env, {
      companyId: "company_1",
      payrollRunId: "pay_1",
      payrollMonth: "2026-06",
      employee,
      settings: { ...settings, missingAttendanceCountsAsAbsent: true },
    });

    expect(result.deductions.some((line) => line.deduction_type === "absent_days")).toBe(false);
  });

  it.each([
    ["gross-only allowance affects gross but not net", component({ id: "gross_allowance", affects_gross_pay: 1, affects_net_pay: 0 }), 1000000, 900000],
    ["net-only allowance affects net but not gross", component({ id: "net_allowance", affects_gross_pay: 0, affects_net_pay: 1 }), 900000, 1000000],
    ["gross-and-net allowance affects both", component({ id: "both_allowance", affects_gross_pay: 1, affects_net_pay: 1 }), 1000000, 1000000],
    ["gross-only benefit affects gross only", component({ id: "gross_benefit", component_type: "benefit", affects_gross_pay: 1, affects_net_pay: 0 }), 1000000, 900000],
    ["net-only benefit affects net only", component({ id: "net_benefit", component_type: "benefit", affects_gross_pay: 0, affects_net_pay: 1 }), 900000, 1000000],
  ])("%s", async (_name, recurringComponent, expectedGross, expectedNet) => {
    const result = await calculateWithComponents([recurringComponent]);

    expect(result.item.gross_amount).toBe(expectedGross);
    expect(result.item.net_amount).toBe(expectedNet);
    expect(result.deductions.some((line) => line.source_id === recurringComponent.id)).toBe(false);
  });

  it.each([
    ["gross-only deduction reduces gross only", component({ id: "gross_deduction", component_type: "deduction", affects_gross_pay: 1, affects_net_pay: 0 }), 800000, 900000],
    ["net-only deduction reduces net only", component({ id: "net_deduction", component_type: "deduction", affects_gross_pay: 0, affects_net_pay: 1 }), 900000, 800000],
    ["gross-and-net deduction reduces both", component({ id: "both_deduction", component_type: "deduction", affects_gross_pay: 1, affects_net_pay: 1 }), 800000, 800000],
  ])("%s", async (_name, recurringComponent, expectedGross, expectedNet) => {
    const result = await calculateWithComponents([recurringComponent]);

    expect(result.item.gross_amount).toBe(expectedGross);
    expect(result.item.net_amount).toBe(expectedNet);
    expect(result.earnings.some((line) => line.source_id === recurringComponent.id)).toBe(false);
  });

  it("keeps non-cash benefits informational and never turns net-disabled allowances into deductions", async () => {
    const result = await calculateWithComponents([
      component({ id: "gross_only_allowance", component_name: "Gross only", affects_gross_pay: 1, affects_net_pay: 0 }),
      component({ id: "non_cash", component_type: "benefit", calculation_type: "non_cash_benefit", affects_gross_pay: 1, affects_net_pay: 1, amount: 250000 }),
    ]);

    expect(result.item.gross_amount).toBe(1000000);
    expect(result.item.net_amount).toBe(900000);
    expect(result.deductions.some((line) => line.source_id === "gross_only_allowance")).toBe(false);
    expect(result.earnings.some((line) => line.source_id === "non_cash")).toBe(false);
    expect(result.summary?.non_cash_benefits).toBe(250000);
  });
});
