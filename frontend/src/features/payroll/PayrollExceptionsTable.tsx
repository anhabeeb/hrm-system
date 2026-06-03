import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { PayrollException } from "./payroll.types";

const columns: TableColumn<PayrollException>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Run-level" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Company" },
  { key: "exception_type", header: "Type", cell: (row) => humanize(row.exception_type) },
  { key: "severity", header: "Severity", cell: (row) => <StatusBadge status={row.severity ?? "warning"} /> },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "open"} /> },
  { key: "message", header: "Message", cell: (row) => row.message ?? "Needs review" },
  { key: "created_at", header: "Created", cell: (row) => formatDateTime(row.created_at) },
];

export const PayrollExceptionsTable = ({
  rows,
  loading,
  pagination,
  canResolve,
  onResolve,
  onPageChange,
  onPageSizeChange,
}: {
  rows: PayrollException[];
  loading?: boolean;
  pagination?: Pagination;
  canResolve?: boolean;
  onResolve: (row: PayrollException) => void;
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
    emptyTitle="No payroll exceptions"
    emptyDescription="Critical blockers and calculation warnings will appear here."
    rowActions={canResolve ? (row) => <RowActions actions={[{ key: "approve", label: "Resolve", onSelect: () => onResolve(row) }]} /> : undefined}
  />
);
