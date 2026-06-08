import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { LeaveBalance } from "./leave.types";

const columns: TableColumn<LeaveBalance>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id },
  { key: "leave_type_name", header: "Leave Type", cell: (row) => row.leave_type_name ?? row.leave_type_id },
  { key: "year", header: "Year" },
  { key: "entitlement_days", header: "Entitlement", cell: (row) => row.entitlement_days ?? 0 },
  { key: "opening_balance", header: "Opening", cell: (row) => row.opening_balance ?? 0 },
  { key: "accrued_days", header: "Accrued", cell: (row) => row.accrued_days ?? 0 },
  { key: "used_days", header: "Used", cell: (row) => row.used_days ?? 0 },
  { key: "pending_days", header: "Pending", cell: (row) => row.pending_days ?? 0 },
  { key: "adjusted_days", header: "Adjusted", cell: (row) => row.adjusted_days ?? 0 },
  { key: "carried_forward_days", header: "Carried", cell: (row) => row.carried_forward_days ?? 0 },
  { key: "expired_days", header: "Expired", cell: (row) => row.expired_days ?? 0 },
  { key: "remaining_days", header: "Available", cell: (row) => row.available_days ?? row.calculated_available_days ?? row.remaining_days ?? 0 },
  { key: "last_accrual_date", header: "Last Accrual", cell: (row) => row.last_accrual_date?.slice(0, 10) ?? "-" },
  { key: "status", header: "Status", cell: (row) => row.status ?? "active" },
];

export const LeaveBalancesTable = ({ rows, loading, pagination, canAdjust, onAdjust, onOpening, onCarryForward, onExpire, onRebuild, onTransactions, onPageChange, onPageSizeChange }: {
  rows: LeaveBalance[];
  loading?: boolean;
  pagination?: Pagination;
  canAdjust: boolean;
  onAdjust: (row: LeaveBalance) => void;
  onOpening: (row: LeaveBalance) => void;
  onCarryForward: (row: LeaveBalance) => void;
  onExpire: (row: LeaveBalance) => void;
  onRebuild: (row: LeaveBalance) => void;
  onTransactions: (row: LeaveBalance) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) => (
  <DataTable rows={rows} columns={columns} getRowId={(row) => row.id ?? `${row.employee_id}-${row.leave_type_id}-${row.year}`} loading={loading} compact pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} rowActions={(row) => <RowActions actions={[
    { key: "view", label: "View transactions", onSelect: () => onTransactions(row) },
    ...(canAdjust ? [
      { key: "opening" as const, label: "Set opening balance", onSelect: () => onOpening(row) },
      { key: "edit" as const, label: "Adjust balance", onSelect: () => onAdjust(row) },
      { key: "carry-forward" as const, label: "Carry forward", onSelect: () => onCarryForward(row) },
      { key: "expire" as const, label: "Expire leave", onSelect: () => onExpire(row) },
      { key: "rebuild" as const, label: "Rebuild from ledger", onSelect: () => onRebuild(row) },
    ] : []),
  ]} />} emptyTitle="No leave balances found" />
);
