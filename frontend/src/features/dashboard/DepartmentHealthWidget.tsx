import { Building2 } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { WidgetCard } from "@/components/widgets";

import type { CommandCenterResponse } from "./commandCenter.types";
import { shouldShowWidget } from "./commandCenter.utils";

export const DepartmentHealthWidget = ({ widget }: { widget: CommandCenterResponse["widgets"]["department_health"] }) => {
  if (!shouldShowWidget(widget)) return null;
  return (
    <WidgetCard title={widget.title} description={widget.description} icon={<Building2 className="h-4 w-4" />}>
      <DataTable
        compact
        columns={[
          { key: "department_name", header: "Department" },
          { key: "total", header: "Employees" },
          { key: "pending_approvals", header: "Approvals", cell: (row) => row.pending_approvals ?? "-" },
          { key: "missing_documents", header: "Docs", cell: (row) => row.missing_documents ?? "-" },
        ]}
        rows={widget.rows ?? []}
        getRowId={(row) => row.department_id ?? row.department_name ?? "department-health-row"}
        emptyTitle="No department health rows available."
        emptyDescription="Department overview appears when scoped employee data is available."
      />
    </WidgetCard>
  );
};
