import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Role } from "@/features/roles/roles.types";
import type { AdminUser } from "./users.types";

export const RoleAssignmentDialog = ({
  user,
  roles,
  open,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  user: AdminUser | null;
  roles: Role[];
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (roleIds: string[], reason: string) => void;
}) => {
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRoleIds(user?.role_ids ?? []);
      setReason("");
      setLocalError(null);
    }
  }, [open, user]);

  const toggleRole = (roleId: string, checked: boolean) => {
    setRoleIds((current) => checked ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId));
  };

  const submit = () => {
    if (reason.trim().length < 3) {
      setLocalError("A reason is required for this action.");
      return;
    }
    setLocalError(null);
    onSubmit(roleIds, reason.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign roles</DialogTitle>
          <DialogDescription>Update role access for {user?.full_name ?? user?.email ?? "this user"}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
            {roles.map((role) => (
              <Label key={role.id} className="flex items-center gap-2 text-sm font-normal">
                <Checkbox checked={roleIds.includes(role.id)} onCheckedChange={(checked) => toggleRole(role.id, checked === true)} />
                {role.role_name}
              </Label>
            ))}
          </div>
          <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} />
          {localError ? <FormError message={localError} /> : null}
          {error ? <FormError message={error} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Save roles</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
