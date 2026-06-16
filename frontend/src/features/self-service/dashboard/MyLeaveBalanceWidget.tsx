import { Link } from "react-router-dom";
import { CalendarClock } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asArray, asNumber, asRecord, visible } from "./selfServiceDashboard.utils";

export const MyLeaveBalanceWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["leave_balance"] }) => {
  if (!visible(widget)) return null;
  const summary = asRecord(widget?.summary);
  const balances = asArray(widget?.balances);
  const nextLeave = asRecord(widget?.next_approved_leave);

  return (
    <WidgetCard
      title="My Leave Balance"
      description="Available leave and upcoming approved leave."
      icon={<CalendarClock className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/leave">Request leave</Link></Button>}
      empty={!balances.length && !summary.available_days ? <p className="text-sm text-muted-foreground">No leave balance configured yet.</p> : undefined}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Available days" value={asNumber(summary.available_days)} status="info" />
        <MetricTile label="Pending requests" value={asNumber(widget?.pending_requests)} status={asNumber(widget?.pending_requests) ? "warning" : "neutral"} />
      </div>
      {balances.length ? (
        <div className="mt-3 space-y-1 text-xs">
          {balances.slice(0, 4).map((row) => (
            <div key={String(row.leave_type_id ?? row.leave_type_name)} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{String(row.leave_type_name ?? row.leave_type_code ?? "Leave")}</span>
              <span className="font-medium">{asNumber(row.available_days)} days</span>
            </div>
          ))}
        </div>
      ) : null}
      {nextLeave.id ? <p className="mt-3 text-xs text-muted-foreground">Next approved leave: {String(nextLeave.start_date)} - {String(nextLeave.end_date)}</p> : null}
    </WidgetCard>
  );
};
