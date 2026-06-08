import { DataTable } from "@/components/data/DataTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TableColumn } from "@/types/common";
import type { LeaveBalance, LeaveBalanceTransaction } from "./leave.types";

const columns: TableColumn<LeaveBalanceTransaction>[] = [
  { key: "effective_date", header: "Date", cell: (row) => row.effective_date?.slice(0, 10) ?? "-" },
  { key: "transaction_type", header: "Type", cell: (row) => row.transaction_type.replace(/_/g, " ") },
  { key: "quantity_days", header: "Quantity" },
  { key: "balance_before", header: "Before" },
  { key: "balance_after", header: "After" },
  { key: "source", header: "Source" },
  { key: "reason", header: "Reason", cell: (row) => row.reason ?? "-" },
  { key: "created_by", header: "Created By", cell: (row) => row.created_by ?? "System" },
];

export const LeaveTransactionsDialog = ({
  balance,
  rows,
  loading,
  open,
  onOpenChange,
}: {
  balance: LeaveBalance | null;
  rows: LeaveBalanceTransaction[];
  loading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl">
      <DialogHeader>
        <DialogTitle>Leave balance transactions</DialogTitle>
        <DialogDescription>
          Immutable ledger for {balance?.employee_name ?? balance?.employee_id ?? "this employee"} and {balance?.leave_type_name ?? "selected leave type"}.
        </DialogDescription>
      </DialogHeader>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        compact
        emptyTitle="No balance transactions"
        emptyDescription="Opening balances, accrual, requests, adjustments, carry-forward, and expiry entries will appear here."
      />
    </DialogContent>
  </Dialog>
);
