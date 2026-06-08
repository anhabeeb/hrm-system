import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, humanize } from "./leave-format";
import type { LeaveRequest } from "./leave.types";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";

const columns: TableColumn<LeaveRequest>[] = [
  { key: "created_at", header: "Request Date", cell: (row) => formatDate(row.created_at) },
  { key: "employee_code", header: "Code", cell: (row) => row.employee_code ?? "—" },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Unknown employee" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "leave_type_name", header: "Leave Type", cell: (row) => row.leave_type_name ?? row.leave_type_id ?? "—" },
  { key: "start_date", header: "Start Date", cell: (row) => formatDate(row.start_date) },
  { key: "end_date", header: "End Date", cell: (row) => formatDate(row.end_date) },
  { key: "total_days", header: "Days", cell: (row) => row.total_days ?? "—" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "requested_by", header: "Requested By", cell: (row) => row.requested_by_name ?? row.requested_by ?? "—" },
];

export const LeaveRequestsTable = ({ rows, loading, pagination, canApprove, canReject, canCancel, canWithdraw, canEscalate, onView, onTimeline, onApprove, onReject, onCancel, onWithdraw, onEscalate, onPageChange, onPageSizeChange }: {
  rows: LeaveRequest[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove: boolean;
  canReject: boolean;
  canCancel: boolean;
  canWithdraw: boolean;
  canEscalate: boolean;
  onView: (row: LeaveRequest) => void;
  onTimeline: (row: LeaveRequest) => void;
  onApprove: (row: LeaveRequest) => void;
  onReject: (row: LeaveRequest) => void;
  onCancel: (row: LeaveRequest) => void;
  onWithdraw: (row: LeaveRequest) => void;
  onEscalate: (row: LeaveRequest) => void;
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
      <RowActions actions={[
        { key: "view", onSelect: () => onView(row) },
        { key: "more", label: "Timeline", onSelect: () => onTimeline(row) },
        ...(canApprove ? [{ key: "approve" as const, label: "Approve", onSelect: () => onApprove(row) }] : []),
        ...(canReject ? [{ key: "reject" as const, label: "Reject", onSelect: () => onReject(row) }] : []),
        ...(canWithdraw ? [{ key: "archive" as const, label: "Withdraw", onSelect: () => onWithdraw(row) }] : []),
        ...(canCancel ? [{ key: "disable" as const, label: `Cancel ${humanize(row.status)}`, onSelect: () => onCancel(row) }] : []),
        ...(canEscalate ? [{ key: "edit" as const, label: "Escalate", onSelect: () => onEscalate(row) }] : []),
      ]} />
    )}
    emptyTitle="No leave requests found"
  />
);
