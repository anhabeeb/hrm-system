import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import { formatDate, humanize } from "./attendance-format";
import type { AttendanceConflict } from "./attendance.types";

const columns: TableColumn<AttendanceConflict>[] = [
  { key: "created_at", header: "Date", cell: (row) => formatDate(row.attendance_date ?? row.event_time ?? row.created_at) },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Unknown employee" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "conflict_type", header: "Conflict Type", cell: (row) => humanize(row.conflict_type) },
  { key: "message", header: "Message", cell: (row) => row.message ?? "Review attendance rule conflict." },
  { key: "source", header: "Source", cell: (row) => humanize(row.source) },
  { key: "severity", header: "Severity", cell: (row) => <StatusBadge status={row.severity ?? "warning"} /> },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
];

export const AttendanceConflictPanel = ({
  rows,
  loading,
  pagination,
  canResolve,
  onView,
  onResolve,
  onPageChange,
  onPageSizeChange,
}: {
  rows: AttendanceConflict[];
  loading?: boolean;
  pagination?: Pagination;
  canResolve: boolean;
  onView: (row: AttendanceConflict) => void;
  onResolve: (row: AttendanceConflict) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) => (
  <DataTable
    rows={rows}
    columns={columns}
    getRowId={(row) => row.id}
    loading={loading}
    compact
    pagination={pagination}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    onRowClick={onView}
    rowActions={(row) => (
      <RowActions actions={[{ key: "view", onSelect: () => onView(row) }, ...(canResolve ? [{ key: "approve" as const, label: "Resolve", onSelect: () => onResolve(row) }] : [])]} />
    )}
    emptyTitle="No attendance conflicts found"
  />
);
