import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions } from "@/components/data/RowActions";
import { Badge } from "@/components/ui/badge";
import { formatDate, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { AdvanceSalaryRequest } from "./advances.types";

const statusVariant = (status: string) =>
  status === "PAID" || status === "FULLY_DEDUCTED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_PAY" ? "destructive" :
      status === "CANCELLED" ? "muted" :
        status.includes("PENDING") || status === "APPROVED" ? "warning" :
          "outline";

interface Props {
  rows: AdvanceSalaryRequest[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove?: boolean;
  canReject?: boolean;
  canCancel?: boolean;
  canExecutePayment?: boolean;
  onView: (row: AdvanceSalaryRequest) => void;
  onApprove: (row: AdvanceSalaryRequest) => void;
  onReject: (row: AdvanceSalaryRequest) => void;
  onCancel: (row: AdvanceSalaryRequest) => void;
  onExecutePayment: (row: AdvanceSalaryRequest) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export const AdvanceSalaryRequestsTable = ({
  rows,
  loading,
  pagination,
  canApprove,
  canReject,
  canCancel,
  canExecutePayment,
  onView,
  onApprove,
  onReject,
  onCancel,
  onExecutePayment,
  onPageChange,
  onPageSizeChange,
}: Props) => {
  const columns: TableColumn<AdvanceSalaryRequest>[] = [
    { key: "employee_name", header: "Employee", cell: (row) => <div><p className="font-medium">{row.employee_name ?? row.employee_id}</p><p className="text-xs text-muted-foreground">{row.employee_code ?? row.department_name ?? "-"}</p></div> },
    { key: "request_type", header: "Type", cell: (row) => humanize(row.request_type) },
    { key: "requested_amount", header: "Amount", cell: (row) => <MoneyAmount amount={row.requested_amount} currency={row.currency ?? "MVR"} /> },
    { key: "repayment_start_month", header: "Repayment", cell: (row) => row.repayment_start_month ? `${row.repayment_start_month} (${row.repayment_months ?? 1} mo.)` : "-" },
    { key: "current_step_name", header: "Current step", cell: (row) => row.current_step_name ?? humanize(row.approval_status ?? row.status) },
    { key: "status", header: "Status", cell: (row) => <Badge variant={statusVariant(row.status) as any}>{humanize(row.status)}</Badge> },
    { key: "requested_payment_date", header: "Payment date", cell: (row) => formatDate(row.requested_payment_date) },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={loading}
      pagination={pagination}
      getRowId={(row) => row.id}
      emptyTitle="No advance salary requests"
      emptyDescription="Advance salary requests will appear here after they are submitted."
      onRowClick={onView}
      rowActions={(row) => {
        const pending = ["PENDING", "PENDING_OWNER_REVIEW", "PENDING_FINAL_APPROVAL", "PENDING_MANUAL_REVIEW"].includes(row.status);
        const paymentReady = ["APPROVED", "PENDING_PAYMENT"].includes(row.status);
        return <RowActions actions={[
          { key: "view", onSelect: () => onView(row) },
          { key: "approve", onSelect: () => onApprove(row), disabled: !canApprove || !pending },
          { key: "reject", onSelect: () => onReject(row), disabled: !canReject || !pending },
          { key: "disable", label: "Cancel", onSelect: () => onCancel(row), disabled: !canCancel || !pending },
          { key: "approve", label: "Execute payment", onSelect: () => onExecutePayment(row), disabled: !canExecutePayment || !paymentReady },
        ]} />;
      }}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
};
