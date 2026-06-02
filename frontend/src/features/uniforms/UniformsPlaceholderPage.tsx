import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "uni-1", employee: "Aisha Mohamed", uniform_type: "Front Office", quantity: 2, status: "active" },
  { id: "uni-2", employee: "Hassan Ali", uniform_type: "Kitchen", quantity: 1, status: "pending" },
];

export const UniformsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Uniforms"
    description="Uniform issue, return, pending return, and deduction flows will be implemented later."
    tableTitle="Uniform issues"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "employee", header: "Employee" },
      { key: "uniform_type", header: "Uniform Type" },
      { key: "quantity", header: "Quantity" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
