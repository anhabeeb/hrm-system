import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { DocumentCategory } from "./documents.types";

const columns: TableColumn<DocumentCategory>[] = [
  { key: "category_key", header: "Key" },
  { key: "category_name", header: "Name" },
  { key: "is_sensitive", header: "Sensitive", cell: (row) => row.is_sensitive ? <StatusBadge status="warning" label="Sensitive" /> : "No" },
  { key: "requires_expiry_date", header: "Expiry", cell: (row) => row.requires_expiry_date ? "Required" : "Optional" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "active"} /> },
];

export const DocumentCategoriesPanel = ({ rows, loading, pagination, onPageChange, onPageSizeChange }: { rows: DocumentCategory[]; loading?: boolean; pagination?: Pagination; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} emptyTitle="No document categories" emptyDescription="Document category settings are available when backend permissions allow them." />
);
