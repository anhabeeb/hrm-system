import { CalendarDays } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions } from "./commandCenter.utils";

export const RosterCoverageWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["roster_coverage"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<CalendarDays className="h-4 w-4" />} footer={<WidgetActions actions={widget.actions} />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Scheduled Today" value={m?.scheduled_today ?? 0} />
        <MetricTile label="Open Shifts" value={m?.open_shifts ?? 0} status={(m?.open_shifts ?? 0) > 0 ? "warning" : "success"} />
        <MetricTile label="On Leave Today" value={m?.employees_on_leave_today ?? 0} />
        <MetricTile label="Conflicts" value={m?.roster_conflicts ?? 0} status={(m?.roster_conflicts ?? 0) > 0 ? "warning" : "success"} />
      </div>
    </WidgetCard>
  );
};
