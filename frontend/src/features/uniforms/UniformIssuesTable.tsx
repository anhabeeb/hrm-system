import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate } from "@/lib/safe-display";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";
import type { UniformRecord } from "./uniforms.types";

const columns: TableColumn<UniformRecord>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_code ?? row.employee_id },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "Unassigned" },
  { key: "uniform_type", header: "Uniform Type" },
  { key: "quantity", header: "Quantity" },
  { key: "issued_date", header: "Issue Date", cell: (row) => formatDate(row.issued_date) },
  { key: "returned_date", header: "Return Date", cell: (row) => formatDate(row.returned_date) },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> },
];

export const UniformIssuesTable = ({ rows, loading, pagination, canReturn, onView, onReturn, onPageChange, onPageSizeChange }: { rows: UniformRecord[]; loading?: boolean; pagination?: Pagination; canReturn?: boolean; onView: (row: UniformRecord) => void; onReturn: (row: UniformRecord) => void; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void }) => (
  <DataTable columns={columns} rows={rows} getRowId={(row) => row.id} loading={loading} pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onRowClick={onView} emptyTitle="No uniform records" emptyDescription="Uniform issues and returns will appear here." rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => onView(row) }, ...(canReturn ? [{ key: "more" as const, label: "Return", onSelect: () => onReturn(row), disabled: Boolean(row.returned_date) }] : [])]} />} />
);
