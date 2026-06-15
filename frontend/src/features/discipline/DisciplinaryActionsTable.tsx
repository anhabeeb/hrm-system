import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { Badge } from "@/components/ui/badge";
import type { TableColumn } from "@/types/common";
import type { DisciplinaryAction } from "./discipline.types";

const humanize = (value?: string | null) => value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) : "-";
const statusVariant = (status: string) =>
  status === "CLOSED" || status === "APPLIED" || status === "ACKNOWLEDGED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_APPLY" ? "destructive" :
      status === "CANCELLED" ? "muted" :
        status.includes("PENDING") || status === "APPROVED" ? "warning" :
          "outline";

interface Props {
  rows: DisciplinaryAction[];
  loading?: boolean;
  pagination?: any;
  canApprove?: boolean;
  canReject?: boolean;
  canCancel?: boolean;
  canApply?: boolean;
  canAcknowledge?: boolean;
  canClose?: boolean;
  onView: (row: DisciplinaryAction) => void;
  onApprove: (row: DisciplinaryAction) => void;
  onReject: (row: DisciplinaryAction) => void;
  onCancel: (row: DisciplinaryAction) => void;
  onApply: (row: DisciplinaryAction) => void;
  onAcknowledge: (row: DisciplinaryAction) => void;
  onClose: (row: DisciplinaryAction) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export const DisciplinaryActionsTable = ({
  rows,
  loading,
  pagination,
  canApprove,
  canReject,
  canCancel,
  canApply,
  canAcknowledge,
  canClose,
  onView,
  onApprove,
  onReject,
  onCancel,
  onApply,
  onAcknowledge,
  onClose,
  onPageChange,
  onPageSizeChange,
}: Props) => {
  const columns: TableColumn<DisciplinaryAction>[] = [
    { key: "employee_name", header: "Employee", cell: (row) => <div><p className="font-medium">{row.employee_name ?? row.employee_id}</p><p className="text-xs text-muted-foreground">{row.employee_code ?? row.department_name ?? "-"}</p></div> },
    { key: "request_type", header: "Request", cell: (row) => humanize(row.request_type) },
    { key: "action_type", header: "Outcome", cell: (row) => humanize(row.action_type) },
    { key: "severity", header: "Severity", cell: (row) => <Badge variant={row.severity === "CRITICAL" || row.severity === "HIGH" ? "destructive" : row.severity === "MEDIUM" ? "warning" : "outline"}>{humanize(row.severity)}</Badge> },
    { key: "incident_date", header: "Incident date", cell: (row) => row.incident_date ?? "-" },
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
      emptyTitle="No disciplinary actions"
      emptyDescription="Disciplinary action requests will appear here after they are submitted."
      onRowClick={onView}
      rowActions={(row) => {
        const pending = ["PENDING", "PENDING_DEPARTMENT_REVIEW", "PENDING_OWNER_REVIEW", "PENDING_INVESTIGATION", "PENDING_FINAL_APPROVAL", "PENDING_MANUAL_REVIEW"].includes(row.status);
        const actions = [
          { key: "view" as const, onSelect: () => onView(row) },
          ...(canApprove && pending ? [{ key: "approve" as const, onSelect: () => onApprove(row) }] : []),
          ...(canReject && pending ? [{ key: "reject" as const, onSelect: () => onReject(row) }] : []),
          ...(canCancel && pending ? [{ key: "disable" as const, label: "Cancel", onSelect: () => onCancel(row) }] : []),
          ...(canApply && ["APPROVED", "PENDING_APPLICATION"].includes(row.status) ? [{ key: "approve" as const, label: "Apply", onSelect: () => onApply(row) }] : []),
          ...(canAcknowledge && Boolean(row.acknowledgement_required) && !row.acknowledged_at && ["PENDING_ACKNOWLEDGEMENT", "APPLIED", "PENDING_FOLLOW_UP"].includes(row.status) ? [{ key: "approve" as const, label: "Acknowledge", onSelect: () => onAcknowledge(row) }] : []),
          ...(canClose && ["APPLIED", "ACKNOWLEDGED", "PENDING_FOLLOW_UP"].includes(row.status) ? [{ key: "archive" as const, label: "Close", onSelect: () => onClose(row) }] : []),
        ];
        return <RowActions actions={actions} />;
      }}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );
};
