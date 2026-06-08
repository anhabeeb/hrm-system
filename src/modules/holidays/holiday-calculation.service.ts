import * as repository from "./holidays.repository";
import type { HolidayEvent, HolidayFilters, HolidayRecord, HolidaySettings } from "./holidays.types";

const MS_DAY = 24 * 60 * 60 * 1000;

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_DAY).toISOString().slice(0, 10);

export const eachDate = (fromDate: string, toDate: string) => {
  const dates: string[] = [];
  for (let current = fromDate; current <= toDate; current = addDays(current, 1)) dates.push(current);
  return dates;
};

const daysBetween = (fromDate: string, toDate: string) =>
  Math.max(0, Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / MS_DAY));

const dateInYear = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const isForeign = (employeeType?: string | null) =>
  ["foreign", "foreign_worker", "expatriate", "work_permit"].includes(String(employeeType ?? "").toLowerCase());

const typeEnabled = (holiday: HolidayRecord, settings: HolidaySettings) => {
  if (holiday.holiday_type === "public_holiday" || holiday.holiday_type === "public") return settings.public_holidays_enabled === 1;
  if (holiday.holiday_type === "company_holiday" || holiday.holiday_type === "company") return settings.company_holidays_enabled === 1;
  if (holiday.holiday_type === "outlet_holiday") return settings.outlet_specific_holidays_enabled === 1;
  if (holiday.holiday_type === "optional_holiday") return settings.optional_holidays_enabled === 1;
  return settings.other_holidays_enabled === 1;
};

const appliesToEmployeeType = (holiday: HolidayRecord, employeeType?: string | null) =>
  isForeign(employeeType)
    ? holiday.applies_to_foreign_employees !== 0
    : holiday.applies_to_local_employees !== 0;

const appliesToOutlet = (holiday: HolidayRecord, outletId?: string | null) =>
  holiday.applies_to_all_outlets === 1 || !holiday.outlet_id || !outletId || holiday.outlet_id === outletId;

const appliesToDepartment = (holiday: HolidayRecord, departmentId?: string | null) =>
  !holiday.department_id || !departmentId || holiday.department_id === departmentId;

export const expandHolidayRows = (
  rows: HolidayRecord[],
  fromDate: string,
  toDate: string,
  options: { employeeType?: string | null; outletId?: string | null; departmentId?: string | null; settings: HolidaySettings },
): HolidayEvent[] => {
  const events: HolidayEvent[] = [];
  if (options.settings.holiday_module_enabled !== 1) return events;
  for (const row of rows) {
    if (row.status !== "active" || row.is_enabled === 0) continue;
    if (!typeEnabled(row, options.settings)) continue;
    if (!appliesToEmployeeType(row, options.employeeType)) continue;
    if (!appliesToOutlet(row, options.outletId)) continue;
    if (!appliesToDepartment(row, options.departmentId)) continue;
    const start = row.date ?? row.start_date;
    const end = row.end_date ?? start;
    const span = daysBetween(start, end);
    if (row.is_recurring === 1 || row.repeat_yearly === 1) {
      const startYear = Number(fromDate.slice(0, 4));
      const endYear = Number(toDate.slice(0, 4));
      const month = row.recurrence_month ?? Number(start.slice(5, 7));
      const day = row.recurrence_day ?? Number(start.slice(8, 10));
      for (let year = startYear; year <= endYear; year += 1) {
        const recurStart = dateInYear(year, month, day);
        for (let offset = 0; offset <= span; offset += 1) {
          const eventDate = addDays(recurStart, offset);
          if (eventDate >= fromDate && eventDate <= toDate) {
            events.push({ ...row, event_date: eventDate, display_name: row.name ?? row.holiday_name ?? "Holiday" });
          }
        }
      }
      continue;
    }
    for (const eventDate of eachDate(start, end)) {
      if (eventDate >= fromDate && eventDate <= toDate) {
        events.push({ ...row, event_date: eventDate, display_name: row.name ?? row.holiday_name ?? "Holiday" });
      }
    }
  }
  return events.sort((left, right) => left.event_date.localeCompare(right.event_date) || left.display_name.localeCompare(right.display_name));
};

export const getHolidaysForRange = async (
  env: Env,
  companyId: string,
  fromDate: string,
  toDate: string,
  filters: Partial<HolidayFilters> & { employeeType?: string | null; outletId?: string | null; settings: HolidaySettings },
) => {
  const rows = await repository.listHolidaysForRange(env, companyId, fromDate, toDate, {
    outlet_id: filters.outlet_id ?? filters.outletId ?? undefined,
    department_id: filters.department_id,
    holiday_type: filters.holiday_type,
    employee_type: filters.employee_type,
  });
  return expandHolidayRows(rows, fromDate, toDate, {
    employeeType: filters.employeeType ?? filters.employee_type,
    outletId: filters.outletId ?? filters.outlet_id,
    departmentId: filters.department_id,
    settings: filters.settings,
  });
};

