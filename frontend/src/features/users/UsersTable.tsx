import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { formatDate } from "@/lib/format";
import { roleList, userDisplayName } from "./user-format";
import type { AdminUser } from "./users.types";
import type { Pagination } from "@/types/api";

export const UsersTable = ({ rows, loading, pagination, onView, onPageChange, onPageSizeChange }: {
  rows: AdminUser[];
  loading?: boolean;
  pagination?: Pagination;
  onView: (user: AdminUser) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
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
    emptyTitle="No users found."
    columns={[
      { key: "name", header: "Name", cell: userDisplayName },
      { key: "email", header: "Email", cell: (row) => row.email ?? "Not available" },
      { key: "roles", header: "Roles", cell: (row) => roleList(row.roles) },
      { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "neutral"} /> },
      { key: "two_factor_enabled", header: "2FA Status", cell: (row) => row.two_factor_enabled ? "Enabled" : "Not enabled" },
      { key: "last_login_at", header: "Last Login", cell: (row) => formatDate(row.last_login_at) },
    ]}
    rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => onView(row) }, { key: "assign-role", disabled: true }, { key: "reset-password", disabled: true }, { key: "disable", disabled: true }]} />}
  />
);
