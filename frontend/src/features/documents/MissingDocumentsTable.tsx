import { DataTable } from "@/components/data/DataTable";
import { StatusBadge } from "@/components/data/StatusBadge";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { MissingDocumentRecord } from "./documents.types";

const columns: TableColumn<MissingDocumentRecord>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "document_type", header: "Missing Document", cell: (row) => row.category_name ?? row.document_type },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "missing"} /> },
];

export const MissingDocumentsTable = ({ rows, loading, pagination, onPageChange, onPageSizeChange }: { rows: MissingDocumentRecord[]; loading?: boolean; pagination?: Pagination; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => `${row.employee_id}-${row.document_type}`} loading={loading} pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} emptyTitle="No missing documents" emptyDescription="Missing document requirements will appear here." />
);
