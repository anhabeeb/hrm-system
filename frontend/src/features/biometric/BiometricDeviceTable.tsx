import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { BiometricDevice } from "./biometric.types";

const columns: TableColumn<BiometricDevice>[] = [
  { key: "device_name", header: "Device Name", cell: (row) => row.device_name ?? row.id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "vendor", header: "Vendor / Model", cell: (row) => [row.vendor, row.model].filter(Boolean).join(" / ") || humanize(row.device_type) },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "last_sync_at", header: "Last Sync", cell: (row) => formatDateTime(row.last_sync_at ?? row.last_seen_at) },
  { key: "health_status", header: "Health", cell: (row) => <StatusBadge status={row.health_status ?? "neutral"} /> },
];

export const BiometricDeviceTable = ({ rows, loading, pagination, canManage, onEdit, onStatus, onRevoke, onRotate, onPageChange, onPageSizeChange }: { rows: BiometricDevice[]; loading?: boolean; pagination?: Pagination; canManage: boolean; onEdit: (row: BiometricDevice) => void; onStatus: (row: BiometricDevice) => void; onRevoke: (row: BiometricDevice) => void; onRotate: (row: BiometricDevice) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} compact pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} rowActions={(row) => <RowActions actions={[{ key: "view", label: "View/Edit", onSelect: () => onEdit(row) }, ...(canManage ? [{ key: row.status === "active" ? "disable" as const : "enable" as const, label: row.status === "active" ? "Suspend" : "Activate", onSelect: () => onStatus(row) }, { key: "reject" as const, label: "Revoke", onSelect: () => onRevoke(row) }, { key: "reset-password" as const, label: "Rotate token", onSelect: () => onRotate(row) }] : [])]} />} emptyTitle="No biometric devices found" />
);
