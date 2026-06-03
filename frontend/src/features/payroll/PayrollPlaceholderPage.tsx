import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";
import { formatMoneyMinor } from "@/lib/format";

const rows = [
  { id: "pay-2026-06", payroll_month: "2026-06", status: "draft", employees: 38, gross: 92000000, deductions: 1200000, net: 90800000 },
  { id: "pay-2026-05", payroll_month: "2026-05", status: "locked", employees: 37, gross: 91000000, deductions: 1100000, net: 89900000 },
];

export const PayrollPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Payroll"
    description="Draft calculation, exceptions, approvals, lock/reopen, and payslips will be built here."
    tableTitle="Payroll runs"
    tableDescription="Company payroll tables will stay permission and outlet scoped."
    rows={rows}
    columns={[
      { key: "payroll_month", header: "Payroll Month" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "employees", header: "Employees" },
      { key: "gross", header: "Gross", cell: (row) => formatMoneyMinor(Number(row.gross)) },
      { key: "deductions", header: "Deductions", cell: (row) => formatMoneyMinor(Number(row.deductions)) },
      { key: "net", header: "Net", cell: (row) => formatMoneyMinor(Number(row.net)) },
    ]}
  />
);
