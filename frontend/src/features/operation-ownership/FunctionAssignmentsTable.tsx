import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { statusBadge, yesNo } from "./OperationOwnershipShared";
import type { FunctionAssignment } from "./operation-ownership.types";

export const FunctionAssignmentsTable = ({
  rows,
  loading,
  canManage,
  onEdit,
  onEnable,
  onDisable,
  onArchive,
}: {
  rows: FunctionAssignment[];
  loading?: boolean;
  canManage?: boolean;
  onEdit: (row: FunctionAssignment) => void;
  onEnable: (row: FunctionAssignment) => void;
  onDisable: (row: FunctionAssignment) => void;
  onArchive: (row: FunctionAssignment) => void;
}) => (
  <DataTable
    compact
    loading={loading}
    rows={rows}
    getRowId={(row) => row.id}
    emptyTitle="No function department assignments found."
    columns={[
      { key: "business_function_name", header: "Business function", cell: (row) => row.business_function_name ?? row.business_function_code ?? "Not set" },
      { key: "department_name", header: "Department", cell: (row) => row.department_name ?? "Not set" },
      { key: "assignment_type", header: "Type" },
      { key: "is_primary", header: "Primary", cell: (row) => yesNo(row.is_primary) },
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
