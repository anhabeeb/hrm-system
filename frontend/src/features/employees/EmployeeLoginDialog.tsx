import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Outlet } from "@/features/outlets/outlets.types";
import type { Role } from "@/features/roles/roles.types";
import { employeesApi } from "./employees.api";
import type { Employee, EmployeeLoginCreatePayload, EmployeeLoginLinkExistingPayload, EmployeeLoginResetPasswordPayload, EmployeeLoginUpdatePayload } from "./employees.types";

export type EmployeeLoginDialogMode = "create" | "edit" | "reset" | "link";

type LoginDialogPayload = EmployeeLoginCreatePayload & EmployeeLoginUpdatePayload & EmployeeLoginResetPasswordPayload & EmployeeLoginLinkExistingPayload & { confirm_password: string };

const defaultPayload = (employee: Employee | null, mode: EmployeeLoginDialogMode): LoginDialogPayload => ({
  user_id: "",
  username: employee?.employee_code?.toLowerCase().replace(/[^a-z0-9._-]+/g, ".") ?? "",
  email: employee?.email ?? "",
  temporary_password: "",
  confirm_password: "",
  role_id: mode === "edit" ? employee?.linked_role_id ?? "" : "",
  store_ids: employee?.primary_outlet_id ? [employee.primary_outlet_id] : [],
  force_password_change: true,
  is_active: mode === "edit" ? Boolean(employee?.linked_user_active) : true,
});

