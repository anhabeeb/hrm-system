import { AttendanceDayCell } from "./AttendanceDayCell";
import type { AttendanceCalendarDay } from "./attendanceCalendar.types";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const AttendanceCalendarGrid = ({
  days,
  onSelectDay,
}: {
  days: AttendanceCalendarDay[];
  onSelectDay: (day: AttendanceCalendarDay) => void;
}) => {
  const firstDay = days[0] ? new Date(`${days[0].date}T00:00:00.000Z`).getUTCDay() : 0;
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
        {weekDays.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-7">
        {Array.from({ length: firstDay }).map((_, index) => (
          <div key={`blank-${index}`} className="hidden rounded-lg border border-dashed bg-slate-50 sm:block" />
        ))}
        {days.map((day) => (
          <AttendanceDayCell key={day.date} day={day} onSelect={onSelectDay} />
        ))}
      </div>
    </div>
  );
};
