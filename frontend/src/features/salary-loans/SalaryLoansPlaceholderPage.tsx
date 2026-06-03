import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";
import { formatMoneyMinor } from "@/lib/format";

const rows = [
  { id: "loan-1", employee: "Aisha Mohamed", loan_amount: 1000000, outstanding: 700000, status: "approved" },
  { id: "loan-2", employee: "Hassan Ali", loan_amount: 500000, outstanding: 500000, status: "pending" },
];

export const SalaryLoansPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Salary Loans"
    description="Loan schedules, pause, settle, and payroll deduction flows will be implemented later."
    tableTitle="Salary loans"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "employee", header: "Employee" },
      { key: "loan_amount", header: "Loan Amount", cell: (row) => formatMoneyMinor(Number(row.loan_amount)) },
      { key: "outstanding", header: "Outstanding", cell: (row) => formatMoneyMinor(Number(row.outstanding)) },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
