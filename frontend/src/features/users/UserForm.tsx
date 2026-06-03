import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Role } from "@/features/roles/roles.types";
import type { UserPayload } from "./users.types";

export const UserForm = ({
  open,
  roles,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  roles: Role[];
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: UserPayload) => void;
}) => {
  const [payload, setPayload] = useState<UserPayload>({
    full_name: "",
    email: "",
    status: "active",
    role_ids: [],
  });

  useEffect(() => {
    if (!open) {
      setPayload({ full_name: "", email: "", status: "active", role_ids: [] });
    }
  }, [open]);

  const toggleRole = (roleId: string, checked: boolean) => {
    setPayload((current) => ({
      ...current,
      role_ids: checked
        ? [...new Set([...(current.role_ids ?? []), roleId])]
        : (current.role_ids ?? []).filter((id) => id !== roleId),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            New users are created without exposing plaintext passwords. The backend marks password reset as required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1 text-sm">
            Full name
            <Input value={payload.full_name} onChange={(event) => setPayload((current) => ({ ...current, full_name: event.target.value }))} />
          </Label>
          <Label className="space-y-1 text-sm">
            Email
            <Input type="email" value={payload.email} onChange={(event) => setPayload((current) => ({ ...current, email: event.target.value }))} />
          </Label>
          <Label className="space-y-1 text-sm">
            Status
            <Select value={payload.status ?? "active"} onValueChange={(status) => setPayload((current) => ({ ...current, status }))}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="invite_pending">Invite pending</SelectItem>
                <SelectItem value="password_reset_required">Password reset required</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <div className="space-y-2">
            <p className="text-sm font-medium">Roles</p>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
              {roles.length === 0 ? <p className="text-sm text-muted-foreground">No roles loaded.</p> : null}
              {roles.map((role) => (
                <Label key={role.id} className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox
                    checked={(payload.role_ids ?? []).includes(role.id)}
                    onCheckedChange={(checked) => toggleRole(role.id, checked === true)}
                  />
                  {role.role_name}
                </Label>
              ))}
            </div>
          </div>
          {error ? <FormError message={error} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={() => onSubmit(payload)}>Create user</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
