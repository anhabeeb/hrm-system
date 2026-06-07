import { DataTable } from "@/components/data/DataTable";
import { RowActions, type RowAction } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { Payslip } from "./payslips.types";

const formatMoney = (value: unknown, currency = "MVR") => {
  const amount = Number(value ?? 0) / 100;
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const currency = (row: Payslip) => String(row.totals?.currency ?? row.payroll_period?.currency ?? "MVR");

const columns: TableColumn<Payslip>[] = [
  { key: "payroll_month", header: "Payroll month" },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "gross", header: "Gross", cell: (row) => formatMoney(row.totals?.gross_amount, currency(row)) },
  { key: "deductions", header: "Deductions", cell: (row) => formatMoney(row.totals?.total_deductions_amount, currency(row)) },
  { key: "net", header: "Net", cell: (row) => formatMoney(row.totals?.net_amount, currency(row)) },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
  { key: "generated_at", header: "Generated", cell: (row) => formatDateTime(row.generated_at ?? row.created_at) },
  { key: "finalized_at", header: "Finalized", cell: (row) => formatDateTime(row.finalized_at ?? row.published_at) },
];

export const PayslipsTable = ({
  rows,
  loading,
  pagination,
  onView,
  onDownload,
  canDownload,
  onPageChange,
  onPageSizeChange,
}: {
  rows: Payslip[];
  loading?: boolean;
  pagination?: Pagination;
  onView: (row: Payslip) => void;
  onDownload: (row: Payslip) => void;
  canDownload?: boolean;
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
    emptyTitle="No payslips"
    emptyDescription="Finalize payroll to create immutable payslip snapshots."
    rowActions={(row) => {
      const actions: RowAction[] = [{ key: "view", onSelect: () => onView(row) }];
      if (canDownload) actions.push({ key: "download", label: "Print / save PDF", onSelect: () => onDownload(row) });
      return <RowActions actions={actions} />;
    }}
  />
);
