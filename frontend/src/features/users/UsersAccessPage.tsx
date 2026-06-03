import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { friendlyHrmError } from "@/lib/hrm-errors";
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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"enable" | "disable" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const filters = useMemo(() => ({
    search: searchParams.get("search") || undefined,
    role_id: searchParams.get("role_id") || undefined,
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
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => rolesApi.permissions(),
    enabled: USER_ACCESS_API_CONNECTED,
  });

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  };
  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: async () => {
      setSuccessMessage("User created successfully.");
      setFormOpen(false);
      await refreshUsers();
    },
  });
  const roleMutation = useMutation({
    mutationFn: ({ roleIds, reason }: { roleIds: string[]; reason: string }) => usersApi.assignRoles(selected!.id, roleIds, reason),
    onSuccess: async (response) => {
      setSuccessMessage("User roles updated successfully.");
      setSelected(response.data.user);
      setRoleDialogOpen(false);
      await refreshUsers();
    },
  });
  const resetMutation = useMutation({
    mutationFn: (reason: string) => usersApi.resetPassword(selected!.id, reason),
    onSuccess: async () => {
      setSuccessMessage("Password reset has been required for this user.");
      setResetDialogOpen(false);
      await refreshUsers();
    },
  });
  const statusMutation = useMutation({
    mutationFn: (reason: string) => statusAction === "enable" ? usersApi.enable(selected!.id, reason) : usersApi.disable(selected!.id, reason),
    onSuccess: async (response) => {
      setSuccessMessage(statusAction === "enable" ? "User enabled successfully." : "User disabled successfully.");
      setSelected(response.data.user);
      setStatusAction(null);
      await refreshUsers();
    },
  });
  const setFilterValues = (values: { search?: string; status?: string; role_id?: string; page?: number; page_size?: number }) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    if (!("page" in values)) next.set("page", "1");
    setSearchParams(next);
  };

  const activePermissions = USER_ACCESS_API_CONNECTED && permissionsQuery.data?.data?.length
    ? permissionsQuery.data.data
    : SEEDED_PERMISSION_FOUNDATION;
  const permissionRows = Object.entries(
    activePermissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      groups[permission.module] = [...(groups[permission.module] ?? []), permission];
      return groups;
    }, {}),
  ).map(([module, permissions]) => ({ id: module, module, permissions: permissions.map((permission) => permission.permission_key).join(", ") }));
  const roles = rolesQuery.data?.data ?? [];
  const error = usersQuery.error ?? createMutation.error ?? roleMutation.error ?? resetMutation.error ?? statusMutation.error;

  return (
    <div>
      <PageHeader title="Users & Access" description="User accounts, role foundation, and permission matrix overview" />
      <div className="space-y-4 p-4 md:p-6">
        {!USER_ACCESS_API_CONNECTED ? (
          <InlineAlert title="Users & Access APIs are disabled in this build." variant="info">
            Live user, role, and permission requests are disabled by the feature connection flag.
          </InlineAlert>
        ) : null}
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Users & Access action could not be completed.")} variant="error" /> : null}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="permissions">Permission Matrix</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
              <div><h2 className="text-base font-semibold">Users</h2><p className="text-sm text-muted-foreground">Sensitive password, token, TOTP secret, and backup code fields are never displayed.</p></div>
              {auth.hasPermission("users.create") ? <Button onClick={() => setFormOpen(true)}><UserPlus className="h-4 w-4" /> Create User</Button> : null}
            </div>
            <UserFilters search={filters.search} status={filters.status} roleId={filters.role_id} roles={roles} onChange={setFilterValues} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
            {!USER_ACCESS_API_CONNECTED ? (
              <EmptyState title="Users API is disabled in this build." description="Enable the Users & Access API connection flag to load live user data." icon={<ShieldCheck className="h-8 w-8" />} />
            ) : usersQuery.isError ? (
              <EmptyState title="Users could not be loaded." description="Please review the error message above and try again." icon={<ShieldCheck className="h-8 w-8" />} />
            ) : (
              <UsersTable
                rows={usersQuery.data?.data ?? []}
                loading={usersQuery.isLoading}
                pagination={usersQuery.data?.pagination}
                canAssignRoles={auth.hasPermission("users.edit") || auth.hasPermission("roles.edit")}
                canResetPassword={auth.hasPermission("users.reset_password") || auth.hasPermission("users.edit")}
                canEditStatus={auth.hasPermission("users.edit") || auth.hasPermission("users.enable") || auth.hasPermission("users.disable")}
                onView={(user) => { setSelected(user); setDrawerOpen(true); }}
                onAssignRoles={(user) => { setSelected(user); setRoleDialogOpen(true); }}
                onResetPassword={(user) => { setSelected(user); setResetDialogOpen(true); }}
                onEnable={(user) => { setSelected(user); setStatusAction("enable"); }}
                onDisable={(user) => { setSelected(user); setStatusAction("disable"); }}
                onPageChange={(page) => setFilterValues({ page })}
                onPageSizeChange={(page_size) => setFilterValues({ page: 1, page_size })}
              />
            )}
            <UserForm open={formOpen} roles={roles} loading={createMutation.isPending} error={createMutation.error ? friendlyHrmError(createMutation.error, "User could not be created.") : null} onOpenChange={setFormOpen} onSubmit={(payload) => createMutation.mutate(payload)} />
            <RoleAssignmentDialog user={selected} roles={roles} open={roleDialogOpen} loading={roleMutation.isPending} error={roleMutation.error ? friendlyHrmError(roleMutation.error, "Roles could not be updated.") : null} onOpenChange={setRoleDialogOpen} onSubmit={(roleIds, reason) => roleMutation.mutate({ roleIds, reason })} />
            <UserStatusDialog user={selected} action={statusAction ?? "disable"} open={Boolean(statusAction)} loading={statusMutation.isPending} error={statusMutation.error ? friendlyHrmError(statusMutation.error, "User status could not be updated.") : null} onOpenChange={(open) => !open && setStatusAction(null)} onSubmit={(reason) => statusMutation.mutate(reason)} />
            <ResetPasswordDialog user={selected} open={resetDialogOpen} loading={resetMutation.isPending} error={resetMutation.error ? friendlyHrmError(resetMutation.error, "Password reset could not be required.") : null} onOpenChange={setResetDialogOpen} onSubmit={(reason) => resetMutation.mutate(reason)} />
            <UserDetailDrawer user={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
          </TabsContent>
          <TabsContent value="roles" className="space-y-4">
            {!USER_ACCESS_API_CONNECTED ? <InlineAlert title="Seeded permission reference" variant="info">This tab shows a local seeded permission reference. It is not live backend role data.</InlineAlert> : null}
            {USER_ACCESS_API_CONNECTED && rolesQuery.isError ? <EmptyState title="Roles could not be loaded." description="Please review the error message above and try again." /> : null}
            <DataTable compact loading={USER_ACCESS_API_CONNECTED && rolesQuery.isLoading} rows={USER_ACCESS_API_CONNECTED ? (rolesQuery.data?.data ?? []) : []} getRowId={(row) => row.id} emptyTitle="No live roles loaded." columns={[
              { key: "role_name", header: "Role Name" },
              { key: "role_key", header: "Role Key" },
              { key: "users_count", header: "Users Count", cell: (row) => row.users_count ?? "Not available" },
              { key: "is_active", header: "Status", cell: (row) => <StatusBadge status={row.is_active === false || row.is_active === 0 ? "disabled" : "active"} /> },
            ]} rowActions={(row) => <RowActions actions={[{ key: "view" }, { key: "edit", disabled: Boolean(row.is_system_role) || !auth.hasPermission("roles.edit") }]} />} />
          </TabsContent>
          <TabsContent value="permissions">
            <div className="space-y-3">
              {permissionsQuery.isError ? (
                <InlineAlert title="Using local permission fallback" variant="info">
                  Backend permissions could not be loaded, so the seeded permission reference is shown as a fallback.
                </InlineAlert>
              ) : null}
              <DataTable compact rows={permissionRows} getRowId={(row) => row.id} columns={[{ key: "module", header: "Module" }, { key: "permissions", header: "Seeded Permissions" }]} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
