import { Landmark } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions } from "./commandCenter.utils";

export const PayrollReadinessWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["payroll_readiness"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  const blockers = (m?.pending_attendance_corrections ?? 0) + (m?.missing_punches ?? 0) + (m?.pending_payroll_adjustments ?? 0);
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<Landmark className="h-4 w-4" />} footer={<WidgetActions actions={widget.actions} />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Status" value={blockers ? "Needs Review" : "Ready"} status={blockers ? "warning" : "success"} />
        <MetricTile label="Missing Punches" value={m?.missing_punches ?? 0} status={(m?.missing_punches ?? 0) > 0 ? "warning" : "success"} />
        <MetricTile label="Corrections" value={m?.pending_attendance_corrections ?? 0} />
        <MetricTile label="Adjustments" value={m?.pending_payroll_adjustments ?? 0} />
      </div>
    </WidgetCard>
  );
};
