import { Users } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions, widgetEmpty } from "./commandCenter.utils";

export const PeopleSnapshotWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["people_snapshot"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<Users className="h-4 w-4" />} footer={<WidgetActions actions={widget.actions} />}>
      {m ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <MetricTile label="Active Employees" value={m.total_active_employees} status="info" />
          <MetricTile label="New This Month" value={m.new_hires_this_month} />
          <MetricTile label="Without Login" value={m.employees_without_login} status={m.employees_without_login ? "warning" : "success"} />
          <MetricTile label="Missing Structure" value={m.employees_without_structure + m.employees_missing_level} status={m.employees_without_structure || m.employees_missing_level ? "warning" : "success"} />
        </div>
      ) : widgetEmpty("No employee setup issues found.")}
    </WidgetCard>
  );
};
