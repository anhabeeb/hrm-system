import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "backup-1", backup: "Daily metadata backup", type: "scheduled", status: "completed", created_at: "2026-06-02" },
  { id: "backup-2", backup: "Manual export backup", type: "manual", status: "pending", created_at: "2026-06-01" },
];

export const BackupRecoveryPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Backup & Recovery"
    description="Backup history, verification, retention, and restore-request foundations will be implemented later."
    tableTitle="Backup history"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "backup", header: "Backup" },
      { key: "type", header: "Type" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "created_at", header: "Created At" },
    ]}
  />
);
