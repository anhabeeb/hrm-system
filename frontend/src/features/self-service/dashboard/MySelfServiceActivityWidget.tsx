import { History } from "lucide-react";

import { TimelineWidget } from "@/components/widgets";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asArray, visible } from "./selfServiceDashboard.utils";

export const MySelfServiceActivityWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["recent_activity"] }) => {
  if (!visible(widget)) return null;
  const items = asArray(widget?.items);

  return (
    <TimelineWidget
      title="Recent Self-Service Activity"
      description="Recent activity for your own employee account."
      icon={<History className="h-4 w-4" />}
      items={items.map((item) => ({
        id: String(item.id),
        title: String(item.title ?? "Self-service activity"),
        description: item.description ? String(item.description) : null,
        timestamp: item.timestamp ? String(item.timestamp) : null,
        status: item.status ? String(item.status) : null,
      }))}
    />
  );
};
