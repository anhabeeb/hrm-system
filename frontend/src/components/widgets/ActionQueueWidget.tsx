import { Link } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { Badge } from "@/components/ui/badge";

import { WidgetCard, type WidgetCardProps } from "./WidgetCard";

export interface ActionQueueRow {
  id: string;
  moduleName: string;
  count: number;
  oldestPendingAge?: string | null;
  priority?: string | null;
  href?: string | null;
}

export const ActionQueueWidget = ({
  rows,
  ...props
}: Omit<WidgetCardProps, "children"> & { rows: ActionQueueRow[] }) => (
  <WidgetCard {...props}>
    <DataTable
      compact
      columns={[
        { key: "moduleName", header: "Module" },
        { key: "count", header: "Count" },
        { key: "oldestPendingAge", header: "Oldest" },
        { key: "priority", header: "Priority", cell: (row) => row.priority ? <Badge variant="outline">{row.priority}</Badge> : "-" },
        { key: "href", header: "Open", cell: (row) => row.href ? <Link className="text-sm font-medium text-primary hover:underline" to={row.href}>Open</Link> : "-" },
      ]}
      rows={rows}
      getRowId={(row) => row.id}
      emptyTitle="No pending actions."
      emptyDescription="There is nothing waiting in this queue right now."
    />
  </WidgetCard>
);
