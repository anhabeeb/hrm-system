import { Users } from "lucide-react";

import { DashboardGrid, MetricTile, WidgetCard } from "@/components/widgets";
import type { DepartmentWeeklyTeamResponse } from "./departmentWeeklyTeam.types";

export const DepartmentWeeklySummaryWidgets = ({ data }: { data: DepartmentWeeklyTeamResponse }) => {
  const s = data.summary;
  return (
    <DashboardGrid>
      <WidgetCard title="Team size" description="Employees visible in your scope." icon={<Users className="h-4 w-4" />}>
        <MetricTile label="Total employees" value={s.total_employees ?? "-"} status="info" />
      </WidgetCard>
      <WidgetCard title="Today" description="Attendance status for today.">
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricTile label="Present" value={s.present_today ?? "-"} status="success" />
          <MetricTile label="Late" value={s.late_today ?? "-"} status="warning" />
          <MetricTile label="Absent" value={s.absent_today ?? "-"} status="danger" />
          <MetricTile label="On leave" value={s.on_leave_today ?? "-"} status="info" />
        </div>
      </WidgetCard>
      <WidgetCard title="Review needed" description="Weekly attendance exceptions.">
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricTile label="Missing punches" value={s.missing_punches ?? "-"} status={(s.missing_punches ?? 0) > 0 ? "warning" : "neutral"} />
          <MetricTile label="Pending corrections" value={s.pending_corrections ?? "-"} status={(s.pending_corrections ?? 0) > 0 ? "warning" : "neutral"} />
          <MetricTile label="Day off today" value={s.day_off_today ?? "-"} />
          <MetricTile label="Sick today" value={s.sick_today ?? "-"} status="info" />
        </div>
      </WidgetCard>
      <WidgetCard title="Coverage" description="Roster overlay when configured.">
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricTile label="Scheduled this week" value={s.scheduled_this_week ?? "-"} status="info" />
          <MetricTile label="Roster conflicts" value={s.roster_conflicts ?? "Not configured"} status={(s.roster_conflicts ?? 0) > 0 ? "warning" : "neutral"} />
          <MetricTile label="Understaffed days" value={s.understaffed_days ?? "Not configured"} />
        </div>
      </WidgetCard>
    </DashboardGrid>
  );
};
