import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { LeaveBalance } from "./leave.types";

const columns: TableColumn<LeaveBalance>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id },
  { key: "leave_type_name", header: "Leave Type", cell: (row) => row.leave_type_name ?? row.leave_type_id },
  { key: "year", header: "Year" },
  { key: "opening_balance", header: "Opening", cell: (row) => row.opening_balance ?? 0 },
  { key: "accrued_days", header: "Accrued", cell: (row) => row.accrued_days ?? 0 },
  { key: "used_days", header: "Used", cell: (row) => row.used_days ?? 0 },
  { key: "pending_days", header: "Pending", cell: (row) => row.pending_days ?? 0 },
  { key: "remaining_days", header: "Remaining", cell: (row) => row.remaining_days ?? 0 },
];

export const LeaveBalancesTable = ({ rows, loading, pagination, canAdjust, onAdjust, onPageChange, onPageSizeChange }: {
  rows: LeaveBalance[];
  loading?: boolean;
  pagination?: Pagination;
  canAdjust: boolean;
  onAdjust: (row: LeaveBalance) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) => (
  <DataTable rows={rows} columns={columns} getRowId={(row) => row.id ?? `${row.employee_id}-${row.leave_type_id}-${row.year}`} loading={loading} compact pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} rowActions={(row) => <RowActions actions={canAdjust ? [{ key: "edit", label: "Adjust balance", onSelect: () => onAdjust(row) }] : []} />} emptyTitle="No leave balances found" />
);
