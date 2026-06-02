import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "bio-1", device: "Front Door Biometric", outlet: "Male Outlet", status: "active", last_sync: "2026-06-02 08:35", unmatched_logs: 0 },
  { id: "bio-2", device: "Bridge App", outlet: "Addu Outlet", status: "pending", last_sync: "2026-06-01 17:50", unmatched_logs: 3 },
];

export const BiometricPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Biometric"
    description="Biometric devices, mappings, logs, and unmatched user review will be implemented later."
    tableTitle="Biometric devices"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "device", header: "Device" },
      { key: "outlet", header: "Outlet" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "last_sync", header: "Last Sync" },
      { key: "unmatched_logs", header: "Unmatched Logs" },
    ]}
  />
);
