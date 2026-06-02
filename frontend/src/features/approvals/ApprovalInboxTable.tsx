import { DataTable } from "@/components/data/DataTable";
import { RowActions, type RowAction } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import { approvalTitle, boolish } from "./approval-format";
import type { ApprovalRequest } from "./approvals.types";

const columns: TableColumn<ApprovalRequest>[] = [
  { key: "summary", header: "Request", cell: approvalTitle },
  { key: "module", header: "Module", cell: (row) => humanize(row.module) },
  { key: "entity_type", header: "Entity Type", cell: (row) => humanize(row.entity_type) },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Not linked" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Company" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
  { key: "current_step", header: "Step", cell: (row) => row.current_step ?? 1 },
  { key: "requested_by_name", header: "Requested By", cell: (row) => row.requested_by_name ?? row.requested_by },
  { key: "created_at", header: "Created", cell: (row) => formatDateTime(row.created_at) },
];

export const ApprovalInboxTable = ({ rows, loading, pagination, canApprove, canReject, canReturn, canOverride, canHistory, onView, onApprove, onReject, onReturn, onOverride, onHistory, onPageChange, onPageSizeChange }: {
  rows: ApprovalRequest[];
  loading?: boolean;
  pagination?: Pagination;
  canApprove?: boolean;
  canReject?: boolean;
  canReturn?: boolean;
  canOverride?: boolean;
  canHistory?: boolean;
  onView: (row: ApprovalRequest) => void;
  onApprove: (row: ApprovalRequest) => void;
  onReject: (row: ApprovalRequest) => void;
  onReturn: (row: ApprovalRequest) => void;
  onOverride: (row: ApprovalRequest) => void;
  onHistory: (row: ApprovalRequest) => void;
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
    emptyTitle="No approval requests"
    emptyDescription="Pending and historical approvals will appear here."
    rowActions={(row) => {
      const actions: RowAction[] = [{ key: "view", onSelect: () => onView(row) }];
      if (canApprove && boolish(row.can_approve)) actions.push({ key: "approve", onSelect: () => onApprove(row) });
      if (canReject && boolish(row.can_reject)) actions.push({ key: "reject", onSelect: () => onReject(row) });
      if (canReturn && boolish(row.can_return)) actions.push({ key: "more", label: "Return", onSelect: () => onReturn(row) });
      if (canOverride && boolish(row.can_override)) actions.push({ key: "more", label: "Override", onSelect: () => onOverride(row) });
      if (canHistory) actions.push({ key: "more", label: "History", onSelect: () => onHistory(row) });
      return <RowActions actions={actions} />;
    }}
  />
);
