import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import { formatDate, humanize } from "./leave-format";
import type { LeaveRequest } from "./leave.types";

const columns: TableColumn<LeaveRequest>[] = [
  { key: "submitted_at", header: "Submitted", cell: (row) => formatDate(row.submitted_at ?? row.created_at) },
  { key: "employee_code", header: "Code", cell: (row) => row.employee_code ?? "-" },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Unknown employee" },
  { key: "leave_type_name", header: "Leave Type", cell: (row) => row.leave_type_name ?? row.leave_type_id ?? "-" },
  { key: "dates", header: "Dates", cell: (row) => `${formatDate(row.start_date)} to ${formatDate(row.end_date)}` },
  { key: "total_days", header: "Days", cell: (row) => row.total_days ?? "-" },
  { key: "current_step_order", header: "Step", cell: (row) => row.current_step_order ? `Level ${row.current_step_order}` : "Review" },
  { key: "approval_status", header: "Approval", cell: (row) => <StatusBadge status={row.approval_status ?? row.status} /> },
  { key: "required_permission_key", header: "Approver Rule", cell: (row) => row.required_permission_key ?? humanize(row.approver_type ?? "approver") },
];

export const LeaveApprovalInboxTable = ({
  rows,
  loading,
  pagination,
  canApprove,
  canReject,
  canDelegate,
  onView,
  onApprove,
  onReject,
  onDelegate,
  onPageChange,
  onPageSizeChange,
}: {
  rows: LeaveRequest[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove: boolean;
  canReject: boolean;
  canDelegate: boolean;
  onView: (row: LeaveRequest) => void;
  onApprove: (row: LeaveRequest) => void;
  onReject: (row: LeaveRequest) => void;
  onDelegate: (row: LeaveRequest) => void;
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
        ...(canApprove ? [{ key: "approve" as const, label: "Approve", onSelect: () => onApprove(row) }] : []),
        ...(canReject ? [{ key: "reject" as const, label: "Reject", onSelect: () => onReject(row) }] : []),
        ...(canDelegate ? [{ key: "edit" as const, label: "Delegate", onSelect: () => onDelegate(row) }] : []),
      ]} />
    )}
    emptyTitle="No approval items waiting"
    emptyDescription="Leave requests that need your review will appear here."
  />
);
