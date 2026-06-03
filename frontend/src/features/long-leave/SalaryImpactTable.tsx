import { DataTable } from "@/components/data/DataTable";
import { MoneyAmount } from "@/components/data/MoneyAmount";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { TableColumn } from "@/types/common";
import type { SalaryImpactRow } from "./long-leave.types";

const columns: TableColumn<SalaryImpactRow>[] = [
  { key: "payroll_month", header: "Payroll month" },
  { key: "monthly_salary_amount", header: "Monthly salary", cell: (row) => <MoneyAmount amount={row.monthly_salary_amount} /> },
  { key: "salary_calculation_days", header: "Basis days" },
  { key: "worked_days", header: "Worked days" },
  { key: "long_leave_days", header: "Long leave days" },
  { key: "estimated_payable_amount", header: "Estimated payable", cell: (row) => <MoneyAmount amount={row.estimated_payable_amount} /> },
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
