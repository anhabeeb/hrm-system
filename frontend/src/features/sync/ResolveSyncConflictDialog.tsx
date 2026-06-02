import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { SyncConflict, SyncReasonPayload } from "./sync.types";

export const ResolveSyncConflictDialog = ({ conflict, loading, error, onOpenChange, onSubmit }: { conflict: SyncConflict | null; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (payload: SyncReasonPayload) => void }) => {
  const [resolution, setResolution] = useState<SyncReasonPayload["resolution"]>("accept");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    if (!reason.trim()) {
      setLocalError("Reason is required.");
      return;
    }
    setLocalError(null);
    onSubmit({ resolution, reason, resolution_notes: reason });
  };
  return (
    <Dialog open={Boolean(conflict)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve sync conflict</DialogTitle>
          <DialogDescription>Choose the review outcome and provide a reason.</DialogDescription>
        </DialogHeader>
        <Select value={resolution} onValueChange={(value) => setResolution(value as SyncReasonPayload["resolution"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="accept">Accept</SelectItem>
            <SelectItem value="reject">Reject</SelectItem>
            <SelectItem value="merge">Merge</SelectItem>
            <SelectItem value="ignore">Ignore</SelectItem>
          </SelectContent>
        </Select>
        <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} />
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Sync conflict could not be resolved.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Resolve conflict</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
