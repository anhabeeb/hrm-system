import { useLocation, useSearchParams } from "react-router-dom";

import { LinkedEmployeeOnlyGuard } from "@/components/access/LinkedEmployeeOnlyGuard";
import { PageActionBar } from "@/components/layout/PageActionBar";

import { EmployeeAttendanceCalendarWidget, type AttendanceCalendarSource } from "./EmployeeAttendanceCalendarWidget";

const modeFromSearch = (value: string | null): AttendanceCalendarSource =>
  value === "payroll" || value === "self" || value === "employee" ? value : "attendance";

export const EmployeeAttendanceCalendarPage = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const inferredSource: AttendanceCalendarSource =
    location.pathname.startsWith("/self/") ? "self" :
      location.pathname.startsWith("/payroll/") ? "payroll" :
        "attendance";
  const source = searchParams.has("source") ? modeFromSearch(searchParams.get("source")) : inferredSource;
  const employeeId = searchParams.get("employee_id") ?? undefined;

  const content = (
    <div className="space-y-4 p-4 md:p-6">
      <PageActionBar label="Attendance calendar page actions">
        <div className="text-sm text-muted-foreground">Monthly attendance and payroll impact review</div>
      </PageActionBar>
      <EmployeeAttendanceCalendarWidget source={source} employeeId={employeeId} />
    </div>
  );

  if (source === "self") {
    return <LinkedEmployeeOnlyGuard>{content}</LinkedEmployeeOnlyGuard>;
  }

  return content;
};
