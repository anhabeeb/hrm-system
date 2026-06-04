import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/safe-display";
import { documentName, documentTypeLabel } from "./document-format";
import type { DocumentRecord } from "./documents.types";

export const DocumentDetailDrawer = ({ document, canViewSensitive, open, onOpenChange }: { document: DocumentRecord | null; canViewSensitive?: boolean; open: boolean; onOpenChange: (open: boolean) => void }) => (
  <DetailDrawer open={open} onOpenChange={onOpenChange} title={document ? documentName(document, Boolean(canViewSensitive)) : "Document"} subtitle={document ? documentTypeLabel(document) : undefined}>
    {document ? (
      <DetailSection title="Document Metadata" rows={[
        { label: "Employee", value: document.employee_name ?? document.employee_id },
        { label: "Outlet", value: document.outlet_name ?? document.outlet_id ?? "Unassigned" },
        { label: "Type", value: document.category_name ?? documentTypeLabel(document) },
        { label: "Document number", value: document.document_number ?? "Not available" },
        { label: "Issue date", value: formatDate(document.issue_date) },
        { label: "Start date", value: formatDate(document.start_date) },
        { label: "File", value: documentName(document, Boolean(canViewSensitive)) },
        { label: "Expiry", value: formatDate(document.expiry_date) },
        { label: "Status", value: <StatusBadge status={document.validity_status ?? document.status ?? "valid"} /> },
        { label: "Version", value: `v${document.version_number ?? 1}` },
        { label: "Sensitive", value: document.is_sensitive ? "Yes" : "No" },
        { label: "Uploaded", value: formatDateTime(document.uploaded_at ?? document.created_at) },
      ]} />
    ) : null}
  </DetailDrawer>
);
