import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "dept-1", department: "Operations", outlet: "Male Outlet", status: "active" },
  { id: "dept-2", department: "Finance", outlet: "Company-wide", status: "active" },
];

export const DepartmentsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Departments"
    description="Department management will use compact table and drawer workflows."
    tableTitle="Departments"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "department", header: "Department" },
      { key: "outlet", header: "Outlet" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
