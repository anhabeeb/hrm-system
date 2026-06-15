import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

import { StatusStrip, type StatusStripItem } from "./StatusStrip";
import { WidgetCard, type WidgetCardProps } from "./WidgetCard";

export const ModuleHealthCard = ({
  status = "Ready",
  warnings = [],
  metrics = [],
  children,
  ...props
}: Omit<WidgetCardProps, "children"> & {
  status?: string;
  warnings?: string[];
  metrics?: StatusStripItem[];
  children?: ReactNode;
}) => (
  <WidgetCard
    {...props}
    action={<Badge variant={warnings.length ? "warning" : "success"}>{status}</Badge>}
  >
    <div className="space-y-3">
      {metrics.length ? <StatusStrip items={metrics} /> : null}
      {warnings.length ? (
        <ul className="space-y-1 text-xs text-amber-700">
          {warnings.map((warning) => <li key={warning}>- {warning}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No setup warnings detected.</p>
      )}
      {children}
    </div>
  </WidgetCard>
);
