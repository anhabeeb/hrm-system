import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { RowActions } from "@/components/data/RowActions";
import type { TableColumn } from "@/types/common";
import type { ApprovalStep } from "./approvals.types";

const columns: TableColumn<ApprovalStep>[] = [
  { key: "step_order", header: "Order" },
  { key: "step_name", header: "Step" },
  { key: "required_role_key", header: "Required Role" },
  { key: "required_permission_key", header: "Required Permission" },
  { key: "approval_type", header: "Type" },
  { key: "amount_min", header: "Amount Min", cell: (row) => <MoneyAmount amount={row.amount_min} /> },
  { key: "amount_max", header: "Amount Max", cell: (row) => <MoneyAmount amount={row.amount_max} /> },
];

export const ApprovalStepsTable = ({ rows, loading, canManage, onEdit, onDelete }: { rows: ApprovalStep[]; loading?: boolean; canManage?: boolean; onEdit: (row: ApprovalStep) => void; onDelete: (row: ApprovalStep) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} emptyTitle="No workflow steps" emptyDescription="Select a workflow to manage its approval steps." rowActions={canManage ? (row) => <RowActions actions={[{ key: "edit", onSelect: () => onEdit(row) }, { key: "delete", onSelect: () => onDelete(row) }]} /> : undefined} />
);
