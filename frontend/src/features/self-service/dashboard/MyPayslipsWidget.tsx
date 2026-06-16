import { Link } from "react-router-dom";
import { ReceiptText } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asNumber, asRecord, visible } from "./selfServiceDashboard.utils";

export const MyPayslipsWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["payslips"] }) => {
  if (!visible(widget)) return null;
  const summary = asRecord(widget?.summary);
  const latest = asRecord(widget?.latest);

  return (
    <WidgetCard
      title="My Payslips"
      description="Latest available payroll documents."
      icon={<ReceiptText className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/payslips">View</Link></Button>}
      empty={!latest.id && !summary.latest_period ? <p className="text-sm text-muted-foreground">No payslips available yet.</p> : undefined}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Available" value={asNumber(summary.available_count, latest.id ? 1 : 0)} status="info" />
        <MetricTile label="Latest period" value={String(summary.latest_period ?? latest.payroll_month ?? "-")} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Status: {String(summary.latest_status ?? latest.status ?? "Not available")}</p>
    </WidgetCard>
  );
};
