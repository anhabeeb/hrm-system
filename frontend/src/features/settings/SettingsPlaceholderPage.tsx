import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "set-1", area: "Attendance", setting: "Kiosk mode", value: "Enabled", status: "active" },
  { id: "set-2", area: "Payroll", setting: "Approval mode", value: "Manual", status: "active" },
];

export const SettingsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Settings"
    description="Settings will use structured tables and guarded edit dialogs."
    tableTitle="Settings preview"
    tableDescription="Future screens will group settings by domain."
    rows={rows}
    columns={[
      { key: "area", header: "Area" },
      { key: "setting", header: "Setting" },
      { key: "value", header: "Value" },
      { key: "status", header: "Status", cell: statusCell("status") },
    ]}
  />
);
