import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { TableColumn } from "@/types/common";
import type { SalaryImpactRow } from "./long-leave.types";

const columns: TableColumn<SalaryImpactRow>[] = [
  { key: "payroll_month", header: "Payroll month" },
  { key: "monthly_salary_amount", header: "Monthly salary", cell: (row) => <MoneyAmount amount={row.monthly_salary_amount} /> },
  { key: "salary_calculation_days", header: "Basis days" },
  { key: "total_days", header: "Month days", cell: (row) => row.total_days ?? "-" },
  { key: "long_leave_days", header: "Long leave days" },
  { key: "payable_days", header: "Payable days", cell: (row) => row.payable_days ?? row.worked_days ?? "-" },
  { key: "unpaid_days", header: "Unpaid days", cell: (row) => row.unpaid_days ?? row.long_leave_days ?? "-" },
  { key: "deduction_amount", header: "Deduction", cell: (row) => <MoneyAmount amount={row.deduction_amount} /> },
  { key: "estimated_payable_amount", header: "Payable salary", cell: (row) => <MoneyAmount amount={row.payable_salary ?? row.estimated_payable_amount} /> },
  { key: "override_amount", header: "Override", cell: (row) => <MoneyAmount amount={row.override_amount} /> },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? row.payroll_status ?? "pending"} /> },
];

export const SalaryImpactTable = ({
  rows,
  loading,
}: {
  rows: SalaryImpactRow[];
  loading?: boolean;
}) => (
  <DataTable
    columns={columns}
    rows={rows}
    getRowId={(row) => row.id ?? row.payroll_month}
    loading={loading}
    emptyTitle="No salary impact rows"
    emptyDescription="Calculate salary impact to preview the month-by-month payroll effect."
  />
);
