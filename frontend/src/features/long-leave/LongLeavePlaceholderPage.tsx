import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "ll-1", employee: "Aisha Mohamed", start_date: "2026-06-15", expected_return: "2026-08-01", status: "pending", salary_impact: "Review required" },
  { id: "ll-2", employee: "Hassan Ali", start_date: "2026-05-01", expected_return: "2026-07-01", status: "approved", salary_impact: "Confirmed" },
];

export const LongLeavePlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Long Leave"
    description="Long leave salary impact and return workflows will be implemented later."
    tableTitle="Long leave records"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "employee", header: "Employee" },
      { key: "start_date", header: "Start Date" },
      { key: "expected_return", header: "Expected Return" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "salary_impact", header: "Salary Impact" },
    ]}
  />
);
