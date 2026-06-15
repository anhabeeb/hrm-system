import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { statusBadge, yesNo } from "./OperationOwnershipShared";
import type { BusinessFunction } from "./operation-ownership.types";

export const BusinessFunctionsTable = ({
  rows,
  loading,
  canManage,
  onEdit,
  onEnable,
  onDisable,
  onArchive,
}: {
  rows: BusinessFunction[];
  loading?: boolean;
  canManage?: boolean;
  onEdit: (row: BusinessFunction) => void;
  onEnable: (row: BusinessFunction) => void;
  onDisable: (row: BusinessFunction) => void;
  onArchive: (row: BusinessFunction) => void;
}) => (
  <DataTable
    compact
    loading={loading}
    rows={rows}
    getRowId={(row) => row.id}
    emptyTitle="No business functions found."
    columns={[
      { key: "code", header: "Code" },
      { key: "name", header: "Business function" },
      { key: "assignment_count", header: "Assignments", cell: (row) => row.assignment_count ?? 0 },
      { key: "is_sensitive", header: "Sensitive", cell: (row) => yesNo(row.is_sensitive) },
      { key: "is_active", header: "Status", cell: (row) => statusBadge(row.is_active) },
    ]}
    rowActions={canManage ? (row) => (
      <RowActions actions={[
        { key: "edit", onSelect: () => onEdit(row) },
        row.is_active === 1 ? { key: "disable", label: "Disable", onSelect: () => onDisable(row) } : { key: "enable", label: "Enable", onSelect: () => onEnable(row) },
        { key: "delete", label: "Archive", onSelect: () => onArchive(row) },
      ]} />
    ) : undefined}
  />
);
