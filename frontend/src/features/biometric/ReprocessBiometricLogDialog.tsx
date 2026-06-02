import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { BiometricLog } from "./biometric.types";

export const ReprocessBiometricLogDialog = ({ log, loading, error, onOpenChange, onSubmit }: { log: BiometricLog | null; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (reason: string) => void }) => {
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
    <Dialog open={Boolean(log)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprocess biometric log</DialogTitle>
          <DialogDescription>Retry attendance processing after mapping or conflict review. Payroll locks remain enforced.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} />
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Biometric log reprocess could not be requested.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Reprocess</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
