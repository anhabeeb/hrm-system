import { MetricTile } from "@/components/widgets/MetricTile";
import { DashboardGrid } from "@/components/widgets/DashboardGrid";

import type { AttendanceCalendarResponse } from "./attendanceCalendar.types";

const tiles: Array<[keyof AttendanceCalendarResponse["summary"], string, "neutral" | "success" | "warning" | "danger" | "info"]> = [
  ["payroll_days", "Payroll Days", "neutral"],
  ["worked_days", "Worked", "success"],
  ["present_days", "Present", "success"],
  ["late_days", "Late", "warning"],
  ["leave_days", "Leave", "info"],
  ["sick_days", "Sick", "info"],
  ["absent_days", "Absent", "danger"],
  ["missing_punch_days", "Missing Punch", "warning"],
  ["pending_correction_days", "Pending Corrections", "warning"],
  ["deduction_days", "Deduction Days", "danger"],
  ["payable_days", "Payable Days", "success"],
  ["review_required_days", "Review Required", "warning"],
];

export const AttendanceSummaryTiles = ({ calendar }: { calendar: AttendanceCalendarResponse }) => (
  <DashboardGrid compact className="xl:grid-cols-6 2xl:grid-cols-6">
    {tiles.map(([key, label, status]) => (
      <MetricTile key={key} label={label} value={calendar.summary[key]} status={status} />
    ))}
  </DashboardGrid>
);
