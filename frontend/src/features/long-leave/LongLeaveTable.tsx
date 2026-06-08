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
  { key: "approval_status", header: "Approval", cell: (row) => <StatusBadge status={row.approval_status ?? row.status} /> },
  { key: "payroll_status", header: "Payroll", cell: (row) => <StatusBadge status={row.payroll_status ?? "not_started"} /> },
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
  canSubmit,
  canCancel,
  canPayrollPreview,
  canPayrollApply,
  onView,
  onSubmit,
  onApprove,
  onReject,
  onCancel,
  onReturn,
  onConfirm,
  onPayrollPreview,
  onPayrollApply,
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
  canSubmit?: boolean;
  canCancel?: boolean;
  canPayrollPreview?: boolean;
  canPayrollApply?: boolean;
  onView: (row: LongLeaveRecord) => void;
  onSubmit: (row: LongLeaveRecord) => void;
  onApprove: (row: LongLeaveRecord) => void;
  onReject: (row: LongLeaveRecord) => void;
  onCancel: (row: LongLeaveRecord) => void;
  onReturn: (row: LongLeaveRecord) => void;
  onConfirm: (row: LongLeaveRecord) => void;
  onPayrollPreview: (row: LongLeaveRecord) => void;
  onPayrollApply: (row: LongLeaveRecord) => void;
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
      if (canSubmit) actions.push({ key: "edit", label: "Submit", onSelect: () => onSubmit(row), disabled: !["draft"].includes(row.status) });
      if (canConfirm) actions.push({ key: "enable", label: "Confirm salary impact", onSelect: () => onConfirm(row) });
      if (canPayrollPreview) actions.push({ key: "download", label: "Payroll preview", onSelect: () => onPayrollPreview(row) });
      if (canPayrollApply) actions.push({ key: "carry-forward", label: "Apply payroll review", onSelect: () => onPayrollApply(row), disabled: row.payroll_status === "payroll_adjusted" });
      if (canApprove) actions.push({ key: "approve", label: "Approve", onSelect: () => onApprove(row), disabled: !["pending", "pending_approval", "submitted"].includes(row.status) });
      if (canReject) actions.push({ key: "reject", label: "Reject", onSelect: () => onReject(row), disabled: !["pending", "pending_approval", "submitted"].includes(row.status) });
      if (canCancel) actions.push({ key: "delete", label: "Cancel", onSelect: () => onCancel(row), disabled: ["cancelled", "returned", "rejected"].includes(row.status) });
      if (canReturn) actions.push({ key: "more", label: "Confirm return", onSelect: () => onReturn(row) });
      return <RowActions actions={actions} />;
    }}
  />
);
