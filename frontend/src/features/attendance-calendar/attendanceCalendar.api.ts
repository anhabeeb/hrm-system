import { api } from "@/lib/api-client";
import { buildQueryString } from "@/lib/query-string";
import type { LookupFilters, LookupOption } from "@/components/selectors/lookup-api";

import type { AttendanceCalendarFilters, AttendanceCalendarResponse } from "./attendanceCalendar.types";

export const attendanceCalendarApi = {
  attendance: (filters: AttendanceCalendarFilters) =>
    api.get<AttendanceCalendarResponse>(`/attendance/employee-calendar${buildQueryString(filters)}`),
  employee: (employeeId: string, filters: Omit<AttendanceCalendarFilters, "employee_id">) =>
    api.get<AttendanceCalendarResponse>(`/employees/${employeeId}/attendance-calendar${buildQueryString(filters)}`),
  payroll: (filters: AttendanceCalendarFilters) =>
    api.get<AttendanceCalendarResponse>(`/payroll/attendance-calendar${buildQueryString(filters)}`),
  self: (filters: Omit<AttendanceCalendarFilters, "employee_id">) =>
    api.get<AttendanceCalendarResponse>(`/self/attendance-calendar${buildQueryString(filters)}`),
  calendarEmployees: (filters?: LookupFilters) =>
    api.get<LookupOption[]>(`/attendance/calendar-employees${buildQueryString({ limit: 20, ...filters })}`),
};
