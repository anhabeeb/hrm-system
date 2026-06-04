import { DEFAULT_SALARY_BASIS } from "./payroll.constants";
import * as repository from "./payroll.repository";
import type {
  PayrollCalculationResult,
  PayrollCalculationSettings,
  PayrollEmployee,
  PayrollItemRecord,
} from "./payroll.types";
import { createPrefixedId } from "../../utils/ids";

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
export const monthStartDate = (payrollMonth: string) => `${payrollMonth}-01`;
export const monthEndDate = (payrollMonth: string) => {
  const [year, month] = payrollMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export const countInclusiveDays = (startDate: string, endDate: string) =>
  Math.floor((toDate(endDate).getTime() - toDate(startDate).getTime()) / 86_400_000) + 1;

export const countWeekdays = (startDate: string, endDate: string) => {
  let total = 0;
  const current = toDate(startDate);
  const end = toDate(endDate);
  while (current <= end) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) total += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return total;
};

export const getSalaryCalculationDays = (
  payrollMonth: string,
  settings: PayrollCalculationSettings,
) => {
  if (settings.salaryBasis === "calendar_days") {
    return countInclusiveDays(monthStartDate(payrollMonth), monthEndDate(payrollMonth));
  }
  if (settings.salaryBasis === "working_days") {
    return countWeekdays(monthStartDate(payrollMonth), monthEndDate(payrollMonth));
  }
  if (settings.salaryBasis === "custom_days" && settings.customSalaryDays && settings.customSalaryDays > 0) {
    return settings.customSalaryDays;
  }
  return 30;
};

export const calculateDailySalary = (monthlySalary: number, salaryDays: number) =>
  Math.floor(monthlySalary / Math.max(1, salaryDays));

const overlapDays = (startA: string, endA: string, startB: string, endB: string) => {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return start <= end ? countInclusiveDays(start, end) : 0;
};

const eligiblePayableDays = (employee: PayrollEmployee, payrollMonth: string, salaryDays: number) => {
  let start = monthStartDate(payrollMonth);
  let end = monthEndDate(payrollMonth);
  if (employee.joined_at && employee.joined_at > start && employee.joined_at.slice(0, 7) === payrollMonth) {
    start = employee.joined_at.slice(0, 10);
  }
  const exitDate = employee.resigned_at ?? employee.terminated_at;
  if (exitDate && exitDate < end && exitDate.slice(0, 7) === payrollMonth) {
    end = exitDate.slice(0, 10);
  }
  return Math.min(salaryDays, Math.max(0, overlapDays(start, end, monthStartDate(payrollMonth), monthEndDate(payrollMonth))));
};