export const getHolidayDatesForEmployee = async (
  env: Env,
  companyId: string,
  employeeId: string,
  fromDate: string,
  toDate: string,
  settings: HolidaySettings,
) => {
  const employee = await repository.findEmployee(env, companyId, employeeId);
  const events = await getHolidaysForRange(env, companyId, fromDate, toDate, {
    employeeType: employee?.employee_type,
    outletId: employee?.primary_outlet_id,
    department_id: employee?.department_id ?? undefined,
    settings,
  });
  return events.map((event) => event.event_date);
};

export const isHolidayForEmployee = async (
  env: Env,
  companyId: string,
  employeeId: string | undefined,
  date: string,
  outletId: string | null | undefined,
  settings: HolidaySettings,
) => {
  const employee = employeeId ? await repository.findEmployee(env, companyId, employeeId) : null;
  const events = await getHolidaysForRange(env, companyId, date, date, {
    employeeType: employee?.employee_type,
    outletId: outletId ?? employee?.primary_outlet_id,
    department_id: employee?.department_id ?? undefined,
    settings,
  });
  return { is_holiday: events.length > 0, holidays: events };
};

export const calculateLeaveWorkingDays = async (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
  _leaveTypeId: string | undefined,
  options: { isPaidLeave?: boolean; settings: HolidaySettings },
) => {
  const dates = new Set(eachDate(startDate, endDate));
  const employee = await repository.findEmployee(env, companyId, employeeId);
  const holidayEvents = await getHolidaysForRange(env, companyId, startDate, endDate, {
    employeeType: employee?.employee_type,
    outletId: employee?.primary_outlet_id,
    department_id: employee?.department_id ?? undefined,
    settings: options.settings,
  });
  const holidayDates = holidayEvents
    .filter((event) => event.affects_leave_duration !== 0)
    .map((event) => event.event_date);
  const exclude = options.isPaidLeave
    ? options.settings.holiday_leave_rules_enabled === 1 && (options.settings.holidays_exclude_from_paid_leave === 1 || options.settings.exclude_holidays_from_leave === 1)
    : options.settings.holiday_leave_rules_enabled === 1 && options.settings.holidays_exclude_from_unpaid_leave === 1;
  if (exclude) holidayDates.forEach((holidayDate) => dates.delete(holidayDate));
  return {
    days: dates.size,
    holiday_dates: holidayDates,
    holiday_count: holidayDates.length,
    holidays_excluded: exclude,
  };
};

export const calculateLongLeavePayableHolidayDays = async (
  env: Env,
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
  settings: HolidaySettings,
) => {
  const employee = await repository.findEmployee(env, companyId, employeeId);
  const holidayEvents = await getHolidaysForRange(env, companyId, startDate, endDate, {
    employeeType: employee?.employee_type,
    outletId: employee?.primary_outlet_id,
    department_id: employee?.department_id ?? undefined,
    settings,
  });
  const holidayDates = holidayEvents
    .filter((event) => event.affects_long_leave_payroll !== 0)
    .map((event) => event.event_date);
  return {
    holiday_days: settings.holiday_module_enabled === 1 ? holidayDates.length : 0,
    payable_holiday_days: settings.pay_holidays_during_long_leave === 1 ? holidayDates.length : 0,
    holiday_dates: settings.holiday_module_enabled === 1 ? holidayDates : [],
  };
};

export const classifyAttendanceHolidayContext = async (
  env: Env,
  companyId: string,
  employeeId: string | undefined,
  date: string,
  outletId: string | null | undefined,
  settings: HolidaySettings,
) => {
  const result = await isHolidayForEmployee(env, companyId, employeeId, date, outletId, settings);
  const holidays = result.holidays.filter((holiday) => holiday.affects_attendance_absence !== 0 || holiday.affects_overtime !== 0);
  return {
    is_holiday: holidays.length > 0,
    holidays,
    is_excused_absence: holidays.some((holiday) => holiday.affects_attendance_absence !== 0) && settings.holiday_attendance_rules_enabled === 1 && settings.holidays_count_as_attendance_excused === 1,
    holiday_work_overtime: holidays.some((holiday) => holiday.affects_overtime !== 0) && settings.holiday_work_overtime_enabled === 1,
  };
};
