import { LookupCombobox } from "@/components/selectors/LookupCombobox";

import { attendanceCalendarApi } from "./attendanceCalendar.api";
import type { AttendanceCalendarSource } from "./EmployeeAttendanceCalendarWidget";

export const AttendanceCalendarEmployeeSelector = ({
  value,
  onChange,
  source,
}: {
  value?: string;
  onChange: (employeeId: string | undefined) => void;
  source: AttendanceCalendarSource;
}) => (
  <LookupCombobox
    value={value}
    onChange={onChange}
    queryKey={["attendance-calendar", "employees", source]}
    queryFn={(filters) => attendanceCalendarApi.calendarEmployees({ ...filters, mode: source === "payroll" ? "payroll" : "attendance" })}
    placeholder="Search and select employee"
    searchPlaceholder="Search by employee no, name, department, or position..."
    emptyText="No employees found in your allowed scope."
  />
);
