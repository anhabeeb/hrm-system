import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { SyncBatch } from "./sync.types";

const columns: TableColumn<SyncBatch>[] = [
  { key: "batch_id", header: "Batch ID / Reference", cell: (row) => row.batch_id ?? row.id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "device_name", header: "Device", cell: (row) => row.device_name ?? row.device_id ?? "—" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "started_at", header: "Started At", cell: (row) => formatDateTime(row.started_at ?? row.created_at) },
  { key: "completed_at", header: "Completed At", cell: (row) => formatDateTime(row.completed_at) },
  { key: "pending_count", header: "Pending", cell: (row) => row.pending_count ?? 0 },
  { key: "failed_count", header: "Failed", cell: (row) => row.failed_count ?? 0 },
  { key: "conflict_count", header: "Conflicts", cell: (row) => row.conflict_count ?? 0 },
];

export const SyncBatchTable = ({ rows, loading, pagination, onView, onPageChange, onPageSizeChange }: { rows: SyncBatch[]; loading?: boolean; pagination?: Pagination; onView: (row: SyncBatch) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} compact pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onRowClick={onView} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => onView(row) }]} />} emptyTitle="No sync batches found" />
);
