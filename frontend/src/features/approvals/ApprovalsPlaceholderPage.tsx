import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "app-1", request: "Leave approval", module: "Leave", status: "pending", current_step: "Step 1", requested_by: "HR" },
  { id: "app-2", request: "Payroll lock", module: "Payroll", status: "approved", current_step: "Complete", requested_by: "Finance" },
];

export const ApprovalsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Approvals"
    description="Approval inbox, step tracking, and action dialogs will be implemented later."
    tableTitle="Approval requests"
    tableDescription="Designed for compact row actions and status badges."
    rows={rows}
    columns={[
      { key: "request", header: "Request" },
      { key: "module", header: "Module" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "current_step", header: "Current Step" },
      { key: "requested_by", header: "Requested By" },
    ]}
  />
);
