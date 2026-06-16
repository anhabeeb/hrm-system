import { Link } from "react-router-dom";
import { FileText } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import type { SelfDashboardModernWidgets } from "../self-service.types";
import { asNumber, asRecord, visible } from "./selfServiceDashboard.utils";

export const MyDocumentsKycWidget = ({ widget }: { widget?: SelfDashboardModernWidgets["documents_kyc"] }) => {
  if (!visible(widget)) return null;
  const metrics = asRecord(widget?.metrics);

  return (
    <WidgetCard
      title="My Documents / KYC"
      description="Your verified documents and KYC requests."
      icon={<FileText className="h-4 w-4" />}
      action={<Button asChild size="sm" variant="outline"><Link to="/self/documents">Open</Link></Button>}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Verified documents" value={asNumber(metrics.verified_count)} status="success" />
        <MetricTile label="Expiring soon" value={asNumber(metrics.expiring_soon)} status={asNumber(metrics.expiring_soon) ? "warning" : "neutral"} />
        <MetricTile label="Expired" value={asNumber(metrics.expired)} status={asNumber(metrics.expired) ? "danger" : "neutral"} />
        <MetricTile label="Pending KYC" value={asNumber(metrics.pending_kyc_updates)} status={asNumber(metrics.pending_kyc_updates) ? "warning" : "neutral"} />
      </div>
      {widget?.latest_status ? <p className="mt-3 text-xs text-muted-foreground">Latest KYC status: {String(widget.latest_status)}</p> : null}
    </WidgetCard>
  );
};
