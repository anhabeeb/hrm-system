import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";
import { formatMoneyMinor } from "@/lib/format";

const rows = [
  { id: "adv-1", employee: "Aisha Mohamed", amount: 150000, deduction_month: "2026-06", status: "approved" },
  { id: "adv-2", employee: "Hassan Ali", amount: 75000, deduction_month: "2026-07", status: "pending" },
];

export const AdvancesPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Advances"
    description="Advance payment requests and approval workflows will be implemented later."
    tableTitle="Advance payments"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "employee", header: "Employee" },
      { key: "amount", header: "Amount", cell: (row) => formatMoneyMinor(Number(row.amount)) },
      { key: "deduction_month", header: "Deduction Month" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
