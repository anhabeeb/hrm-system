import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { DeviceRecord } from "./devices.types";

export const DeviceStatusDialog = ({ device, loading, error, onOpenChange, onSubmit }: { device: DeviceRecord | null; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (reason: string) => void }) => {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const action = device?.status === "active" ? "disable" : "enable";
  const submit = () => {
    if (!reason.trim()) {
      setLocalError("Reason is required.");
      return;
    }
    setLocalError(null);
    onSubmit(reason);
  };
  return (
    <Dialog open={Boolean(device)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action === "disable" ? "Disable device" : "Enable device"}</DialogTitle>
          <DialogDescription>Confirm this device status change with a reason for audit history.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} />
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Device status could not be updated.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>{action === "disable" ? "Disable" : "Enable"}</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
