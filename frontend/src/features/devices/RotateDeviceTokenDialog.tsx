import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { DeviceRecord } from "./devices.types";

export const RotateDeviceTokenDialog = ({ device, token, loading, error, onOpenChange, onSubmit }: { device: DeviceRecord | null; token?: string | null; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (reason: string) => void }) => {
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
    <Dialog open={Boolean(device)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate device token</DialogTitle>
          <DialogDescription>Show the new token only once. Do not store it in the browser.</DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="rounded-md border bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">New one-time token</p>
            <code className="mt-2 block break-all rounded bg-background p-2">{token}</code>
            <Button className="mt-2" variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(token)}>Copy token</Button>
          </div>
        ) : (
          <Textarea value={reason} placeholder="Reason" onChange={(event) => setReason(event.target.value)} />
        )}
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Device token could not be rotated.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{token ? "Close" : "Cancel"}</Button>
          {!token ? <LoadingButton loading={loading} onClick={submit}>Rotate token</LoadingButton> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
