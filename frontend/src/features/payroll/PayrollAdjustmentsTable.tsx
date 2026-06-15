import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { Badge } from "@/components/ui/badge";
import type { TableColumn } from "@/types/common";
import { humanize } from "./payroll-format";
import type { PayrollAdjustment } from "./payroll.types";

const statusVariant = (status: string) =>
  status === "APPLIED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_APPLY" ? "destructive" :
      status === "CANCELLED" ? "muted" :
        status.includes("PENDING") || status === "APPROVED" ? "warning" :
          "outline";
const formatAmount = (amount: number, currency = "MVR") =>
  new Intl.NumberFormat("en-MV", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);

interface Props {
  rows: PayrollAdjustment[];
  loading?: boolean;
  pagination?: any;
  canApprove?: boolean;
  canReject?: boolean;
  canCancel?: boolean;
  canApply?: boolean;
  onView: (row: PayrollAdjustment) => void;
  onApprove: (row: PayrollAdjustment) => void;
  onReject: (row: PayrollAdjustment) => void;
  onCancel: (row: PayrollAdjustment) => void;
  onApply: (row: PayrollAdjustment) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export const PayrollAdjustmentsTable = ({
  rows,
  loading,
  pagination,
  canApprove,
  canReject,
  canCancel,
  canApply,
  onView,
  onApprove,
  onReject,
  onCancel,
  onApply,
  onPageChange,
  onPageSizeChange,
}: Props) => {
  const columns: TableColumn<PayrollAdjustment>[] = [
    { key: "employee_name", header: "Employee", cell: (row) => <div><p className="font-medium">{row.employee_name ?? row.employee_id}</p><p className="text-xs text-muted-foreground">{row.employee_code ?? row.department_name ?? "-"}</p></div> },
    { key: "adjustment_type", header: "Type", cell: (row) => humanize(row.adjustment_type) },
    { key: "amount", header: "Amount", cell: (row) => row.amount == null ? "-" : `${row.adjustment_direction === "DEDUCT" ? "-" : ""}${formatAmount(Number(row.amount), row.currency ?? "MVR")}` },
    { key: "effective_payroll_month", header: "Payroll month", cell: (row) => row.effective_payroll_month ?? "-" },
    { key: "current_step_name", header: "Current step", cell: (row) => row.current_step_name ?? humanize(row.approval_status ?? row.status) },
    { key: "status", header: "Status", cell: (row) => <Badge variant={statusVariant(row.status) as any}>{humanize(row.status)}</Badge> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={loading}
      pagination={pagination}
      getRowId={(row) => row.id}
      emptyTitle="No payroll adjustments"
      emptyDescription="Payroll adjustment requests will appear here after they are submitted."
      onRowClick={onView}
      rowActions={(row) => {
        const pending = ["PENDING", "PENDING_OWNER_REVIEW", "PENDING_FINAL_APPROVAL", "PENDING_MANUAL_REVIEW"].includes(row.status);
        const actions = [
          { key: "view" as const, onSelect: () => onView(row) },
          ...(canApprove && pending ? [{ key: "approve" as const, onSelect: () => onApprove(row) }] : []),
          ...(canReject && pending ? [{ key: "reject" as const, onSelect: () => onReject(row) }] : []),
          ...(canCancel && pending ? [{ key: "disable" as const, label: "Cancel", onSelect: () => onCancel(row) }] : []),
          ...(canApply && ["APPROVED", "PENDING_EXECUTION"].includes(row.status) ? [{ key: "approve" as const, label: "Apply", onSelect: () => onApply(row) }] : []),
        ];
        return <RowActions actions={actions} />;
      }}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
};
