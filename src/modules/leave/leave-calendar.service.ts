import * as repository from "./leave.repository";

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const countInclusiveDays = (startDate: string, endDate: string): number => {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
};

const expandDateRange = (startDate: string, endDate: string): Set<string> => {
  const dates = new Set<string>();
  const current = toDate(startDate);
  const end = toDate(endDate);

  while (current <= end) {
    dates.add(toIsoDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

export const calculateLeaveDays = async (
  env: Env,
  companyId: string,
  startDate: string,
  endDate: string,
  options: {
    excludeHolidays?: boolean;
    enabledHolidayTypes?: string[];
    outletSpecificEnabled?: boolean;
    outletId?: string | null;
  } = {},
): Promise<number> => {
  const totalDays = countInclusiveDays(startDate, endDate);

  if (!options.excludeHolidays) {
    return totalDays;
  }

  if (options.enabledHolidayTypes && options.enabledHolidayTypes.length === 0) {
    return totalDays;
  }

  const leaveDates = expandDateRange(startDate, endDate);
  const holidays = await repository.listHolidayDates(env, companyId, startDate, endDate, {
    enabledHolidayTypes: options.enabledHolidayTypes,
    outletSpecificEnabled: options.outletSpecificEnabled,
    outletId: options.outletId,
  });

  for (const holiday of holidays) {
    const holidayDates = expandDateRange(holiday.start_date, holiday.end_date ?? holiday.start_date);
    for (const date of holidayDates) {
      leaveDates.delete(date);
    }
  }

  return leaveDates.size;
};

export const listMonthsBetween = (startDate: string, endDate: string): string[] => {
  const months: string[] = [];
  const current = toDate(`${startDate.slice(0, 7)}-01`);
  const end = toDate(`${endDate.slice(0, 7)}-01`);

  while (current <= end) {
    months.push(current.toISOString().slice(0, 7));
    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return months;
};
