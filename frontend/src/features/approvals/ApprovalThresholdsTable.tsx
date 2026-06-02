import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { ApprovalThreshold } from "./approvals.types";

const columns: TableColumn<ApprovalThreshold>[] = [
  { key: "workflow_key", header: "Workflow Key" },
  { key: "threshold_name", header: "Threshold" },
  { key: "threshold_type", header: "Type" },
  { key: "amount_min", header: "Amount Min", cell: (row) => <MoneyAmount amount={row.amount_min} /> },
  { key: "amount_max", header: "Amount Max", cell: (row) => <MoneyAmount amount={row.amount_max} /> },
  { key: "currency", header: "Currency" },
  { key: "is_active", header: "Active", cell: (row) => <StatusBadge status={row.is_active ? "active" : "disabled"} /> },
  { key: "effective_from", header: "Effective", cell: (row) => formatDate(row.effective_from) },
];

export const ApprovalThresholdsTable = ({ rows, loading, pagination, canEdit, onEdit, onEnable, onDisable, onPageChange, onPageSizeChange }: { rows: ApprovalThreshold[]; loading?: boolean; pagination?: Pagination; canEdit?: boolean; onEdit: (row: ApprovalThreshold) => void; onEnable: (row: ApprovalThreshold) => void; onDisable: (row: ApprovalThreshold) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} emptyTitle="No thresholds" emptyDescription="Approval thresholds will appear here." rowActions={canEdit ? (row) => <RowActions actions={[{ key: "edit", onSelect: () => onEdit(row) }, row.is_active ? { key: "disable", label: "Disable", onSelect: () => onDisable(row) } : { key: "enable", label: "Enable", onSelect: () => onEnable(row) }]} /> : undefined} />
);
