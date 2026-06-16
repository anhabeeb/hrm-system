import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { AttendanceCalendarDay } from "./attendanceCalendar.types";
import { payrollImpactTone, statusTone } from "./attendanceCalendar.utils";

export const AttendanceDayCell = ({
  day,
  onSelect,
}: {
  day: AttendanceCalendarDay;
  onSelect: (day: AttendanceCalendarDay) => void;
}) => (
  <button
    type="button"
    onClick={() => onSelect(day)}
    className={cn(
      "min-h-28 rounded-lg border bg-white p-2 text-left transition hover:border-slate-300 hover:bg-slate-50",
      !day.is_payroll_period_day && "bg-slate-50 text-muted-foreground opacity-75",
      !day.is_employee_active_day && "bg-slate-50 text-muted-foreground",
      day.is_today && "ring-2 ring-slate-300",
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <span className="text-sm font-semibold">{Number(day.date.slice(8, 10))}</span>
      <Badge variant="outline" className={cn("text-[10px]", statusTone(day.status))}>
        {day.label}
      </Badge>
    </div>
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      {day.shift ? <p className="truncate">{day.shift.name ?? "Scheduled shift"}</p> : null}
      {day.attendance?.check_in ? <p>In {String(day.attendance.check_in).slice(11, 16)}</p> : null}
      {day.attendance?.check_out ? <p>Out {String(day.attendance.check_out).slice(11, 16)}</p> : null}
    </div>
    <Badge variant="outline" className={cn("mt-2 text-[10px]", payrollImpactTone(day.payroll_impact))}>
      {day.payroll_impact.replace(/_/g, " ")}
    </Badge>
  </button>
);
