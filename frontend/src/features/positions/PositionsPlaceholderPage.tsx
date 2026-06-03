import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "pos-1", position: "Outlet Supervisor", department: "Operations", status: "active" },
  { id: "pos-2", position: "Payroll Officer", department: "Finance", status: "active" },
];

export const PositionsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Positions"
    description="Position management placeholder for future HR structure workflows."
    tableTitle="Positions"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "position", header: "Position" },
      { key: "department", header: "Department" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
