import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "leave-1", employee: "Aisha Mohamed", leave_type: "Annual", start_date: "2026-06-10", end_date: "2026-06-12", status: "pending" },
  { id: "leave-2", employee: "Hassan Ali", leave_type: "Sick", start_date: "2026-06-04", end_date: "2026-06-04", status: "approved" },
];

export const LeavePlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Leave"
    description="Leave requests, balances, calendar views, and approvals will be connected here."
    tableTitle="Leave requests"
    tableDescription="Future list/detail leave screens will reuse this pattern."
    createLabel="New request"
    rows={rows}
    columns={[
      { key: "employee", header: "Employee" },
      { key: "leave_type", header: "Leave Type" },
      { key: "start_date", header: "Start Date" },
      { key: "end_date", header: "End Date" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
