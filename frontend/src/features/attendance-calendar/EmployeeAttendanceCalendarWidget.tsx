import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/data/EmptyState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { ModuleDisabledGuard } from "@/components/access/ModuleDisabledGuard";
import { useAuth } from "@/features/auth/auth.store";
import { cn } from "@/lib/utils";

import { attendanceCalendarApi } from "./attendanceCalendar.api";
import type { AttendanceCalendarDay } from "./attendanceCalendar.types";
import { currentMonth } from "./attendanceCalendar.utils";
import { AttendanceCalendarGrid } from "./AttendanceCalendarGrid";
import { AttendanceCalendarEmployeeSelector } from "./AttendanceCalendarEmployeeSelector";
import { AttendanceCalendarLegend } from "./AttendanceCalendarLegend";
import { AttendanceDayDetailDrawer } from "./AttendanceDayDetailDrawer";
import { AttendancePayrollPeriodHeader } from "./AttendancePayrollPeriodHeader";
import { AttendanceSummaryTiles } from "./AttendanceSummaryTiles";

export type AttendanceCalendarSource = "employee" | "attendance" | "payroll" | "self";

const sourceLabel: Record<AttendanceCalendarSource, string> = {
  employee: "Employee 360",
  attendance: "Attendance Calendar",
  payroll: "Payroll Review",
  self: "My Attendance",
};

export const EmployeeAttendanceCalendarWidget = ({
  source,
  employeeId,
  className,
}: {
  source: AttendanceCalendarSource;
  employeeId?: string;
  className?: string;
}) => {
  const auth = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId ?? "");
  const [selectedDay, setSelectedDay] = useState<AttendanceCalendarDay | null>(null);

  const resolvedEmployeeId = source === "self" ? undefined : employeeId ?? selectedEmployeeId;
  const queryEnabled = source === "self" || Boolean(resolvedEmployeeId);
  const isPayrollMode = source === "payroll";

  const calendarQuery = useQuery({
    queryKey: ["attendance-calendar", source, resolvedEmployeeId ?? "self", month],
    enabled: queryEnabled,
    queryFn: () => {
      if (source === "self") return attendanceCalendarApi.self({ month });
      if (source === "employee" && resolvedEmployeeId) return attendanceCalendarApi.employee(resolvedEmployeeId, { month });
      if (source === "payroll") return attendanceCalendarApi.payroll({ employee_id: resolvedEmployeeId, month });
      return attendanceCalendarApi.attendance({ employee_id: resolvedEmployeeId, month });
    },
  });

  const calendar = calendarQuery.data?.data ?? null;
  const showEmployeePicker = source === "attendance" || source === "payroll";

  return (
    <ModuleDisabledGuard moduleCode="attendance">
      {isPayrollMode ? (
        <ModuleDisabledGuard moduleCode="payroll">
          <EmployeeAttendanceCalendarWidgetContent
            authCanLoad={auth.hasAnyPermission(["payroll.attendanceReview.view", "payroll.view"])}
            calendar={calendar}
            className={className}
            selectedEmployeeId={selectedEmployeeId}
            loading={calendarQuery.isLoading}
            month={month}
            onEmployeeChange={(value) => setSelectedEmployeeId(value ?? "")}
            onMonthChange={setMonth}
            onSelectDay={setSelectedDay}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            showEmployeePicker={showEmployeePicker}
            source={source}
            error={calendarQuery.error}
          />
        </ModuleDisabledGuard>
      ) : (
        <EmployeeAttendanceCalendarWidgetContent
          authCanLoad
          calendar={calendar}
          className={className}
          selectedEmployeeId={selectedEmployeeId}
          loading={calendarQuery.isLoading}
          month={month}
          onEmployeeChange={(value) => setSelectedEmployeeId(value ?? "")}
          onMonthChange={setMonth}
          onSelectDay={setSelectedDay}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          showEmployeePicker={showEmployeePicker}
          source={source}
          error={calendarQuery.error}
        />
      )}
    </ModuleDisabledGuard>
  );
};

const EmployeeAttendanceCalendarWidgetContent = ({
  authCanLoad,
  calendar,
  className,
  selectedEmployeeId,
  error,
  loading,
  month,
  onEmployeeChange,
  onMonthChange,
  onSelectDay,
  selectedDay,
  setSelectedDay,
  showEmployeePicker,
  source,
}: {
  authCanLoad: boolean;
  calendar: Awaited<ReturnType<typeof attendanceCalendarApi.self>>["data"] | null;
  className?: string;
  selectedEmployeeId: string;
  error: unknown;
  loading: boolean;
  month: string;
  onEmployeeChange: (value: string | undefined) => void;
  onMonthChange: (value: string) => void;
  onSelectDay: (day: AttendanceCalendarDay) => void;
  selectedDay: AttendanceCalendarDay | null;
  setSelectedDay: (day: AttendanceCalendarDay | null) => void;
  showEmployeePicker: boolean;
  source: AttendanceCalendarSource;
}) => (
  <div className={cn("space-y-4", className)}>
    <AttendancePayrollPeriodHeader calendar={calendar} month={month} onMonthChange={onMonthChange} modeLabel={sourceLabel[source]} />
    {showEmployeePicker ? (
      <div className="rounded-lg border bg-white p-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="attendance-calendar-employee">
          Employee
        </label>
        <div id="attendance-calendar-employee" className="mt-1">
          <AttendanceCalendarEmployeeSelector value={selectedEmployeeId} onChange={onEmployeeChange} source={source} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Search and select an employee to view the calendar. Backend scope checks still apply.</p>
      </div>
    ) : null}
    {!authCanLoad ? (
      <InlineAlert title="Payroll attendance review is hidden for your role." persistent />
    ) : null}
    {calendar?.warnings?.map((warning) => (
      <InlineAlert key={warning} title={warning} variant="warning" persistent />
    ))}
    <WidgetCard
      title="Attendance payroll calendar"
      description="Monthly attendance, leave, correction, roster, and payroll-review status for one employee."
      icon={<CalendarDays className="h-4 w-4" />}
      loading={loading}
      error={error ? "The attendance calendar could not be loaded. Please check the employee scope and try again." : undefined}
      empty={!calendar ? <EmptyState title="Search and select an employee to view the calendar." description="Choose an employee within your allowed scope, then select the month or payroll period to review." /> : undefined}
    >
      {calendar ? (
        <div className="space-y-4">
          <AttendanceSummaryTiles calendar={calendar} />
          <AttendanceCalendarGrid days={calendar.days} onSelectDay={onSelectDay} />
          <AttendanceCalendarLegend />
        </div>
      ) : null}
    </WidgetCard>
    <AttendanceDayDetailDrawer day={selectedDay} open={Boolean(selectedDay)} onOpenChange={(open) => !open && setSelectedDay(null)} />
  </div>
);
