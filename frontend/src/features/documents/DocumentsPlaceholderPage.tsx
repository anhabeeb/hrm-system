import { ModulePlaceholderPage, statusCell } from "@/components/data/ModulePlaceholderPage";

const rows = [
  { id: "doc-1", employee: "Aisha Mohamed", document_type: "Passport", expiry_date: "2026-09-10", status: "warning", sensitive: "Yes" },
  { id: "doc-2", employee: "Hassan Ali", document_type: "Contract", expiry_date: "2027-01-01", status: "active", sensitive: "No" },
];

export const DocumentsPlaceholderPage = () => (
  <ModulePlaceholderPage
    title="Documents"
    description="Secure metadata, expiry tracking, and access-controlled files will be connected here."
    tableTitle="Document register"
    tableDescription="Sensitive fields stay masked and permission-aware."
    rows={rows}
    columns={[
      { key: "employee", header: "Employee" },
      { key: "document_type", header: "Document Type" },
      { key: "expiry_date", header: "Expiry Date" },
      { key: "status", header: "Status", cell: statusCell("status") },
      { key: "sensitive", header: "Sensitive" },
    ]}
  />
);
