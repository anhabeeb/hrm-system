import { DEFAULT_SALARY_BASIS } from "./payroll.constants";
import * as repository from "./payroll.repository";
import type {
  PayrollCalculationResult,
  PayrollCalculationSettings,
  PayrollCompensationComponentRecord,
  PayrollEmployee,
  PayrollGeneratedDeduction,
  PayrollGeneratedEarning,
  PayrollItemRecord,
  PayrollSalaryHistoryRecord,
} from "./payroll.types";
import { createPrefixedId } from "../../utils/ids";

const DAY_MS = 86_400_000;
const toDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const dateOnly = (value: string) => value.slice(0, 10);
const iso = (date: Date) => date.toISOString().slice(0, 10);

export const monthStartDate = (payrollMonth: string) => `${payrollMonth}-01`;
export const monthEndDate = (payrollMonth: string) => {
  const [year, month] = payrollMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export const countInclusiveDays = (startDate: string, endDate: string) =>
  Math.floor((toDate(endDate).getTime() - toDate(startDate).getTime()) / DAY_MS) + 1;

const addDays = (date: string, days: number) => {
  const next = toDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return iso(next);
};

const maxDate = (a: string, b: string) => (a > b ? a : b);

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

const listDates = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  const current = toDate(startDate);
  const end = toDate(endDate);
  while (current <= end) {
    dates.push(iso(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
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

export const applyPayrollRounding = (amount: number, settings: PayrollCalculationSettings) => {
  const roundingMethod = settings.roundingMethod ?? "none";
  if (roundingMethod === "round_down") return Math.floor(amount);
  if (roundingMethod === "round_up") return Math.ceil(amount);
  if (roundingMethod === "nearest_rufiyaa") return Math.round(amount / 100) * 100;
  if (roundingMethod === "nearest_lari") return Math.round(amount);
  return Math.trunc(amount);
};

const overlapRange = (startA: string, endA: string, startB: string, endB: string) => {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return start <= end ? { start, end, days: countInclusiveDays(start, end) } : null;
};

const employmentRange = (employee: PayrollEmployee, payrollMonth: string) => {
  let start = monthStartDate(payrollMonth);
  let end = monthEndDate(payrollMonth);
  if (employee.joined_at && dateOnly(employee.joined_at) > start && employee.joined_at.slice(0, 7) === payrollMonth) {
    start = dateOnly(employee.joined_at);
  }
  if (employee.employment_status === "rehired" && employee.status_effective_from && employee.status_effective_from.slice(0, 7) === payrollMonth) {
    start = maxDate(start, dateOnly(employee.status_effective_from));
  }
  const exitDate = employee.resigned_at ?? employee.terminated_at;
  if (exitDate && dateOnly(exitDate) < end && exitDate.slice(0, 7) === payrollMonth) {
    end = dateOnly(exitDate);
  }
  return start <= end ? { start, end } : null;
};

export interface SalarySegment {
  salary_record_id: string;
  monthly_salary_amount: number;
  currency: string;
  segment_start: string;
  segment_end: string;
  payable_days: number;
  daily_rate: number;
  segment_total: number;
}

export const buildSalarySegments = (input: {
  payrollMonth: string;
  employee: PayrollEmployee;
  salaryRecords: PayrollSalaryHistoryRecord[];
  settings: PayrollCalculationSettings;
}) => {
  const range = employmentRange(input.employee, input.payrollMonth);
  if (!range) return [];
  const salaryDays = getSalaryCalculationDays(input.payrollMonth, input.settings);
  const periodStart = monthStartDate(input.payrollMonth);
  const periodEnd = monthEndDate(input.payrollMonth);
  const records = input.settings.prorateBasicSalaryForMidMonthChanges
    ? input.salaryRecords
    : input.salaryRecords.slice().sort((a, b) => b.effective_from.localeCompare(a.effective_from)).slice(0, 1);

  const segments: SalarySegment[] = [];
  for (const record of records) {
    const recordEnd = record.effective_to ?? "9999-12-31";
    const overlap = overlapRange(dateOnly(record.effective_from), recordEnd, range.start, range.end);
    if (!overlap) continue;
    const dailyRate = calculateDailySalary(record.monthly_salary_amount, salaryDays);
    const payableDays = Math.min(overlap.days, salaryDays);
    segments.push({
      salary_record_id: record.id,
      monthly_salary_amount: record.monthly_salary_amount,
      currency: record.currency,
      segment_start: overlap.start < periodStart ? periodStart : overlap.start,
      segment_end: overlap.end > periodEnd ? periodEnd : overlap.end,
      payable_days: payableDays,
      daily_rate: dailyRate,
      segment_total: applyPayrollRounding(dailyRate * payableDays, input.settings),
    });
  }
  return segments;
};

const amountFromComponent = (
  component: PayrollCompensationComponentRecord,
  baseForPercentage: number,
  overlapDays: number,
  salaryDays: number,
  settings: PayrollCalculationSettings,
) => {
  const rawAmount = component.calculation_type === "percentage_of_basic_salary"
    ? Math.floor((baseForPercentage * component.amount) / 100)
    : component.amount;
  if (settings.prorateRecurringComponents === false || overlapDays >= salaryDays) return applyPayrollRounding(rawAmount, settings);
  return applyPayrollRounding(Math.floor((rawAmount * overlapDays) / Math.max(1, salaryDays)), settings);
};

const lineMetadata = (metadata: Record<string, unknown>) => JSON.stringify(metadata);

const safeJson = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const buildDateClassification = (input: {
  periodStart: string;
  periodEnd: string;
  attendanceRows: any[];
  correctionRows: any[];
  leaveRows: any[];
  settings: PayrollCalculationSettings;
}) => {
  const byDate = new Map<string, { classification: string; sources: string[] }>();
  for (const date of listDates(input.periodStart, input.periodEnd)) {
    const day = toDate(date).getUTCDay();
    if (input.settings.includeWeekendsInWorkingDays !== true && (day === 0 || day === 6)) {
      byDate.set(date, { classification: "rest_day", sources: [] });
    } else if (input.settings.requireCompleteAttendanceBeforeCalculation === true) {
      byDate.set(date, { classification: "incomplete", sources: [] });
    } else if (
      input.settings.missingAttendanceCountsAsAbsent === true
      && input.settings.absenceDeductionRequiresExplicitAbsentStatus !== true
      && input.settings.deductAbsentDays
    ) {
      byDate.set(date, { classification: "absent", sources: [] });
    } else {
      byDate.set(date, { classification: "unrecorded", sources: [] });
    }
  }
  for (const row of input.attendanceRows) {
    const date = dateOnly(row.attendance_date);
    const status = String(row.status ?? "");
    if (status === "present" || status === "checked_in") {
      byDate.set(date, { classification: "worked", sources: [row.id].filter(Boolean) });
    } else if (status === "absent") {
      byDate.set(date, { classification: "absent", sources: [row.id].filter(Boolean) });
    } else if (status === "holiday") {
      byDate.set(date, { classification: "holiday", sources: [row.id].filter(Boolean) });
    } else if (status === "off_day") {
      byDate.set(date, { classification: "rest_day", sources: [row.id].filter(Boolean) });
    } else if (["missing_clock_in", "missing_clock_out", "conflict"].includes(status)) {
      byDate.set(date, { classification: "incomplete", sources: [row.id].filter(Boolean) });
    }
  }
  for (const correction of input.correctionRows) {
    const payload = safeJson(correction.new_value_json);
    const rawDate = String(payload.attendance_date ?? payload.event_time ?? correction.updated_at ?? correction.created_at ?? "");
    const date = dateOnly(rawDate);
    if (!date || !byDate.has(date)) continue;
    const status = String(payload.status ?? payload.attendance_status ?? "");
    if (status === "present" || status === "checked_in") {
      byDate.set(date, { classification: "worked", sources: [correction.id].filter(Boolean) });
    } else if (status === "absent") {
      byDate.set(date, { classification: "absent", sources: [correction.id].filter(Boolean) });
    } else if (status === "holiday") {
      byDate.set(date, { classification: "holiday", sources: [correction.id].filter(Boolean) });
    } else if (status === "off_day" || status === "rest_day") {
      byDate.set(date, { classification: "rest_day", sources: [correction.id].filter(Boolean) });
    }
  }
  for (const leave of input.leaveRows) {
    const overlap = overlapRange(leave.start_date, leave.end_date, input.periodStart, input.periodEnd);
    if (!overlap) continue;
    for (const date of listDates(overlap.start, overlap.end)) {
      byDate.set(date, {
        classification: leave.is_paid === 1 || leave.affects_payroll !== 1 ? "paid_leave" : "unpaid_leave",
        sources: [leave.id],
      });
    }
  }
  return byDate;
};

export const calculateEmployeePayroll = async (
  env: Env,
  input: {
    companyId: string;
    payrollRunId: string;
    payrollMonth: string;
    employee: PayrollEmployee;
    settings: PayrollCalculationSettings;
    calculationVersion?: number;
  },
): Promise<PayrollCalculationResult> => {
  const periodStart = monthStartDate(input.payrollMonth);
  const periodEnd = monthEndDate(input.payrollMonth);
  const salaryDays = getSalaryCalculationDays(input.payrollMonth, input.settings);
  const salaryRecords = await repository.listSalaryHistoryForPeriod(
    env,
    input.companyId,
    input.employee.id,
    periodEnd,
    periodStart,
  );
  const exceptions: PayrollCalculationResult["exceptions"] = [];
  const warnings: NonNullable<PayrollCalculationResult["warnings"]> = [];
  const earnings: PayrollGeneratedEarning[] = [];
  const deductions: PayrollGeneratedDeduction[] = [];
  const compensationDetails: Record<string, unknown>[] = [];
  const advanceSources: Record<string, unknown>[] = [];
  const loanSources: Record<string, unknown>[] = [];
  const assetDeductionSources: Record<string, unknown>[] = [];
  const summary = {
    recurring_gross_additions: 0,
    recurring_gross_deductions: 0,
    recurring_net_additions: 0,
    recurring_net_deductions: 0,
    non_cash_benefits: 0,
    attendance_deductions: 0,
    unpaid_leave_deductions: 0,
    advance_deductions: 0,
    loan_deductions: 0,
    other_deductions: 0,
  };

  if (salaryRecords.length === 0) {
    exceptions.push({
      exception_type: "missing_salary",
      severity: "critical",
      message: "This employee does not have an active salary record for the selected payroll period. Add a salary record for the employee, then retry payroll.",
      employee_id: input.employee.id,
      outlet_id: input.employee.primary_outlet_id,
    });
  }

  if (salaryRecords.some((record) => record.currency !== (input.settings.currency ?? "MVR"))) {
    exceptions.push({
      exception_type: "missing_setting",
      severity: "critical",
      message: "Payroll currency does not match this employee's salary history.",
      employee_id: input.employee.id,
      outlet_id: input.employee.primary_outlet_id,
    });
  }

  const salarySegments = buildSalarySegments({
    payrollMonth: input.payrollMonth,
    employee: input.employee,
    salaryRecords,
    settings: input.settings,
  });
  const monthlySalary = salarySegments.at(-1)?.monthly_salary_amount ?? salaryRecords.at(-1)?.monthly_salary_amount ?? 0;
  const dailySalary = calculateDailySalary(monthlySalary, salaryDays);
  let payableBasic = salarySegments.reduce((total, segment) => total + segment.segment_total, 0);

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
    } else if (input.settings.longLeavePayDaysWorkedOnly !== false) {
      payableBasic = impact.override_amount ?? impact.estimated_payable_amount;
    }
  }

  earnings.push({
    earning_type: "basic_salary",
    amount: payableBasic,
    source_type: "basic_salary",
    source_reference: salarySegments.map((segment) => segment.salary_record_id).join(","),
    calculation_code: "basic_salary_segments",
    calculation_description: "Basic salary calculated from effective-dated employee salary history.",
    calculation_metadata_json: lineMetadata({ salary_segments: salarySegments, salary_days: salaryDays }),
    calculation_version: input.calculationVersion ?? 0,
  });

  const components = await repository.listCompensationComponentsForPeriod(
    env,
    input.companyId,
    input.employee.id,
    periodEnd,
    periodStart,
  );
  for (const component of components) {
    if (component.currency !== (input.settings.currency ?? "MVR")) {
      exceptions.push({
        exception_type: "missing_setting",
        severity: "critical",
        message: "Payroll currency does not match one or more recurring compensation components.",
        employee_id: input.employee.id,
        outlet_id: input.employee.primary_outlet_id,
      });
      continue;
    }
    const overlap = overlapRange(component.effective_from, component.effective_to ?? "9999-12-31", periodStart, periodEnd);
    if (!overlap) continue;
    const amount = amountFromComponent(component, payableBasic, overlap.days, salaryDays, input.settings);
    const metadata = {
      component_id: component.id,
      component_definition_id: component.component_definition_id,
      component_name: component.component_name,
      component_type: component.component_type,
      calculation_type: component.calculation_type,
      effective_from: component.effective_from,
      effective_to: component.effective_to,
      overlap_start: overlap.start,
      overlap_end: overlap.end,
      overlap_days: overlap.days,
      affects_gross_pay: component.affects_gross_pay === 1,
      affects_net_pay: component.affects_net_pay === 1,
    };
    compensationDetails.push({
      ...metadata,
      amount,
      gross_effect: component.calculation_type === "non_cash_benefit"
        ? "none"
        : component.affects_gross_pay === 1
          ? component.component_type === "deduction" ? "subtract" : "add"
          : "none",
      net_effect: component.calculation_type === "non_cash_benefit"
        ? "none"
        : component.affects_net_pay === 1
          ? component.component_type === "deduction" ? "subtract" : "add"
          : "none",
    });
    if (component.calculation_type === "non_cash_benefit") {
      summary.non_cash_benefits += amount;
      warnings.push({
        warning_type: "non_cash_benefit_excluded",
        message: `${component.component_name} is tracked as a non-cash benefit and does not increase payable salary.`,
        metadata,
      });
      continue;
    }
    if (component.component_type === "deduction") {
      if (component.affects_gross_pay === 1) summary.recurring_gross_deductions += amount;
      if (component.affects_net_pay === 1) summary.recurring_net_deductions += amount;
      if (component.affects_gross_pay !== 1 && component.affects_net_pay !== 1) {
        warnings.push({
          warning_type: "informational_compensation_component",
          message: `${component.component_name} is configured as informational and does not affect payroll totals.`,
          metadata,
        });
      }
      deductions.push({
        deduction_type: "recurring_compensation",
        amount,
        source_type: "compensation_component",
        source_id: component.id,
        source_reference: component.component_code ?? component.component_name,
        calculation_code: "recurring_component_deduction",
        calculation_description: `Recurring deduction: ${component.component_name}.`,
        calculation_metadata_json: lineMetadata(metadata),
        calculation_version: input.calculationVersion ?? 0,
      });
    } else if (component.affects_gross_pay === 1 || component.affects_net_pay === 1) {
      if (component.affects_gross_pay === 1) summary.recurring_gross_additions += amount;
      if (component.affects_net_pay === 1) summary.recurring_net_additions += amount;
      earnings.push({
        earning_type: component.component_type === "benefit" ? "cash_benefit" : "recurring_allowance",
        amount,
        source_type: "compensation_component",
        source_id: component.id,
        source_reference: component.component_code ?? component.component_name,
        calculation_code: "recurring_component_earning",
        calculation_description: `Recurring earning: ${component.component_name}.`,
        calculation_metadata_json: lineMetadata(metadata),
        calculation_version: input.calculationVersion ?? 0,
      });
    } else {
      warnings.push({
        warning_type: "informational_compensation_component",
        message: `${component.component_name} is configured as informational and does not affect payroll totals.`,
        metadata,
      });
    }
  }

  const attendance = await repository.listAttendanceSummaries(env, input.companyId, input.employee.id, periodStart, periodEnd);
  const corrections = await repository.listApprovedAttendanceCorrections(env, input.companyId, input.employee.id, periodStart, periodEnd);
  const leaveRows = await repository.listApprovedLeaveRequests(env, input.companyId, input.employee.id, periodStart, periodEnd);
  const classifications = buildDateClassification({ periodStart, periodEnd, attendanceRows: attendance, correctionRows: corrections, leaveRows, settings: input.settings });
  const leaveSummary = leaveRows.map((leave) => ({
    leave_request_id: leave.id,
    leave_type_id: leave.leave_type_id ?? null,
    start_date: leave.start_date,
    end_date: leave.end_date,
    is_paid: leave.is_paid === 1,
    affects_payroll: leave.affects_payroll === 1,
  }));
  const absentDates = [...classifications.entries()]
    .filter(([, value]) => value.classification === "absent")
    .map(([date]) => date);
  const unpaidLeaveDates = [...classifications.entries()]
    .filter(([, value]) => value.classification === "unpaid_leave")
    .map(([date]) => date);
  const incompleteDates = [...classifications.entries()]
    .filter(([, value]) => value.classification === "incomplete")
    .map(([date]) => date);

  if (input.settings.requireCompleteAttendanceBeforeCalculation === true && incompleteDates.length > 0) {
    exceptions.push({
      exception_type: "missing_attendance_summary",
      severity: "critical",
      message: "Attendance is incomplete for this employee in the selected payroll period.",
      employee_id: input.employee.id,
      outlet_id: input.employee.primary_outlet_id,
    });
  } else if (incompleteDates.length > 0) {
    warnings.push({
      warning_type: "attendance_incomplete",
      message: "Attendance is incomplete for this employee in the selected payroll period.",
      metadata: { dates: incompleteDates },
    });
  }

  if (input.settings.deductAbsentDays && absentDates.length > 0 && longLeaveImpacts.length === 0) {
    const amount = applyPayrollRounding(dailySalary * absentDates.length, input.settings);
    summary.attendance_deductions += amount;
    deductions.push({
      deduction_type: "absent_days",
      amount,
      source_type: "attendance_absence",
      source_reference: absentDates.join(","),
      calculation_code: "attendance_absence_deduction",
      calculation_description: `${absentDates.length} absent day(s) deducted. Approved unpaid leave dates are excluded to prevent double deduction.`,
      calculation_metadata_json: lineMetadata({ dates: absentDates, daily_salary: dailySalary }),
      calculation_version: input.calculationVersion ?? 0,
    });
  }

  if (input.settings.unpaidLeaveDeductionEnabled !== false && unpaidLeaveDates.length > 0 && longLeaveImpacts.length === 0) {
    const amount = applyPayrollRounding(dailySalary * unpaidLeaveDates.length, input.settings);
    summary.unpaid_leave_deductions += amount;
    deductions.push({
      deduction_type: "unpaid_leave",
      amount,
      source_type: "unpaid_leave",
      source_reference: unpaidLeaveDates.join(","),
      calculation_code: "unpaid_leave_deduction",
      calculation_description: `${unpaidLeaveDates.length} approved unpaid leave day(s) deducted.`,
      calculation_metadata_json: lineMetadata({ dates: unpaidLeaveDates, daily_salary: dailySalary }),
      calculation_version: input.calculationVersion ?? 0,
    });
  }

  if (input.settings.automaticAdvanceDeductionEnabled !== false) {
    const advances = await repository.listApprovedAdvances(env, input.companyId, input.employee.id, input.payrollMonth);
    for (const advance of advances) {
      summary.advance_deductions += advance.amount;
      advanceSources.push({ advance_id: advance.id, deduction_month: advance.deduction_month, amount: advance.amount });
      deductions.push({
        deduction_type: "advance_payment",
        amount: advance.amount,
        source_type: "salary_advance",
        source_id: advance.id,
        calculation_code: "salary_advance_due",
        calculation_description: "Approved salary advance due for this payroll month.",
        calculation_metadata_json: lineMetadata({ advance_id: advance.id, deduction_month: advance.deduction_month }),
        calculation_version: input.calculationVersion ?? 0,
      });
    }
  }

  if (input.settings.automaticLoanInstallmentDeductionEnabled !== false) {
    const loanInstallments = await repository.listLoanInstallments(env, input.companyId, input.employee.id, input.payrollMonth);
    const seenInstallments = new Set<string>();
    for (const installment of loanInstallments) {
      if (seenInstallments.has(installment.id)) continue;
      seenInstallments.add(installment.id);
      summary.loan_deductions += installment.amount;
      loanSources.push({ installment_id: installment.id, salary_loan_id: installment.salary_loan_id, amount: installment.amount });
      deductions.push({
        deduction_type: "salary_loan",
        amount: installment.amount,
        source_type: "salary_loan_installment",
        source_id: installment.id,
        source_reference: installment.salary_loan_id,
        calculation_code: "salary_loan_installment_due",
        calculation_description: "Approved salary loan installment due for this payroll month.",
        calculation_metadata_json: lineMetadata({ installment_id: installment.id, salary_loan_id: installment.salary_loan_id }),
        calculation_version: input.calculationVersion ?? 0,
      });
    }
  }

  const assetDeductions = await repository.listAssetDeductions(env, input.companyId, input.employee.id, input.payrollMonth);
  for (const assetDeduction of assetDeductions) {
    summary.other_deductions += assetDeduction.amount;
    assetDeductionSources.push({ asset_deduction_id: assetDeduction.id, amount: assetDeduction.amount });
    deductions.push({
      deduction_type: "asset_deduction",
      amount: assetDeduction.amount,
      source_type: "asset_deduction",
      source_id: assetDeduction.id,
      calculation_code: "asset_deduction_due",
      calculation_description: "Approved asset deduction due for this payroll month.",
      calculation_metadata_json: lineMetadata({ asset_deduction_id: assetDeduction.id }),
      calculation_version: input.calculationVersion ?? 0,
    });
  }

  const gross = payableBasic + summary.recurring_gross_additions - summary.recurring_gross_deductions;
  let totalDeductions = summary.recurring_net_deductions
    + summary.attendance_deductions
    + summary.unpaid_leave_deductions
    + summary.advance_deductions
    + summary.loan_deductions
    + summary.other_deductions;
  let net = payableBasic + summary.recurring_net_additions - totalDeductions;
  let carryForward = 0;

  if (net < 0) {
    const negativeNetPayPolicy = input.settings.negativeNetPayPolicy ?? (input.settings.allowNegativeSalary ? "allow" : input.settings.carryForwardUnpaidDeductions ? "carry_forward_excess_deduction" : "block");
    if (negativeNetPayPolicy === "block") {
      exceptions.push({
        exception_type: "negative_salary",
        severity: "critical",
        message: "Net pay would be negative under the current payroll settings.",
        employee_id: input.employee.id,
        outlet_id: input.employee.primary_outlet_id,
      });
    } else if (negativeNetPayPolicy === "carry_forward_excess_deduction") {
      carryForward = Math.abs(net);
      totalDeductions = gross;
      net = 0;
      warnings.push({
        warning_type: "deduction_carry_forward",
        message: "Deductions exceed payable salary. The excess deduction is carried forward.",
        metadata: { carry_forward_amount: carryForward },
      });
    } else {
      warnings.push({
        warning_type: "negative_net_pay",
        message: "Net pay is negative under the current payroll settings.",
        metadata: { net_amount: net },
      });
    }
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
    source_type: "payroll_calculation",
    source_id: input.payrollRunId,
    calculation_code: "employee_payroll_v1",
    calculation_description: "Generated employee payroll from salary history, recurring compensation, attendance, leave, advances, loans, and approved deductions.",
    calculation_metadata_json: lineMetadata({
      payroll_month: input.payrollMonth,
      period_start: periodStart,
      period_end: periodEnd,
      salary_segments: salarySegments,
      compensation_summary: summary,
      compensation_components: compensationDetails,
      leave_summary: leaveSummary,
      advance_sources: advanceSources,
      loan_sources: loanSources,
      asset_deduction_sources: assetDeductionSources,
      classification_counts: [...classifications.values()].reduce<Record<string, number>>((counts, value) => {
        counts[value.classification] = (counts[value.classification] ?? 0) + 1;
        return counts;
      }, {}),
      warnings,
    }),
    generated_by_calculation: 1,
    calculation_version: input.calculationVersion ?? 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { item, earnings, deductions, exceptions, warnings, summary };
};

const boolSetting = (settings: Record<string, unknown>, key: string, fallback: boolean) =>
  typeof settings[key] === "boolean" ? settings[key] as boolean : fallback;

export const parsePayrollSettings = (settings: Record<string, unknown>): PayrollCalculationSettings => {
  const salaryBasis = String(settings.daily_rate_method ?? settings.salary_calculation_basis ?? settings.calculation_basis ?? DEFAULT_SALARY_BASIS);
  const roundingMethod = String(settings.rounding_method ?? "none");
  const negativeNetPayPolicy = String(
    settings.negative_net_pay_policy
      ?? (settings.allow_negative_salary === true ? "allow" : settings.carry_forward_unpaid_deductions !== false ? "carry_forward_excess_deduction" : "block"),
  );

  return {
    salaryBasis,
    customSalaryDays: typeof settings.custom_salary_days === "number" ? settings.custom_salary_days : undefined,
    currency: String(settings.payroll_currency ?? "MVR"),
    prorateBasicSalaryForMidMonthChanges: boolSetting(settings, "prorate_basic_salary_for_mid_month_changes", true),
    prorateRecurringComponents: boolSetting(settings, "prorate_recurring_components", true),
    unpaidLeaveDeductionEnabled: boolSetting(settings, "unpaid_leave_deduction_enabled", true),
    longLeavePayDaysWorkedOnly: boolSetting(settings, "long_leave_pay_days_worked_only", true),
    automaticAdvanceDeductionEnabled: boolSetting(settings, "automatic_advance_deduction_enabled", true),
    automaticLoanInstallmentDeductionEnabled: boolSetting(settings, "automatic_loan_installment_deduction_enabled", true),
    requireCompleteAttendanceBeforeCalculation: boolSetting(settings, "require_complete_attendance_before_calculation", false),
    missingAttendanceCountsAsAbsent: boolSetting(settings, "missing_attendance_counts_as_absent", false),
    absenceDeductionRequiresExplicitAbsentStatus: boolSetting(settings, "absence_deduction_requires_explicit_absent_status", false),
    includeWeekendsInWorkingDays: boolSetting(settings, "include_weekends_in_working_days", false),
    requireActiveSalaryRecord: boolSetting(settings, "require_active_salary_record", true),
    roundingMethod: (["none", "nearest_lari", "nearest_rufiyaa", "round_down", "round_up"].includes(roundingMethod) ? roundingMethod : "none") as PayrollCalculationSettings["roundingMethod"],
    negativeNetPayPolicy: (["block", "allow", "carry_forward_excess_deduction"].includes(negativeNetPayPolicy) ? negativeNetPayPolicy : "block") as PayrollCalculationSettings["negativeNetPayPolicy"],
    deductAbsentDays: boolSetting(settings, "absent_day_deduction_enabled", settings.deduct_absent_days !== false),
    deductLateMinutes: settings.deduct_late_minutes === true,
    deductEarlyCheckout: settings.deduct_early_checkout === true,
    allowNegativeSalary: negativeNetPayPolicy === "allow",
    carryForwardUnpaidDeductions: negativeNetPayPolicy === "carry_forward_excess_deduction",
  };
};
