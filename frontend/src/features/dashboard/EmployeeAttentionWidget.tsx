import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import { WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget } from "./commandCenter.utils";

export const EmployeeAttentionWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["employee_attention"] }) => {
  if (!shouldShowWidget(widget)) return null;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<AlertTriangle className="h-4 w-4" />}>
      <DataTable
        compact
        columns={[
          { key: "title", header: "Attention" },
          { key: "category", header: "Area" },
          { key: "count", header: "Count" },
          { key: "priority", header: "Priority", cell: (row) => <StatusBadge status={row.priority} /> },
          { key: "href", header: "Open", cell: (row) => row.href ? <Link className="text-sm font-medium text-primary hover:underline" to={row.href}>Open</Link> : "-" },
        ]}
        rows={widget.rows ?? []}
        getRowId={(row) => row.id}
        emptyTitle="No employee attention items."
        emptyDescription="No employee setup issues found."
      />
    </WidgetCard>
  );
};
