import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "device-1", device_name: "Front Desk Kiosk", outlet: "Male Outlet", status: "active", last_seen: "2026-06-02 08:30" },
  { id: "device-2", device_name: "Back Office Tablet", outlet: "Addu Outlet", status: "warning", last_seen: "2026-06-01 18:05" },
];

export const KioskDevicesPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Kiosk Devices"
    description="Device health, tokens, and kiosk-safe actions will be connected later."
    tableTitle="Kiosk device list"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "device_name", header: "Device Name" },
      { key: "outlet", header: "Outlet" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "last_seen", header: "Last Seen" },
    ]}
  />
);
