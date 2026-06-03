import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { SyncConflict } from "./sync.types";

const columns: TableColumn<SyncConflict>[] = [
  { key: "conflict_type", header: "Conflict Type", cell: (row) => humanize(row.conflict_type) },
  { key: "entity_type", header: "Entity", cell: (row) => humanize(row.entity_type) },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "device_name", header: "Device", cell: (row) => row.device_name ?? row.device_id ?? "—" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "severity", header: "Severity", cell: (row) => <StatusBadge status={row.severity ?? "warning"} /> },
  { key: "created_at", header: "Created At", cell: (row) => formatDateTime(row.created_at) },
];

export const SyncConflictTable = ({ rows, loading, pagination, canResolve, onView, onResolve, onPageChange, onPageSizeChange }: { rows: SyncConflict[]; loading?: boolean; pagination?: Pagination; canResolve: boolean; onView: (row: SyncConflict) => void; onResolve: (row: SyncConflict) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) => (
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
    rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => onView(row) }, ...(canResolve ? [{ key: "approve" as const, label: "Resolve", onSelect: () => onResolve(row) }] : [])]} />}
    emptyTitle="No sync conflicts found"
  />
);