export const calculateEmployeePayroll = async (
  env: Env,
  input: {
    companyId: string;
    payrollRunId: string;
    payrollMonth: string;
    employee: PayrollEmployee;
    settings: PayrollCalculationSettings;
  },
): Promise<PayrollCalculationResult> => {
  const salaryDays = getSalaryCalculationDays(input.payrollMonth, input.settings);
  const salary = await repository.findSalaryForMonth(
    env,
    input.companyId,
    input.employee.id,
    monthEndDate(input.payrollMonth),
    monthStartDate(input.payrollMonth),
  );
  const exceptions: PayrollCalculationResult["exceptions"] = [];
  const earnings: PayrollCalculationResult["earnings"] = [];
  const deductions: PayrollCalculationResult["deductions"] = [];
  const monthlySalary = salary?.monthly_salary_amount ?? 0;

  if (!salary) {
    exceptions.push({
      exception_type: "missing_salary",
      severity: "critical",
      message: "This employee does not have an active salary record for the selected payroll period. Add a salary record for the employee, then retry payroll.",
      employee_id: input.employee.id,
      outlet_id: input.employee.primary_outlet_id,
    });
  }

  const dailySalary = calculateDailySalary(monthlySalary, salaryDays);
  const payableDays = eligiblePayableDays(input.employee, input.payrollMonth, salaryDays);
  let payableBasic = dailySalary * payableDays;

  const longLeaveImpacts = await repository.listLongLeaveImpacts(
    env,
    input.companyId,
    input.employee.id,
    input.payrollMonth,
  );
  for (const impact of longLeaveImpacts) {
    if (impact.salary_impact_confirmed !== 1) {
      exceptions.push({
        exception_type: "unconfirmed_long_leave_salary_impact",
        severity: "critical",
        message: "Long leave salary impact must be confirmed before payroll can be locked.",
        employee_id: input.employee.id,
        outlet_id: input.employee.primary_outlet_id,
      });
    } else {
      payableBasic = impact.override_amount ?? impact.estimated_payable_amount;
    }
  }

  const attendance = await repository.listAttendanceSummaries(
    env,
    input.companyId,
    input.employee.id,
    monthStartDate(input.payrollMonth),
    monthEndDate(input.payrollMonth),
  );
  const absentDays = attendance.filter((row) => row.status === "absent").length;
  if (input.settings.deductAbsentDays && absentDays > 0 && longLeaveImpacts.length === 0) {
    const amount = dailySalary * absentDays;
    deductions.push({ deduction_type: "absent_days", amount, source_type: "attendance", notes: `${absentDays} absent day(s)` });
  }

  const unpaidLeave = await repository.listApprovedLeaveRequests(
    env,
    input.companyId,
    input.employee.id,
    monthStartDate(input.payrollMonth),
    monthEndDate(input.payrollMonth),
  );
  for (const leave of unpaidLeave) {
    if (leave.is_paid !== 1 && leave.affects_payroll === 1) {
      const days = overlapDays(leave.start_date, leave.end_date, monthStartDate(input.payrollMonth), monthEndDate(input.payrollMonth));
      deductions.push({ deduction_type: "unpaid_leave", amount: dailySalary * days, source_type: "leave_request", source_id: leave.id, notes: `${days} unpaid leave day(s)` });
    }
  }

  const advances = await repository.listApprovedAdvances(env, input.companyId, input.employee.id, input.payrollMonth);
  for (const advance of advances) {
    deductions.push({ deduction_type: "advance_payment", amount: advance.amount, source_type: "advance_payment", source_id: advance.id });
  }

  const loanInstallments = await repository.listLoanInstallments(env, input.companyId, input.employee.id, input.payrollMonth);
  for (const installment of loanInstallments) {
    deductions.push({ deduction_type: "salary_loan", amount: installment.amount, source_type: "salary_loan_installment", source_id: installment.id });
  }

  const assetDeductions = await repository.listAssetDeductions(env, input.companyId, input.employee.id, input.payrollMonth);
  for (const assetDeduction of assetDeductions) {
    deductions.push({ deduction_type: "asset_deduction", amount: assetDeduction.amount, source_type: "asset_deduction", source_id: assetDeduction.id });
  }

  earnings.push({ earning_type: "basic_salary", amount: payableBasic, source_type: "salary_history" });
  const totalDeductions = deductions.reduce((total, deduction) => total + deduction.amount, 0);
  const gross = payableBasic;
  let net = gross - totalDeductions;
  let carryForward = 0;

  if (!input.settings.allowNegativeSalary && net < 0) {
    if (input.settings.carryForwardUnpaidDeductions) {
      carryForward = Math.abs(net);
    }
    exceptions.push({
      exception_type: totalDeductions > gross ? "deduction_exceeds_salary" : "negative_salary",
      severity: "warning",
      message: "Deductions exceed payable salary for this employee.",
      employee_id: input.employee.id,
      outlet_id: input.employee.primary_outlet_id,
    });
    net = 0;
  }

  const item: PayrollItemRecord = {
    id: createPrefixedId("pay_item"),
    company_id: input.companyId,
    payroll_run_id: input.payrollRunId,
    employee_id: input.employee.id,
    outlet_id: input.employee.primary_outlet_id,
    basic_salary_amount: monthlySalary,
    payable_basic_amount: payableBasic,
    gross_amount: gross,
    total_deductions_amount: totalDeductions,
    net_amount: net,
    carry_forward_deduction_amount: carryForward,
    status: exceptions.some((exception) => exception.severity === "critical") ? "exception" : "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { item, earnings, deductions, exceptions };
};

export const parsePayrollSettings = (settings: Record<string, unknown>): PayrollCalculationSettings => ({
  salaryBasis: String(settings.salary_calculation_basis ?? settings.calculation_basis ?? DEFAULT_SALARY_BASIS),
  customSalaryDays: typeof settings.custom_salary_days === "number" ? settings.custom_salary_days : undefined,
  deductAbsentDays: settings.deduct_absent_days !== false,
  deductLateMinutes: settings.deduct_late_minutes === true,
  deductEarlyCheckout: settings.deduct_early_checkout === true,
  allowNegativeSalary: settings.allow_negative_salary === true,
  carryForwardUnpaidDeductions: settings.carry_forward_unpaid_deductions !== false,
});
