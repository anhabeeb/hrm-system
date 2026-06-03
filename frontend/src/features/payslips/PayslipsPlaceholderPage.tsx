import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "ps-1", payroll_month: "2026-06", employee: "Aisha Mohamed", status: "draft", generated_at: "Not generated" },
  { id: "ps-2", payroll_month: "2026-05", employee: "Hassan Ali", status: "completed", generated_at: "2026-05-31" },
];

export const PayslipsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Payslips"
    description="Payslip metadata, generation, and download placeholders will be connected later."
    tableTitle="Payslip register"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "payroll_month", header: "Payroll Month" },
      { key: "employee", header: "Employee" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "generated_at", header: "Generated At" },
    ]}
  />
);
