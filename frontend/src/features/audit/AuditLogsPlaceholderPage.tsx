import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "audit-1", date: "2026-06-02 08:20", module: "payroll", action: "payroll_locked", actor: "Admin", severity: "critical" },
  { id: "audit-2", date: "2026-06-02 09:10", module: "documents", action: "document_uploaded", actor: "HR", severity: "info" },
];

export const AuditLogsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Audit Logs"
    description="Audit log review, sensitive masking, and scoped exports will be implemented later."
    tableTitle="Audit activity"
    tableDescription="This module UI will be implemented in a future prompt."
    rows={rows}
    columns={[
      { key: "date", header: "Date" },
      { key: "module", header: "Module" },
      { key: "action", header: "Action" },
      { key: "actor", header: "Actor" },
      { key: "severity", header: "Severity", cell: statusCell("severity") },
    ]}
  />
);
