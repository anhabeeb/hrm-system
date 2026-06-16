import { FileCheck2 } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions } from "./commandCenter.utils";

export const LifecycleWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["lifecycle"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<FileCheck2 className="h-4 w-4" />} footer={<WidgetActions actions={widget.actions} />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Notice Period" value={m?.employees_in_notice_period ?? 0} />
        <MetricTile label="Tasks Pending" value={m?.offboarding_tasks_pending ?? 0} />
        <MetricTile label="Settlement Review" value={m?.final_settlement_review_pending ?? 0} />
        <MetricTile label="Exit Interviews" value={m?.exit_interviews_pending ?? 0} />
      </div>
    </WidgetCard>
  );
};
