import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { AssetDeduction } from "./assets.types";

const columns: TableColumn<AssetDeduction>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id },
  { key: "asset_name", header: "Asset", cell: (row) => row.asset_name ?? row.asset_code ?? row.asset_id },
  { key: "amount", header: "Amount", cell: (row) => <MoneyAmount amount={row.amount ?? row.deduction_amount} /> },
  { key: "deduction_month", header: "Deduction Month" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
  { key: "approval_status", header: "Approval", cell: (row) => <StatusBadge status={row.approval_status ?? "pending"} /> },
];

export const AssetDeductionsTable = ({ rows, loading, pagination, canApprove, onApprove, onReject, onPageChange, onPageSizeChange }: {
  rows: AssetDeduction[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove?: boolean;
  onApprove: (row: AssetDeduction) => void;
  onReject: (row: AssetDeduction) => void;
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
    emptyTitle="No asset deductions"
    emptyDescription="Deduction requests from lost or damaged assets will appear here."
    rowActions={canApprove ? (row) => <RowActions actions={[{ key: "approve", onSelect: () => onApprove(row) }, { key: "reject", onSelect: () => onReject(row) }]} /> : undefined}
  />
);
