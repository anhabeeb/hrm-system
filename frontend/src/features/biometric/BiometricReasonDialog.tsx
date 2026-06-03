import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";

export const BiometricReasonDialog = ({ open, title, description, loading, error, onOpenChange, onSubmit }: { open: boolean; title: string; description: string; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (reason: string) => void }) => {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    if (!reason.trim()) {
      setLocalError("Reason is required.");
      return;
    }
    setLocalError(null);
    onSubmit(reason);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} />
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "This action could not be completed.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Submit</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
