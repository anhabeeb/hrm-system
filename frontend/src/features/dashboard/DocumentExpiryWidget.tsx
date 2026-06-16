import { FileWarning } from "lucide-react";

import { MetricTile, WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions } from "./commandCenter.utils";

export const DocumentExpiryWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["document_expiry"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<FileWarning className="h-4 w-4" />} footer={<WidgetActions actions={widget.actions} />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Expiring 30 Days" value={m?.expiring_30_days ?? 0} status={(m?.expiring_30_days ?? 0) > 0 ? "warning" : "success"} />
        <MetricTile label="Expiring 60 Days" value={m?.expiring_60_days ?? 0} />
        <MetricTile label="Critical Missing" value={m?.missing_critical_documents ?? 0} status={(m?.missing_critical_documents ?? 0) > 0 ? "danger" : "success"} />
        <MetricTile label="KYC Pending" value={m?.pending_kyc_updates ?? 0} />
      </div>
    </WidgetCard>
  );
};