export const EmployeeLoginDialog = ({
  mode = "create",
  employee,
  open,
  roles,
  outlets,
  loading,
  onOpenChange,
  onSubmit,
}: {
  mode?: EmployeeLoginDialogMode;
  employee: Employee | null;
  open: boolean;
  roles: Role[];
  outlets: Outlet[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeeLoginCreatePayload | EmployeeLoginUpdatePayload | EmployeeLoginResetPasswordPayload | EmployeeLoginLinkExistingPayload) => void;
}) => {
  const [payload, setPayload] = useState(defaultPayload(employee, mode));
  const passwordMismatch = payload.temporary_password.length > 0 && payload.confirm_password.length > 0 && payload.temporary_password !== payload.confirm_password;
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const isCreate = mode === "create";
  const isEdit = mode === "edit";
  const isReset = mode === "reset";
  const isLink = mode === "link";

  useEffect(() => {
    if (open) {
      setPayload(defaultPayload(employee, mode));
      setUserSearch("");
    } else {
      setPayload(defaultPayload(null, mode));
    }
  }, [employee, mode, open]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedUserSearch(userSearch.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [userSearch]);

  const linkCandidatesQuery = useQuery({
    queryKey: ["employees", "login-link-candidates", employee?.id, debouncedUserSearch],
    queryFn: () => employeesApi.loginLinkCandidates({
      employee_id: employee?.id,
      search: debouncedUserSearch || undefined,
      page_size: 20,
    }),
    enabled: open && isLink && Boolean(employee?.id),
  });

  const toggleOutlet = (outletId: string, checked: boolean) => {
    setPayload((current) => ({
      ...current,
      store_ids: checked
        ? [...new Set([...(current.store_ids ?? []), outletId])]
        : (current.store_ids ?? []).filter((id) => id !== outletId),
    }));
  };

  const submit = () => {
    if (passwordMismatch) return;
    const { confirm_password: _confirmPassword, ...safePayload } = payload;
    if (isReset) {
      onSubmit({
        temporary_password: safePayload.temporary_password,
        force_password_change: safePayload.force_password_change ?? true,
      });
      return;
    }
    if (isLink) {
      onSubmit({
        user_id: safePayload.user_id.trim(),
        role_id: safePayload.role_id?.trim() || undefined,
        store_ids: safePayload.store_ids ?? [],
      });
      return;
    }
    if (isEdit) {
      onSubmit({
        username: safePayload.username?.trim(),
        email: safePayload.email?.trim() ? safePayload.email.trim() : null,
        role_id: safePayload.role_id?.trim() || undefined,
        store_ids: safePayload.store_ids ?? [],
        is_active: safePayload.is_active ?? true,
      });
      return;
    }
    onSubmit({
      ...safePayload,
      email: safePayload.email?.trim() ? safePayload.email.trim() : null,
      username: safePayload.username.trim(),
      store_ids: safePayload.store_ids ?? [],
      force_password_change: safePayload.force_password_change ?? true,
      is_active: safePayload.is_active ?? true,
    });
  };

  const title = isEdit
    ? "Edit Employee Login"
    : isReset
      ? "Reset Employee Login Password"
      : isLink
        ? "Link Existing User"
        : "Create Login for Employee";
  const primaryLabel = isEdit ? "Save login" : isReset ? "Reset password" : isLink ? "Link user" : "Create login";
  const disabled = isReset
    ? !payload.temporary_password || passwordMismatch
      : isLink
        ? !payload.user_id.trim()
      : isEdit
        ? !payload.username?.trim()
        : !payload.username.trim() || !payload.role_id || !payload.temporary_password || passwordMismatch;
  const searchableUsers = (linkCandidatesQuery.data?.data ?? [])
    .filter((user) => !user.employee_id || user.employee_id === employee?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Manage login access linked to {employee?.full_name ?? "this employee"}. Temporary passwords are never stored or shown after save.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <Label className="space-y-1 text-sm md:col-span-2">
            Employee
            <Input value={employee ? `${employee.full_name} (${employee.employee_code})` : ""} readOnly />
          </Label>
          {isLink ? (
            <div className="space-y-3 md:col-span-2">
              <Label className="space-y-1 text-sm">
                Search existing users
                <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search by name, username, or email" />
              </Label>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                {linkCandidatesQuery.isLoading ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Searching users...</p>
                ) : searchableUsers.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No available unlinked users found.</p>
                ) : searchableUsers.map((user) => {
                  const selected = payload.user_id === user.id;
                  const linkedElsewhere = Boolean(user.employee_id && user.employee_id !== employee?.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${selected ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                      disabled={linkedElsewhere}
                      onClick={() => {
                        if (!linkedElsewhere) setPayload((current) => ({ ...current, user_id: user.id }));
                      }}
                    >
                      <span className="block font-medium">{user.full_name ?? "Unnamed user"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {user.username ? `@${user.username}` : "No username"} - {user.email ?? "No email"} - {user.status} - {user.employee_id ? `Linked to ${user.employee_name ?? user.employee_code ?? "employee"}` : "Not linked"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {!isLink && !isReset ? (
            <>
              <Label className="space-y-1 text-sm">
                Username
                <Input value={payload.username ?? ""} onChange={(event) => setPayload((current) => ({ ...current, username: event.target.value }))} />
              </Label>
              <Label className="space-y-1 text-sm">
                Email (optional)
                <Input type="email" value={payload.email ?? ""} onChange={(event) => setPayload((current) => ({ ...current, email: event.target.value }))} />
              </Label>
            </>
          ) : null}
          {isCreate || isReset ? (
            <>
              <Label className="space-y-1 text-sm">
                Temporary password
                <Input type="password" autoComplete="new-password" value={payload.temporary_password} onChange={(event) => setPayload((current) => ({ ...current, temporary_password: event.target.value }))} />
              </Label>
              <Label className="space-y-1 text-sm">
                Confirm temporary password
                <Input type="password" autoComplete="new-password" value={payload.confirm_password} onChange={(event) => setPayload((current) => ({ ...current, confirm_password: event.target.value }))} />
                {passwordMismatch ? <span className="text-xs text-destructive">Passwords do not match.</span> : null}
              </Label>
            </>
          ) : null}
          {!isReset ? (
            <>
              <Label className="space-y-1 text-sm md:col-span-2">
                Role
                <Select value={payload.role_id ?? ""} onValueChange={(role_id) => setPayload((current) => ({ ...current, role_id }))}>
                  <SelectTrigger><SelectValue placeholder={isLink ? "Keep existing role unless selected" : "Choose a role"} /></SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.role_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Label>
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium">Store / outlet assignment</p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
                  {outlets.length === 0 ? <p className="text-sm text-muted-foreground">No outlets loaded. The backend will still enforce outlet scope.</p> : null}
                  {outlets.map((outlet) => (
                    <Label key={outlet.id} className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox checked={(payload.store_ids ?? []).includes(outlet.id)} onCheckedChange={(checked) => toggleOutlet(outlet.id, checked === true)} />
                      {outlet.name}
                    </Label>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {isCreate || isReset ? (
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={payload.force_password_change} onCheckedChange={(checked) => setPayload((current) => ({ ...current, force_password_change: checked === true }))} />
              Force password change on first login
            </Label>
          ) : null}
          {isCreate || isEdit ? (
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={payload.is_active} onCheckedChange={(checked) => setPayload((current) => ({ ...current, is_active: checked === true }))} />
              Active user
            </Label>
          ) : null}
          <p className="text-xs text-muted-foreground md:col-span-2">
            Two-factor authentication is configured after first sign-in through the existing secure setup flow.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton
            loading={loading}
            disabled={disabled}
            onClick={submit}
          >
            {primaryLabel}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

