import { useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveRequest } from "./leave.types";

export const LeaveDelegateDialog = ({
  request,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  request: LeaveRequest | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (delegatedTo: string, reason: string) => void;
}) => {
  const [delegatedTo, setDelegatedTo] = useState("");
  const [reason, setReason] = useState("");
  const open = Boolean(request);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delegate leave approval</DialogTitle>
          <DialogDescription>Choose an active user in this company and record why this approval is being delegated.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error ? <InlineAlert title={error} variant="error" /> : null}
          <div className="space-y-2">
            <Label htmlFor="delegated_to">Delegated approver user ID</Label>
            <Input id="delegated_to" value={delegatedTo} onChange={(event) => setDelegatedTo(event.target.value)} placeholder="user_..." />
            <p className="text-xs text-muted-foreground">Use an active user from this company. A searchable user selector can replace this once shared user lookup is available.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delegate_reason">Reason</Label>
            <Textarea id="delegate_reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this approval delegated?" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} disabled={delegatedTo.trim().length < 3 || reason.trim().length < 3} onClick={() => onSubmit(delegatedTo.trim(), reason.trim())}>
            Delegate approval
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
