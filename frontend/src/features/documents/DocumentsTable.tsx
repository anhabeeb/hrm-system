import { DataTable } from "@/components/data/DataTable";
import { RowActions, type RowAction } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate, formatDateTime } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import { documentName } from "./document-format";
import type { DocumentRecord } from "./documents.types";

export const documentColumns = (canViewSensitive: boolean): TableColumn<DocumentRecord>[] => [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "document_type", header: "Document Type", cell: (row) => row.category_name ?? row.document_type },
  { key: "file_name", header: "File Name", cell: (row) => documentName(row, canViewSensitive) },
  { key: "expiry_date", header: "Expiry Date", cell: (row) => formatDate(row.expiry_date) },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "valid"} /> },
  { key: "is_sensitive", header: "Sensitive", cell: (row) => row.is_sensitive ? <StatusBadge status="warning" label="Sensitive" /> : <StatusBadge status="neutral" label="No" /> },
  { key: "uploaded_at", header: "Uploaded", cell: (row) => formatDateTime(row.uploaded_at ?? row.created_at) },
];

export const DocumentsTable = ({ rows, loading, pagination, canViewSensitive, canDownload, canEdit, canDelete, onView, onDownload, onUpdate, onDelete, onPageChange, onPageSizeChange }: {
  rows: DocumentRecord[];
  loading?: boolean;
  pagination?: Pagination;
  canViewSensitive?: boolean;
  canDownload?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onView: (row: DocumentRecord) => void;
  onDownload: (row: DocumentRecord) => void;
  onUpdate: (row: DocumentRecord) => void;
  onDelete: (row: DocumentRecord) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) => (
  <DataTable
    columns={documentColumns(Boolean(canViewSensitive))}
    rows={rows}
    getRowId={(row) => row.id}
    loading={loading}
    pagination={pagination}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    onRowClick={onView}
    emptyTitle="No documents"
    emptyDescription="Uploaded employee documents will appear here."
    rowActions={(row) => {
      const actions: RowAction[] = [{ key: "view", onSelect: () => onView(row) }];
      if (canDownload && (!row.is_sensitive || canViewSensitive)) actions.push({ key: "download", onSelect: () => onDownload(row) });
      if (canEdit) actions.push({ key: "edit", onSelect: () => onUpdate(row) });
      if (canDelete) actions.push({ key: "delete", onSelect: () => onDelete(row) });
      return <RowActions actions={actions} />;
    }}
  />
);
