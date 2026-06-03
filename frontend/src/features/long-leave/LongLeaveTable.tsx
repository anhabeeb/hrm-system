import { DataTable } from "@/components/data/DataTable";
import { RowActions, type RowAction } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { LongLeaveRecord } from "./long-leave.types";

const columns: TableColumn<LongLeaveRecord>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "start_date", header: "Start", cell: (row) => formatDate(row.start_date) },
  { key: "expected_return_date", header: "Expected return", cell: (row) => formatDate(row.expected_return_date) },
  { key: "actual_return_date", header: "Actual return", cell: (row) => formatDate(row.actual_return_date) },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  {
    key: "salary_impact_confirmed",
    header: "Salary impact",
    cell: (row) => <StatusBadge status={row.salary_impact_confirmed ? "approved" : "pending"} label={row.salary_impact_confirmed ? "Confirmed" : "Review needed"} />,
  },
];

export const LongLeaveTable = ({
  rows,
  loading,
  pagination,
  canApprove,
  canReject,
  canReturn,
  canConfirm,
  onView,
  onApprove,
  onReject,
  onReturn,
  onConfirm,
  onPageChange,
  onPageSizeChange,
}: {
  rows: LongLeaveRecord[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove?: boolean;
  canReject?: boolean;
  canReturn?: boolean;
  canConfirm?: boolean;
  onView: (row: LongLeaveRecord) => void;
  onApprove: (row: LongLeaveRecord) => void;
  onReject: (row: LongLeaveRecord) => void;
  onReturn: (row: LongLeaveRecord) => void;
  onConfirm: (row: LongLeaveRecord) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) => (
  <DataTable
    columns={columns}
    rows={rows}
    getRowId={(row) => row.id}
    loading={loading}
    pagination={pagination}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    emptyTitle="No long leave records"
    emptyDescription="Long leave records that need salary-impact review will appear here."
    onRowClick={onView}
    rowActions={(row) => {
      const actions: RowAction[] = [{ key: "view", onSelect: () => onView(row) }];
      if (canConfirm) actions.push({ key: "approve", label: "Confirm salary impact", onSelect: () => onConfirm(row) });
      if (canApprove) actions.push({ key: "approve", label: "Approve", onSelect: () => onApprove(row), disabled: humanize(row.status) !== "Pending" });
      if (canReject) actions.push({ key: "reject", label: "Reject", onSelect: () => onReject(row), disabled: humanize(row.status) !== "Pending" });
      if (canReturn) actions.push({ key: "more", label: "Confirm return", onSelect: () => onReturn(row) });
      return <RowActions actions={actions} />;
    }}
  />
);
