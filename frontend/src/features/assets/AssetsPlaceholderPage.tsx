import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "asset-1", code: "LAP-001", name: "Laptop", assigned_to: "Aisha Mohamed", outlet: "Male Outlet", status: "active" },
  { id: "asset-2", code: "UNI-002", name: "Uniform Set", assigned_to: "Hassan Ali", outlet: "Addu Outlet", status: "pending" },
];

export const AssetsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Assets"
    description="Asset and uniform assignment workflows will use settlement-safe tables."
    tableTitle="Assigned assets"
    tableDescription="Placeholder rows demonstrate return/lost/damaged review screens."
    rows={rows}
    columns={[
      { key: "code", header: "Asset Code" },
      { key: "name", header: "Asset" },
      { key: "assigned_to", header: "Assigned To" },
      { key: "outlet", header: "Outlet" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
