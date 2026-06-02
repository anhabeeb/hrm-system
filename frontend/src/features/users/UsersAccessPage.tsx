import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, UserPlus } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { rolesApi } from "@/features/roles/roles.api";
import type { Permission } from "@/features/roles/roles.types";
import { searchParamNumber } from "@/lib/query-string";
import { RoleAssignmentDialog } from "./RoleAssignmentDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { UserDetailDrawer } from "./UserDetailDrawer";
import { UserFilters } from "./UserFilters";
import { UserForm } from "./UserForm";
import { UserStatusDialog } from "./UserStatusDialog";
import { UsersTable } from "./UsersTable";
import { SEEDED_PERMISSION_FOUNDATION, USER_ACCESS_API_CONNECTED } from "./user-access.constants";
import { usersApi } from "./users.api";
import type { AdminUser } from "./users.types";

export const UsersAccessPage = () => {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filters = useMemo(() => ({
    search: searchParams.get("search") || undefined,
    role: searchParams.get("role") || undefined,
    status: searchParams.get("status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const usersQuery = useQuery({
    queryKey: ["users", filters],
    queryFn: () => usersApi.list(filters),
    enabled: USER_ACCESS_API_CONNECTED,
  });
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesApi.list(),
    enabled: USER_ACCESS_API_CONNECTED,
  });

  const setFilterValues = (values: { search?: string; status?: string; role?: string; page?: number; page_size?: number }) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    if (!("page" in values)) next.set("page", "1");
    setSearchParams(next);
  };

  const permissionRows = Object.entries(
    SEEDED_PERMISSION_FOUNDATION.reduce<Record<string, Permission[]>>((groups, permission) => {
      groups[permission.module] = [...(groups[permission.module] ?? []), permission];
      return groups;
    }, {}),
  ).map(([module, permissions]) => ({ id: module, module, permissions: permissions.map((permission) => permission.permission_key).join(", ") }));

  return (
    <div>
      <PageHeader title="Users & Access" description="User accounts, role foundation, and permission matrix overview" />
      <div className="space-y-4 p-4 md:p-6">
        <InlineAlert title="User and role management APIs are not connected yet. This page is ready for the backend endpoints." variant="info">
          The page does not call missing `/users`, `/roles`, or `/permissions` endpoints. Mutating user and role actions stay disabled until those backend routes are implemented.
        </InlineAlert>
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="permissions">Permission Matrix</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-base font-semibold">Users</h2><p className="text-sm text-muted-foreground">Sensitive password, token, TOTP secret, and backup code fields are never displayed.</p></div>
              {auth.hasPermission("users.create") ? <Button disabled><UserPlus className="h-4 w-4" /> Create User</Button> : null}
            </div>
            <UserFilters search={filters.search} status={filters.status} role={filters.role} onChange={setFilterValues} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
            {!USER_ACCESS_API_CONNECTED ? (
              <EmptyState title="Users foundation is ready." description="Live user list, invite, role assignment, status, and reset password actions will activate when backend user management routes are registered." icon={<ShieldCheck className="h-8 w-8" />} />
            ) : usersQuery.isError ? (
              <EmptyState title="Users endpoint is not connected yet." description="User list, invite, role assignment, status, and reset password actions will activate when backend user management routes are registered." icon={<ShieldCheck className="h-8 w-8" />} />
            ) : (
              <UsersTable rows={usersQuery.data?.data ?? []} loading={usersQuery.isLoading} pagination={usersQuery.data?.pagination} onView={(user) => { setSelected(user); setDrawerOpen(true); }} onPageChange={(page) => setFilterValues({ page })} onPageSizeChange={(page_size) => setFilterValues({ page: 1, page_size })} />
            )}
            <UserForm />
            <RoleAssignmentDialog />
            <UserStatusDialog />
            <ResetPasswordDialog />
            <UserDetailDrawer user={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
          </TabsContent>
          <TabsContent value="roles" className="space-y-4">
            {!USER_ACCESS_API_CONNECTED ? <InlineAlert title="Seeded permission reference" variant="info">This tab shows a local seeded permission reference. It is not live backend role data.</InlineAlert> : null}
            {USER_ACCESS_API_CONNECTED && rolesQuery.isError ? <EmptyState title="Roles endpoint is not connected yet." description="Roles are shown as a read-only foundation until backend role routes are available." /> : null}
            <DataTable compact loading={USER_ACCESS_API_CONNECTED && rolesQuery.isLoading} rows={USER_ACCESS_API_CONNECTED ? (rolesQuery.data?.data ?? []) : []} getRowId={(row) => row.id} emptyTitle="No live roles loaded." columns={[
              { key: "role_name", header: "Role Name" },
              { key: "role_key", header: "Role Key" },
              { key: "users_count", header: "Users Count", cell: (row) => row.users_count ?? "Not available" },
              { key: "is_active", header: "Status", cell: (row) => <StatusBadge status={row.is_active === false || row.is_active === 0 ? "disabled" : "active"} /> },
            ]} rowActions={(row) => <RowActions actions={[{ key: "view" }, { key: "edit", disabled: Boolean(row.is_system_role) || !auth.hasPermission("roles.edit") }]} />} />
          </TabsContent>
          <TabsContent value="permissions">
            <div className="space-y-3">
              <InlineAlert title="Seeded permission reference" variant="info">
                Active matrix rows come from backend seed files and do not call `/permissions`.
              </InlineAlert>
              <DataTable compact rows={permissionRows} getRowId={(row) => row.id} columns={[{ key: "module", header: "Module" }, { key: "permissions", header: "Seeded Permissions" }]} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
