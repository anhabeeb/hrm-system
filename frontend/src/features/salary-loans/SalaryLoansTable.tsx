import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { SalaryLoan } from "./salary-loans.types";

const columns: TableColumn<SalaryLoan>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "loan_amount", header: "Loan", cell: (row) => <MoneyAmount amount={row.loan_amount} /> },
  { key: "outstanding_amount", header: "Outstanding", cell: (row) => <MoneyAmount amount={row.outstanding_amount} /> },
  { key: "installment_amount", header: "Installment", cell: (row) => <MoneyAmount amount={row.installment_amount} /> },
  { key: "start_month", header: "Start month" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
  { key: "created_at", header: "Created", cell: (row) => formatDateTime(row.created_at) },
];

export const SalaryLoansTable = ({
  rows,
  loading,
  pagination,
  canApprove,
  canPause,
  canSettle,
  onView,
  onApprove,
  onPause,
  onSettle,
  onPageChange,
  onPageSizeChange,
}: {
  rows: SalaryLoan[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove?: boolean;
  canPause?: boolean;
  canSettle?: boolean;
  onView: (row: SalaryLoan) => void;
  onApprove: (row: SalaryLoan) => void;
  onPause: (row: SalaryLoan) => void;
  onSettle: (row: SalaryLoan) => void;
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
    onRowClick={onView}
    emptyTitle="No salary loans"
    emptyDescription="Salary loan schedules and payroll deductions will appear here."
    rowActions={(row) => <RowActions actions={[
      { key: "view", onSelect: () => onView(row) },
      { key: "approve", onSelect: () => onApprove(row), disabled: !canApprove || row.status !== "pending" },
      { key: "more", label: "Pause", onSelect: () => onPause(row), disabled: !canPause || row.status !== "approved" && row.status !== "active" },
      { key: "approve", label: "Settle", onSelect: () => onSettle(row), disabled: !canSettle || row.status === "settled" },
    ]} />}
  />
);
