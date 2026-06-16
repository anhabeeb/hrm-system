import { ShieldCheck } from "lucide-react";

import { ModuleHealthCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget, WidgetActions } from "./commandCenter.utils";

export const OperationOwnershipHealthWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["operation_ownership_health"] }) => {
  if (!shouldShowWidget(widget)) return null;
  const m = widget.metrics;
  return (
    <ModuleHealthCard
      title={widget.title}
      description={widget.description}
      icon={<ShieldCheck className="h-4 w-4" />}
      status={widget.status === "ready" ? "Ready" : "Needs Review"}
      warnings={widget.warnings ?? []}
      metrics={[
        { label: "No Owner", value: m?.operations_missing_owner ?? 0, status: (m?.operations_missing_owner ?? 0) > 0 ? "warning" : "success" },
        { label: "No Final", value: m?.operations_missing_final_approver ?? 0, status: (m?.operations_missing_final_approver ?? 0) > 0 ? "warning" : "success" },
        { label: "No Executor", value: m?.operations_missing_executor ?? 0, status: (m?.operations_missing_executor ?? 0) > 0 ? "warning" : "success" },
        { label: "Blocked", value: m?.operations_blocked_by_fallback ?? 0, status: (m?.operations_blocked_by_fallback ?? 0) > 0 ? "danger" : "success" },
      ]}
      footer={<WidgetActions actions={widget.actions} />}
    />
  );
};
