import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { RegisterDevicePayload } from "./devices.types";

export const DeviceRegistrationDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (payload: RegisterDevicePayload) => void }) => {
  const [values, setValues] = useState<RegisterDevicePayload>({ device_name: "", outlet_id: "", device_type: "kiosk", reason: "" });
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    if (!values.device_name || !values.outlet_id || !values.device_type) {
      setLocalError("Device name, outlet, and type are required.");
      return;
    }
    setLocalError(null);
    onSubmit(values);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register device</DialogTitle>
          <DialogDescription>The device token will only be shown once if the backend returns one.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>Device name<Input value={values.device_name} onChange={(event) => setValues((current) => ({ ...current, device_name: event.target.value }))} /></Label>
          <Label>Outlet<OutletCombobox value={values.outlet_id} onChange={(value) => setValues((current) => ({ ...current, outlet_id: value ?? "" }))} /></Label>
          <Label>Device type<Input value={values.device_type} onChange={(event) => setValues((current) => ({ ...current, device_type: event.target.value }))} /></Label>
          <Label>Reason<Input value={values.reason ?? ""} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} /></Label>
        </div>
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Device could not be registered.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Register</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
