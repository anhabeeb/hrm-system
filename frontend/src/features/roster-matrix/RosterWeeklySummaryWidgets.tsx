import { DashboardGrid } from "@/components/widgets/DashboardGrid";
import { MetricTile } from "@/components/widgets/MetricTile";
import type { RosterWeeklyMatrixResponse } from "./rosterWeeklyMatrix.types";

export const RosterWeeklySummaryWidgets = ({ summary }: { summary: RosterWeeklyMatrixResponse["summary"] }) => (
  <DashboardGrid compact className="xl:grid-cols-4">
    <MetricTile label="Employees" value={summary.total_employees} status="info" />
    <MetricTile label="Assigned shifts" value={summary.assigned_shifts} status="success" />
    <MetricTile label="Open cells" value={summary.open_cells} status={summary.open_cells ? "warning" : "neutral"} />
    <MetricTile label="Day off" value={summary.day_off_cells} />
    <MetricTile label="Leave conflicts" value={summary.leave_conflicts} status={summary.leave_conflicts ? "danger" : "neutral"} />
    <MetricTile label="Double bookings" value={summary.double_bookings} status={summary.double_bookings ? "danger" : "neutral"} />
    <MetricTile label="Pending changes" value={summary.pending_changes} status={summary.pending_changes ? "warning" : "neutral"} />
    <MetricTile label="Draft / Published" value={`${summary.draft_assignments} / ${summary.published_assignments}`} />
  </DashboardGrid>
);
