import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";

import { WidgetCard } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asArray, visible } from "./selfServiceDashboard.utils";

export const MyUpcomingRosterWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["upcoming_roster"] }) => {
  if (!visible(widget)) return null;
  const items = asArray(widget?.items);

  return (
    <WidgetCard
      title="My Upcoming Roster"
      description="Your next assigned shifts."
      icon={<CalendarDays className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/roster">View roster</Link></Button>}
      empty={!items.length ? <p className="text-sm text-muted-foreground">No upcoming roster found.</p> : undefined}
    >
      <div className="space-y-2">
        {items.slice(0, 5).map((row) => (
          <div key={`${row.shift_date}-${row.start_time}`} className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium">{String(row.shift_date ?? "-")}</span>
            <span className="text-muted-foreground">{String(row.start_time ?? "-")} - {String(row.end_time ?? "-")}</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
};
