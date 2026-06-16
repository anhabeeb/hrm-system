import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { Badge } from "@/components/ui/badge";

import type { AttendanceCalendarDay } from "./attendanceCalendar.types";
import { formatMinutes } from "./attendanceCalendar.utils";

const value = (input: unknown) => input === null || input === undefined || input === "" ? "Not recorded" : String(input);

export const AttendanceDayDetailDrawer = ({
  day,
  open,
  onOpenChange,
}: {
  day: AttendanceCalendarDay | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={day ? day.label : "Attendance day"} subtitle={day?.date}>
    {day ? (
      <>
        <DetailSection
          title="Payroll status"
          rows={[
            { label: "Date", value: `${day.day_name}, ${day.date}` },
            { label: "Status", value: <Badge variant="outline">{day.label}</Badge> },
            { label: "Payroll impact", value: <Badge variant="outline">{day.payroll_impact.replace(/_/g, " ")}</Badge> },
            { label: "Payroll period day", value: day.is_payroll_period_day ? "Yes" : "No" },
            { label: "Employee active day", value: day.is_employee_active_day ? "Yes" : "No" },
          ]}
        />
        <DetailSection
          title="Attendance"
          rows={[
            { label: "Check in", value: value(day.attendance?.check_in) },
            { label: "Check out", value: value(day.attendance?.check_out) },
            { label: "Worked", value: formatMinutes(day.attendance?.worked_minutes ?? 0) },
            { label: "Late", value: formatMinutes(day.attendance?.late_minutes ?? 0) },
          ]}
        />
        <DetailSection
          title="Overlays"
          rows={[
            { label: "Shift", value: day.shift ? `${day.shift.name ?? "Shift"} (${value(day.shift.start_time)} - ${value(day.shift.end_time)})` : "No shift overlay" },
            { label: "Leave", value: day.leave ? `${day.leave.leave_type ?? "Leave"} (${day.leave.is_paid ? "Paid" : "Unpaid"})` : "No leave overlay" },
            { label: "Correction", value: day.correction ? `${day.correction.status}${day.correction.correction_type ? ` / ${day.correction.correction_type}` : ""}` : "No correction" },
            { label: "Holiday", value: day.holiday ? `${day.holiday.name ?? "Holiday"} (${day.holiday.is_paid ? "Paid" : "Unpaid"})` : "No holiday" },
          ]}
        />
        {day.notes.length > 0 ? (
          <DetailSection title="Notes" rows={day.notes.map((note, index) => ({ label: `Note ${index + 1}`, value: note }))} />
        ) : null}
      </>
    ) : null}
  </DetailDrawer>
);
