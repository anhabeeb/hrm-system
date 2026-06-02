import { DataTable } from "@/components/data/DataTable";
import { formatDateTime, humanize } from "@/lib/safe-display";
import type { TableColumn } from "@/types/common";
import type { ApprovalHistory } from "./approvals.types";

const columns: TableColumn<ApprovalHistory>[] = [
  { key: "created_at", header: "Date", cell: (row) => formatDateTime(row.created_at) },
  { key: "action", header: "Action", cell: (row) => humanize(row.action) },
  { key: "step_order", header: "Step" },
  { key: "actor_name", header: "Actor" },
  { key: "old_status", header: "Old Status" },
  { key: "new_status", header: "New Status" },
  { key: "comment", header: "Comment", cell: (row) => row.comment ?? row.reason ?? "" },
];

export const ApprovalHistoryTable = ({ rows, loading }: { rows: ApprovalHistory[]; loading?: boolean }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id ?? `${row.created_at}-${row.action}-${row.step_order}`} loading={loading} emptyTitle="No approval history" emptyDescription="Approval action history will appear here." />
);
