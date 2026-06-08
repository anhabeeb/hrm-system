import { DEFAULT_SALARY_CALCULATION_DAYS } from "./long-leave.constants";
import * as repository from "./long-leave.repository";
import type { LongLeaveRecord, LongLeaveSettings, SalaryImpactCalculationRow } from "./long-leave.types";
import * as holidayCalculation from "../holidays/holiday-calculation.service";
import * as holidayService from "../holidays/holidays.service";
import * as settingsService from "../../services/settings.service";

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

export const countInclusiveDays = (startDate: string, endDate: string): number => {
  const diff = toDate(endDate).getTime() - toDate(startDate).getTime();
  return Math.floor(diff / 86_400_000) + 1;
};

export const monthEndDate = (payrollMonth: string): string => {
  const [year, month] = payrollMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export const monthsBetween = (startDate: string, endDate: string): string[] => {
  const months: string[] = [];
  const current = toDate(`${startDate.slice(0, 7)}-01`);
  const end = toDate(`${endDate.slice(0, 7)}-01`);
  while (current <= end) {
    months.push(current.toISOString().slice(0, 7));
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return months;
};

export const getMonthOverlap = (record: LongLeaveRecord, payrollMonth: string) => {
  const start = record.start_date > `${payrollMonth}-01` ? record.start_date : `${payrollMonth}-01`;
  const endOfMonth = monthEndDate(payrollMonth);
  const endBoundary = record.actual_return_date ?? record.expected_return_date;
  const end = endBoundary < endOfMonth ? endBoundary : endOfMonth;
  return { start, end, days: start <= end ? countInclusiveDays(start, end) : 0 };
};

export const getPayrollMonthRange = (payrollMonth: string) => ({
  start: `${payrollMonth}-01`,
  end: monthEndDate(payrollMonth),
});

const countWeekdays = (startDate: string, endDate: string): number => {
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

const countWeekendDays = (startDate: string, endDate: string): number =>
  countInclusiveDays(startDate, endDate) - countWeekdays(startDate, endDate);

const normalizeSettings = (settings: LongLeaveSettings | null | undefined): LongLeaveSettings => ({
  is_enabled: settings?.is_enabled ?? 1,
  applies_to_foreigners: settings?.applies_to_foreigners ?? 1,
  applies_to_locals: settings?.applies_to_locals ?? 0,
  trigger_days: settings?.trigger_days ?? 30,
  max_continuous_days: settings?.max_continuous_days ?? null,
  salary_rule: settings?.salary_rule ?? "pay_only_worked_days",
  require_salary_impact_preview: settings?.require_salary_impact_preview ?? 1,
  pay_only_worked_days: settings?.pay_only_worked_days ?? 1,
  deduct_full_salary_if_zero_worked_days: settings?.deduct_full_salary_if_zero_worked_days ?? 1,
  count_holidays_inside_leave: settings?.count_holidays_inside_leave ?? 1,
  pay_holidays_during_long_leave: settings?.pay_holidays_during_long_leave ?? 0,
  pay_weekly_off_days_during_long_leave: settings?.pay_weekly_off_days_during_long_leave ?? 0,
  allow_hr_override: settings?.allow_hr_override ?? 1,
  default_salary_treatment: settings?.default_salary_treatment ?? "unpaid",
  default_deduction_method: settings?.default_deduction_method ?? "calendar_days",
  require_payroll_review: settings?.require_payroll_review ?? 1,
  require_return_to_work_confirmation: settings?.require_return_to_work_confirmation ?? 1,
  approval_required: settings?.approval_required ?? 1,
  partial_pay_ratio: settings?.partial_pay_ratio ?? 0.5,
});

export const resolvePayableDaysPolicy = (settings: LongLeaveSettings, recordPolicy?: string | null) => {
  if (recordPolicy === "pay_only_worked_days" || recordPolicy === "monthly_deduction") return recordPolicy;
  if (settings.salary_rule === "pay_only_worked_days" || settings.salary_rule === "monthly_deduction") return settings.salary_rule;
  if (settings.pay_only_worked_days === 1) return "pay_only_worked_days";
  return "monthly_deduction";
};

export const calculatePayableAmount = (
  monthlySalaryAmount: number,
  salaryCalculationDays: number,
  workedDays: number,
) => {
  const dailySalaryAmount = Math.floor(monthlySalaryAmount / salaryCalculationDays);
  return {
    dailySalaryAmount,
    estimatedPayableAmount: workedDays <= 0 ? 0 : dailySalaryAmount * workedDays,
  };
};

export const getSalaryCalculationDays = async (
  env: Env,
  companyId: string,
  payrollMonth: string,
) => {
  const payrollSettings = await settingsService.getPayrollSettings(env, companyId);
  const basis = payrollSettings.salary_calculation_basis ?? payrollSettings.calculation_basis;
  if (basis === "working_days") return countWeekdays(`${payrollMonth}-01`, monthEndDate(payrollMonth));
  if (basis === "calendar_days") return countInclusiveDays(`${payrollMonth}-01`, monthEndDate(payrollMonth));
  if (typeof payrollSettings.custom_salary_days === "number" && payrollSettings.custom_salary_days > 0) {
    return payrollSettings.custom_salary_days;
  }
  if (typeof payrollSettings.salary_calculation_days === "number" && payrollSettings.salary_calculation_days > 0) {
    return payrollSettings.salary_calculation_days;
  }
  return DEFAULT_SALARY_CALCULATION_DAYS;
};

export const calculateLongLeaveSalaryImpact = async (
  env: Env,
  record: LongLeaveRecord,
): Promise<SalaryImpactCalculationRow[]> => {
  const rows: SalaryImpactCalculationRow[] = [];
  const endDate = record.actual_return_date ?? record.expected_return_date;

  for (const payrollMonth of monthsBetween(record.start_date, endDate)) {
    const overlap = getMonthOverlap(record, payrollMonth);
    if (overlap.days <= 0) continue;
    const salary = await repository.findSalaryForMonth(env, record.company_id, record.employee_id, monthEndDate(payrollMonth));
    const monthlySalaryAmount = salary?.monthly_salary_amount ?? 0;
    const salaryCalculationDays = await getSalaryCalculationDays(env, record.company_id, payrollMonth);
    const monthRange = getPayrollMonthRange(payrollMonth);
    const workedDays = await repository.countWorkedDays(env, record.company_id, record.employee_id, monthRange.start, monthRange.end);
    const payable = calculatePayableAmount(monthlySalaryAmount, salaryCalculationDays, workedDays);
    rows.push({
      payroll_month: payrollMonth,
      monthly_salary_amount: monthlySalaryAmount,
      salary_calculation_days: salaryCalculationDays,
      worked_days: workedDays,
      long_leave_days: overlap.days,
      daily_salary_amount: payable.dailySalaryAmount,
      estimated_payable_amount: payable.estimatedPayableAmount,
    });
  }

  return rows;
};

export const calculateLongLeavePayrollPreview = async (
  env: Env,
  record: LongLeaveRecord,
): Promise<SalaryImpactCalculationRow[]> => {
  const rows: SalaryImpactCalculationRow[] = [];
  const endDate = record.actual_return_date ?? record.expected_return_date;
  const settings = normalizeSettings(await repository.getLongLeaveSettings(env, record.company_id));
  const salaryTreatment = record.salary_treatment ?? settings.default_salary_treatment ?? "unpaid";
  const deductionMethod = record.deduction_method ?? settings.default_deduction_method ?? "calendar_days";
  const payableDaysPolicy = resolvePayableDaysPolicy(settings, record.payable_days_policy);
  const payOnlyWorkedDays = payableDaysPolicy === "pay_only_worked_days";

  for (const payrollMonth of monthsBetween(record.start_date, endDate)) {
    const overlap = getMonthOverlap(record, payrollMonth);
    if (overlap.days <= 0) continue;
    const salary = await repository.findSalaryForMonth(env, record.company_id, record.employee_id, monthEndDate(payrollMonth));
    const monthlySalaryAmount = salary?.monthly_salary_amount ?? 0;
    const salaryCalculationDays = await getSalaryCalculationDays(env, record.company_id, payrollMonth);
    const totalDays = countInclusiveDays(`${payrollMonth}-01`, monthEndDate(payrollMonth));
    const longLeaveDays = overlap.days;
    const dailySalaryAmount = salaryCalculationDays > 0 ? Math.floor(monthlySalaryAmount / salaryCalculationDays) : 0;
    const workedDays = await repository.countWorkedDays(env, record.company_id, record.employee_id, `${payrollMonth}-01`, monthEndDate(payrollMonth));
    const holidaySettings = await holidayService.getHolidaySettings(env, record.company_id).catch(() => null);
    const holidayImpact = settings.count_holidays_inside_leave === 1 && holidaySettings
      ? await holidayCalculation.calculateLongLeavePayableHolidayDays(
        env,
        record.company_id,
        record.employee_id,
        overlap.start,
        overlap.end,
        {
          ...holidaySettings,
          pay_holidays_during_long_leave: settings.pay_holidays_during_long_leave,
        },
      ).catch(() => ({ holiday_days: 0, payable_holiday_days: 0, holiday_dates: [] as string[] }))
      : { holiday_days: 0, payable_holiday_days: 0, holiday_dates: [] as string[] };
    const holidayDays = holidayImpact.holiday_days;
    const weeklyOffDays = countWeekendDays(overlap.start, overlap.end);
    const payableHolidayDays = holidayImpact.payable_holiday_days;
    const payableWeeklyOffDays = settings.pay_weekly_off_days_during_long_leave === 1 ? weeklyOffDays : 0;
    const paidNonWorkDays = Math.min(longLeaveDays, payableHolidayDays + payableWeeklyOffDays);
    let warningCode: string | null = monthlySalaryAmount > 0 ? null : "LONG_LEAVE_PAYROLL_NO_SALARY_FOUND";
    let warningMessage: string | null = monthlySalaryAmount > 0 ? null : "No salary history was found for this payroll month.";
    let unpaidDays = longLeaveDays;
    if (deductionMethod === "calendar_days") {
      unpaidDays = Math.max(0, longLeaveDays - paidNonWorkDays);
    } else if (deductionMethod === "working_days") {
      unpaidDays = Math.max(0, countWeekdays(overlap.start, overlap.end) - payableHolidayDays);
    } else if (deductionMethod === "scheduled_roster_days") {
      const rosterDays = await repository.countRosteredDays(env, record.company_id, record.employee_id, overlap.start, overlap.end);
      if (rosterDays > 0) {
        unpaidDays = rosterDays;
      } else {
        unpaidDays = Math.max(0, countWeekdays(overlap.start, overlap.end) - payableHolidayDays);
        warningCode = "LONG_LEAVE_PAYROLL_ROSTER_FALLBACK";
        warningMessage = "No rostered shifts were found for this long leave period, so working-day fallback was used for payroll review.";
      }
    } else if (deductionMethod === "attendance_days") {
      unpaidDays = Math.max(0, totalDays - workedDays - paidNonWorkDays);
    } else {
      warningCode = "LONG_LEAVE_PAYROLL_POLICY_MISSING";
      warningMessage = "The selected deduction method is not supported and requires payroll review.";
    }

    let payableDays = Math.max(0, totalDays - unpaidDays);
    let deductionAmount = dailySalaryAmount * unpaidDays;
    let payableSalary = Math.max(0, monthlySalaryAmount - deductionAmount);
    if (payOnlyWorkedDays) {
      payableDays = Math.min(totalDays, workedDays + paidNonWorkDays);
      payableSalary = Math.min(monthlySalaryAmount, dailySalaryAmount * payableDays);
      deductionAmount = Math.max(0, monthlySalaryAmount - payableSalary);
      unpaidDays = Math.max(0, totalDays - payableDays);
    }

    if (salaryTreatment === "paid") {
      unpaidDays = 0;
      payableDays = totalDays;
      deductionAmount = 0;
      payableSalary = monthlySalaryAmount;
    } else if (salaryTreatment === "partially_paid") {
      const ratio = settings.partial_pay_ratio ?? 0.5;
      const unpaidDeduction = deductionAmount;
      deductionAmount = Math.max(0, Math.floor(unpaidDeduction * (1 - ratio)));
      payableSalary = Math.max(0, monthlySalaryAmount - deductionAmount);
      warningCode = warningCode ?? "LONG_LEAVE_PARTIAL_PAY_REVIEW";
      warningMessage = warningMessage ?? `Partial pay ratio ${ratio} was applied. Payroll should review before final processing.`;
    } else if (salaryTreatment === "custom") {
      unpaidDays = 0;
      payableDays = totalDays;
      deductionAmount = 0;
      payableSalary = monthlySalaryAmount;
      warningCode = "LONG_LEAVE_PAYROLL_REVIEW_REQUIRED";
      warningMessage = "Custom salary treatment requires payroll review; no automatic deduction was calculated.";
    }

    rows.push({
      payroll_month: payrollMonth,
      monthly_salary_amount: monthlySalaryAmount,
      salary_calculation_days: salaryCalculationDays,
      worked_days: workedDays,
      long_leave_days: longLeaveDays,
      daily_salary_amount: dailySalaryAmount,
      estimated_payable_amount: payableSalary,
      total_days: totalDays,
      payable_days: payableDays,
      unpaid_days: unpaidDays,
      holiday_days: holidayDays,
      payable_holiday_days: payableHolidayDays,
      deduction_amount: deductionAmount,
      payable_salary: payableSalary,
      status: monthlySalaryAmount > 0 ? (warningCode ? "pending_review" : "preview") : "blocked",
      warning_code: warningCode,
      warning_message: warningMessage,
    });
  }

  return rows;
};
