import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "emp-001", employee_code: "EMP-001", name: "Aisha Mohamed", outlet: "Male Outlet", department: "Operations", status: "active" },
  { id: "emp-002", employee_code: "EMP-002", name: "Hassan Ali", outlet: "Addu Outlet", department: "Finance", status: "inactive" },
];

export const EmployeesPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Employees"
    description="Employee list, filters, and row actions foundation."
    tableTitle="Employee directory"
    tableDescription="Future prompts will connect create/edit/profile workflows."
    createLabel="Add employee"
    rows={rows}
    columns={[
      { key: "employee_code", header: "Employee Code" },
      { key: "name", header: "Name" },
      { key: "outlet", header: "Outlet" },
      { key: "department", header: "Department" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
