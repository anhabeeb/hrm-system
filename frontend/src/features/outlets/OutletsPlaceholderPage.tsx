import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "outlet-1", outlet_code: "MLE", outlet_name: "Male Outlet", status: "active", employees: 28 },
  { id: "outlet-2", outlet_code: "ADD", outlet_name: "Addu Outlet", status: "active", employees: 16 },
];

export const OutletsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Outlets"
    description="Outlet list, access scopes, and operational status screens will be implemented later."
    tableTitle="Outlet register"
    tableDescription="Future screens will connect to outlet APIs and access controls."
    rows={rows}
    columns={[
      { key: "outlet_code", header: "Outlet Code" },
      { key: "outlet_name", header: "Outlet Name" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "employees", header: "Employees" },
    ]}
  />
);
