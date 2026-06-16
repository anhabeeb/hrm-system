import { Clock3 } from "lucide-react";

import { StatusStrip, WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions } from "./commandCenter.utils";

export const AttendancePulseWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["attendance_pulse"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<Clock3 className="h-4 w-4" />} footer={<WidgetActions actions={widget.actions} />}>
      <StatusStrip
        items={[
          { label: "Present", value: m?.present ?? 0, status: "success" },
          { label: "Late", value: m?.late ?? 0, status: (m?.late ?? 0) > 0 ? "warning" : "neutral" },
          { label: "Absent", value: m?.absent ?? 0, status: (m?.absent ?? 0) > 0 ? "danger" : "neutral" },
          { label: "Leave", value: m?.on_leave ?? 0, status: "info" },
          { label: "Missing Punch", value: m?.missing_punch ?? 0, status: (m?.missing_punch ?? 0) > 0 ? "warning" : "neutral" },
          { label: "Corrections", value: m?.pending_corrections ?? 0, status: (m?.pending_corrections ?? 0) > 0 ? "info" : "neutral" },
        ]}
      />
    </WidgetCard>
  );
};
