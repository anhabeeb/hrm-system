import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { BiometricLog } from "./biometric.types";

const columns: TableColumn<BiometricLog>[] = [
  { key: "event_time", header: "Timestamp", cell: (row) => formatDateTime(row.event_time) },
  { key: "biometric_user_id", header: "Biometric User ID" },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Unmatched" },
  { key: "device_name", header: "Device", cell: (row) => row.device_name ?? row.device_id ?? "—" },
  { key: "event_type", header: "Event Type", cell: (row) => humanize(row.event_type) },
  { key: "match_status", header: "Match Status", cell: (row) => <StatusBadge status={row.match_status ?? (row.employee_id ? "active" : "warning")} /> },
  { key: "sync_status", header: "Process Status", cell: (row) => <StatusBadge status={row.sync_status ?? row.status ?? "neutral"} /> },
];

export const BiometricLogsTable = ({ rows, loading, pagination, canReprocess, onView, onReprocess, onReject, onPageChange, onPageSizeChange }: { rows: BiometricLog[]; loading?: boolean; pagination?: Pagination; canReprocess: boolean; onView: (row: BiometricLog) => void; onReprocess: (row: BiometricLog) => void; onReject: (row: BiometricLog) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} compact pagination={pagination} onRowClick={onView} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => onView(row) }, ...(canReprocess ? [{ key: "approve" as const, label: "Reprocess", onSelect: () => onReprocess(row) }, { key: "reject" as const, label: "Reject punch", onSelect: () => onReject(row) }] : [])]} />} emptyTitle="No biometric logs found" />
);
