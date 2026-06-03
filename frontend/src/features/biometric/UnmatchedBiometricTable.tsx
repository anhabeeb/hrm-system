import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { BiometricLog } from "./biometric.types";

const columns: TableColumn<BiometricLog>[] = [
  { key: "event_time", header: "Timestamp", cell: (row) => formatDateTime(row.event_time) },
  { key: "device_name", header: "Device", cell: (row) => row.device_name ?? row.device_id ?? "—" },
  { key: "biometric_user_id", header: "Biometric User ID" },
  { key: "event_type", header: "Event Type", cell: (row) => humanize(row.event_type) },
  { key: "reason", header: "Reason", cell: (row) => row.reason ?? "This biometric user is not mapped to an employee." },
];

export const UnmatchedBiometricTable = ({ rows, loading, pagination, canMap, onMap, onPageChange, onPageSizeChange }: { rows: BiometricLog[]; loading?: boolean; pagination?: Pagination; canMap: boolean; onMap: (row: BiometricLog) => void; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} compact pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} rowActions={(row) => <RowActions actions={[...(canMap ? [{ key: "assign-role" as const, label: "Map employee", onSelect: () => onMap(row) }] : [])]} />} emptyTitle="No unmatched biometric logs found" />
);
