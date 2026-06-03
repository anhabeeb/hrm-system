import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { SyncReasonPayload } from "./sync.types";

export const ForceResyncDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (payload: SyncReasonPayload) => void }) => {
  const [deviceId, setDeviceId] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    if (!deviceId || !reason.trim()) {
      setLocalError("Device and reason are required.");
      return;
    }
    setLocalError(null);
    onSubmit({ device_id: deviceId, reason });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Force resync</DialogTitle>
          <DialogDescription>Request a device to pull fresh incremental sync data.</DialogDescription>
        </DialogHeader>
        <Input value={deviceId} placeholder="Device ID" onChange={(event) => setDeviceId(event.target.value)} />
        <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} />
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Force resync could not be requested.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Request resync</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
