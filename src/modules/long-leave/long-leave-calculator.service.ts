import { DEFAULT_SALARY_CALCULATION_DAYS } from "./long-leave.constants";
import * as repository from "./long-leave.repository";
import type { LongLeaveRecord, SalaryImpactCalculationRow } from "./long-leave.types";
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
