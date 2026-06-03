import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { DeviceRecord } from "./devices.types";

const columns: TableColumn<DeviceRecord>[] = [
  { key: "device_name", header: "Device Name", cell: (row) => row.device_name ?? row.name ?? row.id },
  { key: "device_type", header: "Device Type", cell: (row) => humanize(row.device_type) },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "last_seen_at", header: "Last Seen", cell: (row) => formatDateTime(row.last_seen_at) },
  { key: "last_sync_at", header: "Last Sync", cell: (row) => formatDateTime(row.last_sync_at) },
  { key: "health_status", header: "Health", cell: (row) => <StatusBadge status={row.health_status ?? "neutral"} /> },
  { key: "pending_count", header: "Pending", cell: (row) => row.pending_count ?? 0 },
  { key: "failed_count", header: "Failed", cell: (row) => row.failed_count ?? 0 },
];

export const DeviceTable = ({
  rows,
  loading,
  pagination,
  canEdit,
  canRotate,
  onView,
  onStatus,
  onRotate,
  onPageChange,
  onPageSizeChange,
}: {
  rows: DeviceRecord[];
  loading?: boolean;
  pagination?: Pagination;
  canEdit: boolean;
  canRotate: boolean;
  onView: (row: DeviceRecord) => void;
  onStatus: (row: DeviceRecord) => void;
  onRotate: (row: DeviceRecord) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) => (
  <DataTable
    columns={columns}
    rows={rows}
    getRowId={(row) => row.id}
    loading={loading}
    compact
    pagination={pagination}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    onRowClick={onView}
    rowActions={(row) => (
      <RowActions
        actions={[
          { key: "view", onSelect: () => onView(row) },
          ...(canEdit ? [{ key: row.status === "active" ? "disable" as const : "enable" as const, label: row.status === "active" ? "Disable" : "Enable", onSelect: () => onStatus(row) }] : []),
          ...(canRotate ? [{ key: "reset-password" as const, label: "Rotate token", onSelect: () => onRotate(row) }] : []),
        ]}
      />
    )}
    emptyTitle="No kiosk devices found"
  />
);
