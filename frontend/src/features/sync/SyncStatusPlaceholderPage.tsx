import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "sync-1", batch: "batch_001", outlet: "Male Outlet", status: "completed", pending: 0, failed: 0, conflicts: 0 },
  { id: "sync-2", batch: "batch_002", outlet: "Addu Outlet", status: "warning", pending: 2, failed: 1, conflicts: 1 },
];

export const SyncStatusPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Sync Status"
    description="Offline sync batches, conflicts, and device health will be connected here."
    tableTitle="Sync batches"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "batch", header: "Batch" },
      { key: "outlet", header: "Outlet" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "pending", header: "Pending" },
      { key: "failed", header: "Failed" },
      { key: "conflicts", header: "Conflicts" },
    ]}
  />
);
