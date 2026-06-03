import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import { attendanceIssueText, formatDate, formatDateTime, humanize } from "./attendance-format";
import type { AttendanceSummary } from "./attendance.types";

const employeeName = (row: AttendanceSummary) => row.employee_name ?? row.full_name ?? row.employee_id ?? "Unknown employee";

const columns: TableColumn<AttendanceSummary>[] = [
  { key: "attendance_date", header: "Date", cell: (row) => formatDate(row.attendance_date ?? row.date) },
  { key: "employee_code", header: "Code", cell: (row) => row.employee_code ?? "—" },
  { key: "employee_name", header: "Employee", cell: employeeName },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "first_clock_in", header: "Clock In", cell: (row) => formatDateTime(row.first_clock_in ?? row.clock_in_time) },
  { key: "last_clock_out", header: "Clock Out", cell: (row) => formatDateTime(row.last_clock_out ?? row.clock_out_time) },
  { key: "late_minutes", header: "Late", cell: (row) => row.late_minutes ?? 0 },
  { key: "early_out_minutes", header: "Early Out", cell: (row) => row.early_out_minutes ?? 0 },
  { key: "overtime_minutes", header: "Overtime", cell: (row) => row.overtime_minutes ?? 0 },
  { key: "issues", header: "Issues", cell: (row) => attendanceIssueText(row.issues, row.issue_type ?? (["missing_clock_in", "missing_clock_out", "conflict"].includes(row.status) ? row.status : undefined)) },
];

export const AttendanceSummaryTable = ({
  rows,
  loading,
  pagination,
  canRequestCorrection,
  canManualEntry,
  onView,
  onCorrection,
  onManualEntry,
  onPageChange,
  onPageSizeChange,
}: {
  rows: AttendanceSummary[];
  loading?: boolean;
  pagination?: Pagination;
  canRequestCorrection: boolean;
  canManualEntry: boolean;
  onView: (row: AttendanceSummary) => void;
  onCorrection: (row: AttendanceSummary) => void;
  onManualEntry: (row: AttendanceSummary) => void;
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
          ...(canRequestCorrection ? [{ key: "edit" as const, label: "Request correction", onSelect: () => onCorrection(row) }] : []),
          ...(canManualEntry ? [{ key: "approve" as const, label: "Add manual entry", onSelect: () => onManualEntry(row) }] : []),
        ]}
      />
    )}
    emptyTitle="No attendance summaries found"
    emptyDescription={`Try changing the date range or filters. Current status filter: ${humanize(rows[0]?.status)}`}
  />
);
