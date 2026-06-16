import { ShieldAlert } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions } from "./commandCenter.utils";

export const DisciplinaryFollowUpWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["disciplinary_follow_up"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<ShieldAlert className="h-4 w-4" />} footer={<WidgetActions actions={widget.actions} />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Pending Reviews" value={m?.pending_reviews ?? 0} />
        <MetricTile label="Acknowledgements" value={m?.pending_acknowledgements ?? 0} />
        <MetricTile label="Follow-ups" value={m?.open_follow_up_tasks ?? 0} />
        <MetricTile label="High Severity" value={m?.high_severity_cases_pending ?? 0} status={(m?.high_severity_cases_pending ?? 0) > 0 ? "danger" : "success"} />
      </div>
    </WidgetCard>
  );
};
