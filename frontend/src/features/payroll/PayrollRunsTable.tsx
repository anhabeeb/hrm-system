import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions, type RowAction } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { PayrollRun } from "./payroll.types";

const columns: TableColumn<PayrollRun>[] = [
  { key: "payroll_month", header: "Payroll month" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "totals_scope", header: "Scope", cell: (row) => <StatusBadge status="neutral" label={row.totals_scope ?? "company"} /> },
  { key: "employee_count", header: "Employees", cell: (row) => row.employee_count ?? row.item_count ?? 0 },
  { key: "total_gross_amount", header: "Gross", cell: (row) => <MoneyAmount amount={row.total_gross_amount ?? row.gross_amount} /> },
  { key: "total_deduction_amount", header: "Deductions", cell: (row) => <MoneyAmount amount={row.total_deduction_amount ?? row.deductions_amount} /> },
  { key: "total_net_amount", header: "Net", cell: (row) => <MoneyAmount amount={row.total_net_amount ?? row.net_amount} /> },
  { key: "created_at", header: "Created", cell: (row) => formatDateTime(row.created_at) },
];

export const PayrollRunsTable = ({
  rows,
  loading,
  pagination,
  onView,
  onRecalculate,
  onSubmit,
  onApprove,
  onReject,
  onFinalize,
  canRecalculate,
  canSubmit,
  canApprove,
  canReject,
  canFinalize,
  onPageChange,
  onPageSizeChange,
}: {
  rows: PayrollRun[];
  loading?: boolean;
  pagination?: Pagination;
  onView: (row: PayrollRun) => void;
  onRecalculate: (row: PayrollRun) => void;
  onSubmit: (row: PayrollRun) => void;
  onApprove: (row: PayrollRun) => void;
  onReject: (row: PayrollRun) => void;
  onFinalize: (row: PayrollRun) => void;
  canRecalculate?: boolean;
  canSubmit?: boolean;
  canApprove?: boolean;
  canReject?: boolean;
  canFinalize?: boolean;
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
    emptyTitle="No payroll runs"
    emptyDescription="Calculate a draft payroll run to begin the review workflow."
    rowActions={(row) => {
      const status = row.status.toLowerCase();
      const immutable = ["finalizing", "finalized", "locked", "paid"].includes(status);
      const editable = !immutable;
      const actions: RowAction[] = [{ key: "view", onSelect: () => onView(row) }];
      if (canRecalculate && editable) actions.push({ key: "more", label: "Recalculate", onSelect: () => onRecalculate(row) });
      if (canSubmit && ["calculated", "reviewed", "reopened"].includes(status)) actions.push({ key: "approve", label: "Submit approval", onSelect: () => onSubmit(row) });
      if (canApprove && ["pending_approval", "submitted"].includes(status)) actions.push({ key: "approve", label: "Approve", onSelect: () => onApprove(row) });
      if (canReject && ["pending_approval", "submitted"].includes(status)) actions.push({ key: "reject", label: "Reject", onSelect: () => onReject(row) });
      if (canFinalize && ["approved", "calculated", "reviewed", "reopened", "finalization_failed"].includes(status)) actions.push({ key: "approve", label: "Finalize", onSelect: () => onFinalize(row) });
      return <RowActions actions={actions} />;
    }}
  />
);
