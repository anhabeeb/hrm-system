import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { PayrollItem } from "./payroll.types";

const columns: TableColumn<PayrollItem>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "gross_amount", header: "Gross", cell: (row) => <MoneyAmount amount={row.gross_amount ?? row.total_earnings_amount} /> },
  { key: "total_deductions_amount", header: "Deductions", cell: (row) => <MoneyAmount amount={row.total_deductions_amount} /> },
  { key: "net_amount", header: "Net", cell: (row) => <MoneyAmount amount={row.net_amount} /> },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "draft"} /> },
  { key: "payslip_status", header: "Payslip", cell: (row) => <StatusBadge status={row.payslip_status ?? "pending"} /> },
];

export const PayrollItemsTable = ({
  rows,
  loading,
  pagination,
  onView,
  onPageChange,
  onPageSizeChange,
}: {
  rows: PayrollItem[];
  loading?: boolean;
  pagination?: Pagination;
  onView: (row: PayrollItem) => void;
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
    emptyTitle="No payroll items"
    emptyDescription="Select or calculate a payroll run to review employee rows."
    rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => onView(row) }]} />}
  />
);
