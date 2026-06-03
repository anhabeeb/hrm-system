import { EmptyState } from "@/components/data/EmptyState";
import { LoadingState } from "@/components/data/LoadingState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Pagination } from "@/types/api";
import type { TableColumn } from "@/types/common";

import { PaginationBar } from "./PaginationBar";

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  rowActions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  compact?: boolean;
  pagination?: Pagination;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export const DataTable = <T,>({
  columns,
  rows,
  getRowId,
  loading,
  emptyTitle = "No records found",
  emptyDescription = "Try adjusting your filters or check back later.",
  rowActions,
  onRowClick,
  compact = false,
  pagination,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<T>) => (
  <div className="space-y-3">
    <div className="table-surface overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)} className={cn("whitespace-nowrap", column.className)} scope="col">
                {column.header}
              </TableHead>
            ))}
            {rowActions ? <TableHead className="w-16 text-right" scope="col">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length + (rowActions ? 1 : 0)} className="p-0">
                <LoadingState />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (rowActions ? 1 : 0)} className="p-0">
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={getRowId(row)}
                className={cn(onRowClick && "cursor-pointer hover:bg-muted/40")}
                onClick={() => onRowClick?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(event) => {
                  if (onRowClick && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onRowClick(row);
                  }
                }}
              >
                {columns.map((column) => (
                  <TableCell key={String(column.key)} className={cn(compact && "py-2", column.className)}>
                    {column.cell ? column.cell(row) : String(row[column.key as keyof T] ?? "")}
                  </TableCell>
                ))}
                {rowActions ? (
                  <TableCell className={cn("text-right", compact && "py-2")} onClick={(event) => event.stopPropagation()}>
                    {rowActions(row)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
    {pagination ? (
      <PaginationBar
        page={pagination.page}
        pageSize={pagination.page_size}
        total={pagination.total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    ) : null}
  </div>
);
