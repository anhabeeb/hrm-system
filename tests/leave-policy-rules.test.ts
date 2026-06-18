import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as policyService from "../src/modules/leave/leave-policy.service";
import * as repository from "../src/modules/leave/leave.repository";
import type { LeaveEmployeeRecord, LeaveTypeRecord } from "../src/modules/leave/leave.types";
import { calculateEmployeePayroll, parsePayrollSettings } from "../src/modules/payroll/payroll.calculator";
import * as payrollRepository from "../src/modules/payroll/payroll.repository";
import type { PayrollEmployee } from "../src/modules/payroll/payroll.types";

const env = {} as Env;
const companyId = "company_1";

const employee: LeaveEmployeeRecord = {
  id: "emp_1",
  employee_code: "E001",
  full_name: "Aisha Mohamed",
  employee_type: "local",
  primary_outlet_id: "outlet_1",
  department_id: "dept_1",
  position_id: "pos_1",
  employment_status: "active",
  deleted_at: null,
};

const leaveType = (overrides: Partial<LeaveTypeRecord> = {}): LeaveTypeRecord => ({
  id: "leave_sick",
  company_id: companyId,
  leave_key: "sick_leave",
  leave_name: "Sick Leave",
  is_statutory: 1,
  is_enabled: 1,
  is_paid: 1,
  default_days: 30,
  requires_attachment: 0,
  affects_payroll: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const mockCommon = (type: LeaveTypeRecord, usedDays = 0, rule: any = null) => {
  vi.spyOn(repository, "findLeaveType").mockResolvedValue(type);
  vi.spyOn(repository, "findEmployee").mockResolvedValue(employee);
  vi.spyOn(repository, "findLeaveTypePolicyRule").mockResolvedValue(rule);
  vi.spyOn(repository, "sumApprovedLeaveDaysForYear").mockResolvedValue(usedDays);
};

afterEach(() => vi.restoreAllMocks());

describe("leave policy rule evaluation", () => {
  it.each([
    ["1 day", "2026-06-01", "2026-06-01", false],
    ["2 days", "2026-06-01", "2026-06-02", false],
    ["3 consecutive days", "2026-06-01", "2026-06-03", true],
  ])("applies FRL document threshold for %s and never deducts salary by default", async (_label, startDate, endDate, expectedDocument) => {
    mockCommon(leaveType({ id: "leave_frl", leave_key: "frl", leave_name: "Family Responsibility Leave" }), 0);

    const result = await policyService.evaluateLeavePolicy(env, companyId, {
      employee_id: employee.id,
      leave_type_id: "leave_frl",
      start_date: startDate,
      end_date: endDate,
    });

    expect(result.paid_status).toBe("paid");
    expect(result.salary_deduction_required).toBe(false);
    expect(result.document_required).toBe(expectedDocument);
    if (expectedDocument) {
      expect(result.document_reason).toContain("exceeds 2 consecutive day");
    }
  });

  it.each([
    ["1 day below used threshold", "2026-06-01", "2026-06-01", 0, false],
    ["2 consecutive days below used threshold", "2026-06-01", "2026-06-02", 0, false],
    ["3 consecutive days below used threshold", "2026-06-01", "2026-06-03", 0, true],
    ["exactly 15 total used days", "2026-06-01", "2026-06-01", 14, false],
    ["more than 15 total used days", "2026-06-01", "2026-06-01", 15, true],
  ])("applies Sick Leave document thresholds for %s", async (_label, startDate, endDate, usedDays, expectedDocument) => {
    mockCommon(leaveType(), usedDays);

    const result = await policyService.evaluateLeavePolicy(env, companyId, {
      employee_id: employee.id,
      leave_type_id: "leave_sick",
      start_date: startDate,
      end_date: endDate,
    });

    expect(result.document_required).toBe(expectedDocument);
    if (expectedDocument && usedDays >= 15) {
      expect(result.document_reason).toContain("exceeds 15 used day");
    }
    expect(result.salary_deduction_required).toBe(false);
  });

  it("marks unpaid leave as salary deductible by default", async () => {
    mockCommon(leaveType({ id: "leave_unpaid", leave_key: "unpaid_leave", leave_name: "Unpaid Leave", is_paid: 0 }), 0);

    const result = await policyService.evaluateLeavePolicy(env, companyId, {
      employee_id: employee.id,
      leave_type_id: "leave_unpaid",
      start_date: "2026-06-01",
      end_date: "2026-06-03",
    });

    expect(result.paid_status).toBe("unpaid");
    expect(result.salary_deduction_required).toBe(true);
    expect(result.deductible_days).toBe(3);
    expect(result.payroll_source_label).toBe("unpaid_leave_policy");
  });

  it("supports explicit partial-paid policy rules", async () => {
    const annual = leaveType({ id: "leave_annual", leave_key: "annual_leave", leave_name: "Annual Leave" });
    mockCommon(annual, 0, {
      ...policyService.defaultPolicyRuleForLeaveType(annual),
      id: "rule_annual",
      paid_status: "partial_paid",
      paid_percentage: 50,
      salary_deduction_enabled: 1,
      deduction_mode: "partial_percentage",
      payroll_source_label: "annual_leave_partial_policy",
    });

    const result = await policyService.evaluateLeavePolicy(env, companyId, {
      employee_id: employee.id,
      leave_type_id: "leave_annual",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
    });

    expect(result.rule_id).toBe("rule_annual");
    expect(result.salary_deduction_required).toBe(true);
    expect(result.paid_percentage).toBe(50);
    expect(result.deduction_mode).toBe("partial_percentage");
  });
});

describe("leave policy rule wiring", () => {
  it("keeps payroll deduction source metadata tied to leave policy", () => {
    const payrollCalculator = readFileSync(resolve(process.cwd(), "src/modules/payroll/payroll.calculator.ts"), "utf8");
    expect(payrollCalculator).toContain('source_type: "leave_policy"');
    expect(payrollCalculator).toContain("leave_policy_deduction");
    expect(payrollCalculator).toContain("deduction_rule_id");
    expect(payrollCalculator).toContain("selected_allowance");
    expect(payrollCalculator).toContain("selected_pay_components");
    expect(payrollCalculator).toContain("component_amount_used");
  });

  it("stores document-required requests as pending document instead of submitting silently", () => {
    const leaveService = readFileSync(resolve(process.cwd(), "src/modules/leave/leave.service.ts"), "utf8");
    expect(leaveService).toContain("pending_document");
    expect(leaveService).toContain("LEAVE_DOCUMENT_REQUIRED");
    expect(leaveService).toContain("document_status");
    expect(leaveService).toContain("Supporting document is required for this leave request because it exceeds the configured policy threshold.");
  });
});

describe("leave policy payroll deduction sources", () => {
  const payrollEmployee: PayrollEmployee = {
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
  const payrollSettings = parsePayrollSettings({
    payroll_currency: "MVR",
    daily_rate_method: "fixed_30_days",
    absent_day_deduction_enabled: false,
    unpaid_leave_deduction_enabled: true,
    automatic_advance_deduction_enabled: false,
    automatic_loan_installment_deduction_enabled: false,
    prorate_recurring_components: false,
  });
  const stubPayrollSources = (leaveRows: any[]) => {
    vi.spyOn(payrollRepository, "listSalaryHistoryForPeriod").mockResolvedValue([
      { id: "sal_1", employee_id: "emp_1", monthly_salary_amount: 900000, currency: "MVR", effective_from: "2026-01-01", effective_to: null } as any,
    ]);
    vi.spyOn(payrollRepository, "listLongLeaveImpacts").mockResolvedValue([]);
    vi.spyOn(payrollRepository, "listAttendanceSummaries").mockResolvedValue([]);
    vi.spyOn(payrollRepository, "listApprovedAttendanceCorrections").mockResolvedValue([]);
    vi.spyOn(payrollRepository, "listApprovedLeaveRequests").mockResolvedValue(leaveRows);
    vi.spyOn(payrollRepository, "listApprovedAdvances").mockResolvedValue([]);
    vi.spyOn(payrollRepository, "listLoanInstallments").mockResolvedValue([]);
    vi.spyOn(payrollRepository, "listAssetDeductions").mockResolvedValue([]);
  };

  it("deducts selected allowance amount instead of basic salary", async () => {
    stubPayrollSources([
      {
        id: "leave_1",
        leave_type_id: "leave_sick",
        leave_type_name: "Sick Leave",
        start_date: "2026-06-10",
        end_date: "2026-06-10",
        is_paid: 1,
        affects_payroll: 1,
        policy_rule_id: "rule_1",
        policy_paid_status: "paid",
        policy_paid_percentage: 100,
        policy_salary_deduction_enabled: 1,
        policy_deduction_mode: "selected_allowance",
        policy_deduction_component: "ATT_ALLOW",
        policy_deduction_component_keys_json: '["ATT_ALLOW"]',
        policy_payroll_source_label: "attendance_allowance_policy",
      },
    ]);
    vi.spyOn(payrollRepository, "listCompensationComponentsForPeriod").mockResolvedValue([
      {
        id: "comp_1",
        component_definition_id: "def_1",
        component_type: "allowance",
        component_code: "ATT_ALLOW",
        component_name: "Attendance Allowance",
        amount: 300000,
        currency: "MVR",
        calculation_type: "fixed_amount",
        affects_gross_pay: 1,
        affects_net_pay: 1,
        effective_from: "2026-01-01",
        effective_to: null,
        status: "active",
      } as any,
    ]);

    const result = await calculateEmployeePayroll(env, {
      companyId,
      payrollRunId: "run_1",
      payrollMonth: "2026-06",
      employee: payrollEmployee,
      settings: payrollSettings,
    });

    const leavePolicyLine = result.deductions.find((line) => line.deduction_type === "leave_policy");
    expect(leavePolicyLine?.amount).toBe(10000);
    expect(leavePolicyLine?.amount).not.toBe(30000);
    expect(leavePolicyLine?.calculation_metadata_json).toContain("selected_allowance");
    expect(leavePolicyLine?.calculation_metadata_json).toContain("Attendance Allowance");
  });

  it("does not create a payroll deduction line for non-deductible FRL", async () => {
    stubPayrollSources([
      {
        id: "leave_frl_1",
        leave_type_id: "leave_frl",
        leave_type_name: "Family Responsibility Leave",
        start_date: "2026-06-10",
        end_date: "2026-06-10",
        is_paid: 1,
        affects_payroll: 0,
        policy_rule_id: "rule_frl",
        policy_paid_status: "paid",
        policy_paid_percentage: 100,
        policy_salary_deduction_enabled: 0,
        policy_deduction_mode: "none",
      },
    ]);
    vi.spyOn(payrollRepository, "listCompensationComponentsForPeriod").mockResolvedValue([]);

    const result = await calculateEmployeePayroll(env, {
      companyId,
      payrollRunId: "run_1",
      payrollMonth: "2026-06",
      employee: payrollEmployee,
      settings: payrollSettings,
    });

    expect(result.deductions.some((line) => line.deduction_type === "leave_policy")).toBe(false);
  });
});
