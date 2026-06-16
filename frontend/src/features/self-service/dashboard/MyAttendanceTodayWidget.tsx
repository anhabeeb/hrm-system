import { Link } from "react-router-dom";
import { Clock3 } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asNumber, visible } from "./selfServiceDashboard.utils";

export const MyAttendanceTodayWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["attendance_today"] }) => {
  if (!visible(widget)) return null;
  return (
    <WidgetCard
      title="My Attendance Today"
      description="Your current attendance status for today."
      icon={<Clock3 className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/attendance-calendar">Calendar</Link></Button>}
      empty={!widget?.status ? <p className="text-sm text-muted-foreground">No attendance record for today yet.</p> : undefined}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Status" value={String(widget?.status ?? "-")} status={widget?.status ? "success" : "neutral"} />
        <MetricTile label="Late minutes" value={asNumber(widget?.late_minutes)} status={asNumber(widget?.late_minutes) > 0 ? "warning" : "neutral"} />
        <MetricTile label="Check-in" value={String(widget?.check_in ?? "-")} />
        <MetricTile label="Check-out" value={String(widget?.check_out ?? "-")} />
      </div>
    </WidgetCard>
  );
};
