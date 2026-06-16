import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/widgets";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asArray, visible } from "./selfServiceDashboard.utils";

export const MyAcknowledgementsWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["acknowledgements"] }) => {
  if (!visible(widget)) return null;
  const items = asArray(widget?.items);

  return (
    <WidgetCard
      title="My Acknowledgements"
      description="Receipt acknowledgements that need your attention."
      icon={<ShieldAlert className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/requests">View</Link></Button>}
    >
      <div className="space-y-2">
        {items.slice(0, 4).map((item) => (
          <div key={String(item.id)} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span>{String(item.outcome_type ?? item.action_type ?? "Acknowledgement")}</span>
            <Badge variant="outline">Acknowledged receipt</Badge>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};
