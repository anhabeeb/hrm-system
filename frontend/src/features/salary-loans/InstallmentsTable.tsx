import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { TableColumn } from "@/types/common";
import type { SalaryLoanInstallment } from "./salary-loans.types";

const columns: TableColumn<SalaryLoanInstallment>[] = [
  { key: "payroll_month", header: "Payroll month" },
  { key: "amount", header: "Amount", cell: (row) => <MoneyAmount amount={row.amount} /> },
  { key: "paid_amount", header: "Paid", cell: (row) => <MoneyAmount amount={row.paid_amount} /> },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "scheduled"} /> },
  { key: "payroll_status", header: "Payroll", cell: (row) => <StatusBadge status={row.payroll_status ?? "pending"} /> },
];

export const InstallmentsTable = ({ rows, loading }: { rows: SalaryLoanInstallment[]; loading?: boolean }) => (
  <DataTable
    columns={columns}
    rows={rows}
    getRowId={(row) => row.id}
    loading={loading}
    emptyTitle="No installments"
    emptyDescription="Installments are generated when a salary loan is approved."
  />
);
