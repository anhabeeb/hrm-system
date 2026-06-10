import { useEffect, useState } from "react";

import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Outlet } from "@/features/outlets/outlets.types";
import type { Role } from "@/features/roles/roles.types";
import type { Employee, EmployeeLoginCreatePayload } from "./employees.types";

const defaultPayload = (employee: Employee | null): EmployeeLoginCreatePayload & { confirm_password: string } => ({
  username: employee?.employee_code?.toLowerCase().replace(/[^a-z0-9._-]+/g, ".") ?? "",
  email: employee?.email ?? "",
  temporary_password: "",
  confirm_password: "",
  role_id: "",
  store_ids: employee?.primary_outlet_id ? [employee.primary_outlet_id] : [],
  force_password_change: true,
  require_2fa: false,
  is_active: true,
});

export const EmployeeLoginDialog = ({
  employee,
  open,
  roles,
  outlets,
  loading,
  onOpenChange,
  onSubmit,
}: {
  employee: Employee | null;
  open: boolean;
  roles: Role[];
  outlets: Outlet[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeeLoginCreatePayload) => void;
}) => {
  const [payload, setPayload] = useState(defaultPayload(employee));
  const passwordMismatch = payload.temporary_password.length > 0 && payload.confirm_password.length > 0 && payload.temporary_password !== payload.confirm_password;

  useEffect(() => {
    if (open) {
      setPayload(defaultPayload(employee));
    } else {
      setPayload(defaultPayload(null));
    }
  }, [employee, open]);

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
    onSubmit({
      ...safePayload,
      email: safePayload.email?.trim() ? safePayload.email.trim() : null,
      username: safePayload.username.trim(),
      store_ids: safePayload.store_ids ?? [],
      force_password_change: safePayload.force_password_change ?? true,
      require_2fa: false,
      is_active: safePayload.is_active ?? true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Login for Employee</DialogTitle>
          <DialogDescription>
            Create a real user account linked to {employee?.full_name ?? "this employee"}. The temporary password is never stored or shown after save.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <Label className="space-y-1 text-sm md:col-span-2">
            Employee
            <Input value={employee ? `${employee.full_name} (${employee.employee_code})` : ""} readOnly />
          </Label>
          <Label className="space-y-1 text-sm">
            Username
            <Input value={payload.username} onChange={(event) => setPayload((current) => ({ ...current, username: event.target.value }))} />
          </Label>
          <Label className="space-y-1 text-sm">
            Email (optional)
            <Input type="email" value={payload.email ?? ""} onChange={(event) => setPayload((current) => ({ ...current, email: event.target.value }))} />
          </Label>
          <Label className="space-y-1 text-sm">
            Temporary password
            <Input type="password" autoComplete="new-password" value={payload.temporary_password} onChange={(event) => setPayload((current) => ({ ...current, temporary_password: event.target.value }))} />
          </Label>
          <Label className="space-y-1 text-sm">
            Confirm temporary password
            <Input type="password" autoComplete="new-password" value={payload.confirm_password} onChange={(event) => setPayload((current) => ({ ...current, confirm_password: event.target.value }))} />
            {passwordMismatch ? <span className="text-xs text-destructive">Passwords do not match.</span> : null}
          </Label>
          <Label className="space-y-1 text-sm md:col-span-2">
            Role
            <Select value={payload.role_id} onValueChange={(role_id) => setPayload((current) => ({ ...current, role_id }))}>
              <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
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
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={payload.force_password_change} onCheckedChange={(checked) => setPayload((current) => ({ ...current, force_password_change: checked === true }))} />
            Force password change on first login
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={payload.is_active} onCheckedChange={(checked) => setPayload((current) => ({ ...current, is_active: checked === true }))} />
            Active user
          </Label>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Two-factor authentication is configured after first sign-in through the existing secure setup flow.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton
            loading={loading}
            disabled={!payload.username.trim() || !payload.role_id || !payload.temporary_password || passwordMismatch}
            onClick={submit}
          >
            Create login
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
