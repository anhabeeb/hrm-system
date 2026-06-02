import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { AdvancePayment } from "./advances.types";

const columns: TableColumn<AdvancePayment>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "amount", header: "Amount", cell: (row) => <MoneyAmount amount={row.amount} /> },
  { key: "paid_date", header: "Paid date", cell: (row) => formatDate(row.paid_date) },
  { key: "deduction_month", header: "Deduction month" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
  { key: "created_at", header: "Created", cell: (row) => formatDateTime(row.created_at) },
];

export const AdvancesTable = ({
  rows,
  loading,
  pagination,
  canApprove,
  canReject,
  onView,
  onApprove,
  onReject,
  onPageChange,
  onPageSizeChange,
}: {
  rows: AdvancePayment[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove?: boolean;
  canReject?: boolean;
  onView: (row: AdvancePayment) => void;
  onApprove: (row: AdvancePayment) => void;
  onReject: (row: AdvancePayment) => void;
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
    emptyTitle="No advances"
    emptyDescription="Advance payments requested for payroll deduction will appear here."
    rowActions={(row) => <RowActions actions={[
      { key: "view", onSelect: () => onView(row) },
      { key: "approve", onSelect: () => onApprove(row), disabled: !canApprove || row.status !== "pending" },
      { key: "reject", onSelect: () => onReject(row), disabled: !canReject || row.status !== "pending" },
    ]} />}
  />
);
