import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { EmployeeStatusBadge } from "./EmployeeStatusBadge";
import { displayDate } from "./employee-format";
import type { Employee } from "./employees.types";
import type { Pagination } from "@/types/api";

export const EmployeeList = ({
  rows,
  loading,
  pagination,
  canEdit,
  onView,
  onEdit,
  onPageChange,
  onPageSizeChange,
}: {
  rows: Employee[];
  loading?: boolean;
  pagination?: Pagination;
  canEdit: boolean;
  onView: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) => (
  <DataTable
    compact
    rows={rows}
    loading={loading}
    pagination={pagination}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    getRowId={(row) => row.id}
    onRowClick={onView}
    emptyTitle="No employees found."
    emptyDescription="Try adjusting filters or add the first employee if you have permission."
    columns={[
      { key: "employee_code", header: "Employee Code" },
      { key: "full_name", header: "Full Name" },
      { key: "employee_type", header: "Employee Type" },
      { key: "primary_outlet_name", header: "Outlet", cell: (row) => row.primary_outlet_name ?? "Not assigned" },
      { key: "department_name", header: "Department", cell: (row) => row.department_name ?? "Not assigned" },
      { key: "position_title", header: "Position", cell: (row) => row.position_title ?? "Not assigned" },
      { key: "employment_status", header: "Employment Status", cell: (row) => <EmployeeStatusBadge status={row.employment_status} /> },
      { key: "joined_at", header: "Joined Date", cell: (row) => displayDate(row.joined_at) },
    ]}
    rowActions={(row) => (
      <RowActions
        actions={[
          { key: "view", onSelect: () => onView(row) },
          ...(canEdit ? [{ key: "edit" as const, onSelect: () => onEdit(row) }] : []),
        ]}
      />
    )}
  />
);
