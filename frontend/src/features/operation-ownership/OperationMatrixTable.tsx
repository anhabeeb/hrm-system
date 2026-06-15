import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { statusBadge } from "./OperationOwnershipShared";
import type { OperationResponsibility } from "./operation-ownership.types";

export const OperationMatrixTable = ({
  rows,
  loading,
  canManage,
  onEdit,
  onEnable,
  onDisable,
  onArchive,
}: {
  rows: OperationResponsibility[];
  loading?: boolean;
  canManage?: boolean;
  onEdit: (row: OperationResponsibility) => void;
  onEnable: (row: OperationResponsibility) => void;
  onDisable: (row: OperationResponsibility) => void;
  onArchive: (row: OperationResponsibility) => void;
}) => (
  <DataTable<OperationResponsibility>
    compact
    loading={loading}
    rows={rows}
    getRowId={(row) => row.id}
    emptyTitle="No operation responsibilities configured."
    columns={[
      { key: "operation_code", header: "Operation" },
      { key: "responsibility_type", header: "Responsibility" },
      { key: "target_type", header: "Target type", cell: (row) => row.target_type ?? "Legacy" },
      { key: "business_function_name", header: "Business function", cell: (row) => row.business_function_name ?? row.business_function_code ?? "Not set" },
      { key: "department_name", header: "Department", cell: (row) => row.department_name ?? "Dynamic/none" },
      { key: "level", header: "Level range", cell: (row) => row.min_level || row.max_level ? `${row.min_level ?? 1}-${row.max_level ?? 4}` : "Any" },
      { key: "required_permission", header: "Required permission", cell: (row) => row.required_permission ?? row.permission_key ?? "Not set" },
      { key: "required_role_id", header: "Required role", cell: (row) => row.role_name ?? row.required_role_id ?? row.role_id ?? "Not set" },
      { key: "fallback_behavior", header: "Fallback" },
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
