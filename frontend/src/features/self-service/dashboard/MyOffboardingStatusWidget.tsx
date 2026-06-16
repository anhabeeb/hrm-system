import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/widgets";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asArray, asRecord, visible } from "./selfServiceDashboard.utils";

export const MyOffboardingStatusWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["offboarding_status"] }) => {
  if (!visible(widget)) return null;
  const status = asRecord(widget?.status);
  const tasks = asArray(widget?.tasks);

  return (
    <WidgetCard
      title="My Offboarding Status"
      description="Your own resignation/offboarding progress, if applicable."
      icon={<LogOut className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/requests">Open</Link></Button>}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{String(status.request_type ?? "Offboarding")}</span>
        <Badge variant="outline">{String(status.status ?? "Pending")}</Badge>
      </div>
      {status.approved_last_working_date || status.requested_last_working_date ? (
        <p className="mt-2 text-xs text-muted-foreground">Last working date: {String(status.approved_last_working_date ?? status.requested_last_working_date)}</p>
      ) : null}
      {tasks.length ? <p className="mt-2 text-xs text-muted-foreground">{tasks.length} offboarding task(s) assigned or pending.</p> : null}
    </WidgetCard>
  );
};
