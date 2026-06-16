import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/widgets";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asArray, visible } from "./selfServiceDashboard.utils";

export const MyPendingRequestsWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["pending_requests"] }) => {
  if (!visible(widget)) return null;
  const items = asArray(widget?.items);

  return (
    <WidgetCard
      title="My Pending Requests"
      description="Your own submitted requests across enabled modules."
      icon={<ClipboardCheck className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/requests">Open</Link></Button>}
      empty={!items.length ? <p className="text-sm text-muted-foreground">No pending requests.</p> : undefined}
    >
      <div className="space-y-2">
        {items.slice(0, 5).map((row) => (
          <div key={String(row.id)} className="rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{String(row.title ?? row.operation_type ?? "Request")}</p>
              <Badge variant="outline">{String(row.status ?? "Pending")}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{String(row.current_step_name ?? row.operation_type ?? "Self-service request")}</p>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};
