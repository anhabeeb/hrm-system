import { History } from "lucide-react";

import { TimelineWidget } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget } from "./commandCenter.utils";

export const RecentActivityWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["recent_activity"] }) => {
  if (!shouldShowWidget(widget)) return null;
  return (
    <TimelineWidget
      title={widget.title}
      description={widget.description}
      icon={<History className="h-4 w-4" />}
      items={widget.rows ?? []}
    />
  );
};
