import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { AttendanceCalendarResponse } from "./attendanceCalendar.types";
import { addMonths, monthInputLabel } from "./attendanceCalendar.utils";

export const AttendancePayrollPeriodHeader = ({
  calendar,
  month,
  onMonthChange,
  modeLabel,
}: {
  calendar?: AttendanceCalendarResponse | null;
  month: string;
  onMonthChange: (month: string) => void;
  modeLabel?: string;
}) => (
  <div className="rounded-lg border bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{calendar?.employee.name ?? "Employee Attendance Calendar"}</h2>
          {modeLabel ? <Badge variant="outline">{modeLabel}</Badge> : null}
          {calendar?.payroll_period.is_derived ? <Badge variant="secondary">Default monthly period</Badge> : null}
          {calendar?.payroll_period.attendance_locked ? <Badge className="bg-amber-100 text-amber-800">Locked / finalized</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {calendar
            ? `${calendar.employee.employee_no ?? "No employee code"} / ${calendar.employee.department_name ?? "No department"} / ${calendar.employee.position_name ?? "No position"} / Level ${calendar.employee.level ?? "not set"}`
            : "Select an employee and month to review attendance payroll status."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onMonthChange(addMonths(month, -1))}>Previous</Button>
        <input
          aria-label="Attendance calendar month"
          type="month"
          value={month}
          onChange={(event) => onMonthChange(event.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        />
        <Button variant="outline" size="sm" onClick={() => onMonthChange(addMonths(month, 1))}>Next</Button>
      </div>
    </div>
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-md border bg-slate-50 p-2">
        <span className="text-xs text-muted-foreground">Calendar Month</span>
        <p className="font-medium">{monthInputLabel(month)}</p>
      </div>
      <div className="rounded-md border bg-slate-50 p-2">
        <span className="text-xs text-muted-foreground">Payroll Period</span>
        <p className="font-medium">{calendar ? `${calendar.payroll_period.start_date} - ${calendar.payroll_period.end_date}` : "Not loaded"}</p>
      </div>
      <div className="rounded-md border bg-slate-50 p-2">
        <span className="text-xs text-muted-foreground">Pay Date</span>
        <p className="font-medium">{calendar?.payroll_period.pay_date ?? "Not configured"}</p>
      </div>
      <div className="rounded-md border bg-slate-50 p-2">
        <span className="text-xs text-muted-foreground">Payroll Status</span>
        <p className={cn("font-medium", calendar?.payroll_period.attendance_locked && "text-amber-700")}>{calendar?.payroll_period.status ?? "Not configured"}</p>
      </div>
    </div>
  </div>
);
