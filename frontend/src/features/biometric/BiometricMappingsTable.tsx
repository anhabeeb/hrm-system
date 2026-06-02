import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { BiometricMapping } from "./biometric.types";

const columns: TableColumn<BiometricMapping>[] = [
  { key: "biometric_user_id", header: "Biometric User ID" },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id ?? "Unknown employee" },
  { key: "device_name", header: "Device", cell: (row) => row.device_name ?? row.device_id ?? "—" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "enrollment_status", header: "Status", cell: (row) => <StatusBadge status={row.is_active === false || row.is_active === 0 ? "disabled" : row.enrollment_status ?? "active"} /> },
  { key: "confidence", header: "Confidence", cell: (row) => row.confidence ?? "—" },
];

export const BiometricMappingsTable = ({ rows, loading, pagination, canMap, onEdit, onDisable, onPageChange, onPageSizeChange }: { rows: BiometricMapping[]; loading?: boolean; pagination?: Pagination; canMap: boolean; onEdit: (row: BiometricMapping) => void; onDisable: (row: BiometricMapping) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} compact pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} rowActions={(row) => <RowActions actions={[...(canMap ? [{ key: "edit" as const, onSelect: () => onEdit(row) }, { key: "disable" as const, label: "Disable mapping", onSelect: () => onDisable(row) }] : [])]} />} emptyTitle="No biometric mappings found" />
);
