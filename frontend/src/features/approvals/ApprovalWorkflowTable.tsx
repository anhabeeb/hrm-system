import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { humanize } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { ApprovalWorkflow } from "./approvals.types";

const columns: TableColumn<ApprovalWorkflow>[] = [
  { key: "workflow_name", header: "Workflow Name" },
  { key: "workflow_key", header: "Workflow Key" },
  { key: "module", header: "Module", cell: (row) => humanize(row.module) },
  { key: "approval_mode", header: "Mode", cell: (row) => humanize(row.approval_mode) },
  { key: "is_enabled", header: "Enabled", cell: (row) => <StatusBadge status={row.is_enabled ? "active" : "disabled"} /> },
  { key: "steps_count", header: "Steps", cell: (row) => row.steps_count ?? row.steps?.length ?? 0 },
];

export const ApprovalWorkflowTable = ({ rows, loading, pagination, canManage, onView, onEdit, onEnable, onDisable, onSteps, onPageChange, onPageSizeChange }: { rows: ApprovalWorkflow[]; loading?: boolean; pagination?: Pagination; canManage?: boolean; onView: (row: ApprovalWorkflow) => void; onEdit: (row: ApprovalWorkflow) => void; onEnable: (row: ApprovalWorkflow) => void; onDisable: (row: ApprovalWorkflow) => void; onSteps: (row: ApprovalWorkflow) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onRowClick={onView} emptyTitle="No workflows" emptyDescription="Approval workflow settings will appear here." rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => onView(row) }, { key: "more", label: "Steps", onSelect: () => onSteps(row) }, ...(canManage ? [{ key: "edit" as const, onSelect: () => onEdit(row) }, row.is_enabled ? { key: "disable" as const, label: "Disable", onSelect: () => onDisable(row) } : { key: "enable" as const, label: "Enable", onSelect: () => onEnable(row) }] : [])]} />} />
);
