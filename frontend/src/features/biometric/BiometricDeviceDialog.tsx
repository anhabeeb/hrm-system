import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { BiometricDevice, BiometricDevicePayload } from "./biometric.types";

export const BiometricDeviceDialog = ({ device, open, loading, error, onOpenChange, onSubmit }: { device?: BiometricDevice | null; open: boolean; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (payload: BiometricDevicePayload) => void }) => {
  const [values, setValues] = useState<BiometricDevicePayload>({
    outlet_id: device?.outlet_id ?? "",
    device_name: device?.device_name ?? "",
    device_serial: device?.device_serial ?? "",
    device_code: device?.device_code ?? "",
    external_device_id: device?.external_device_id ?? "",
    device_type: device?.device_type ?? "biometric",
    sync_mode: device?.sync_mode ?? "push_api",
    vendor: device?.vendor ?? "",
    model: device?.model ?? "",
    reason: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    if (!values.outlet_id || !values.device_name || !values.device_serial || !values.device_type) {
      setLocalError("Outlet, device name, serial, and device type are required.");
      return;
    }
    setLocalError(null);
    onSubmit(values);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{device ? "Edit biometric device" : "Register biometric device"}</DialogTitle>
          <DialogDescription>Only punch-log metadata is managed here. Fingerprint or face templates are never stored.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>Outlet<OutletCombobox value={values.outlet_id} onChange={(value) => setValues((current) => ({ ...current, outlet_id: value ?? "" }))} /></Label>
          <Label>Device name<Input value={values.device_name} onChange={(event) => setValues((current) => ({ ...current, device_name: event.target.value }))} /></Label>
          <Label>Serial / external ID<Input value={values.device_serial} onChange={(event) => setValues((current) => ({ ...current, device_serial: event.target.value }))} /></Label>
          <Label>Device code<Input value={values.device_code ?? ""} onChange={(event) => setValues((current) => ({ ...current, device_code: event.target.value }))} /></Label>
          <Label>External device ID<Input value={values.external_device_id ?? ""} onChange={(event) => setValues((current) => ({ ...current, external_device_id: event.target.value }))} /></Label>
          <Label>Device type<Input value={values.device_type} placeholder="biometric, kiosk, bridge, mobile, web, other" onChange={(event) => setValues((current) => ({ ...current, device_type: event.target.value }))} /></Label>
          <Label>Vendor<Input value={values.vendor ?? ""} onChange={(event) => setValues((current) => ({ ...current, vendor: event.target.value }))} /></Label>
          <Label>Model<Input value={values.model ?? ""} onChange={(event) => setValues((current) => ({ ...current, model: event.target.value }))} /></Label>
          <Label>Sync mode<Input value={values.sync_mode} onChange={(event) => setValues((current) => ({ ...current, sync_mode: event.target.value }))} /></Label>
          <Label>Reason<Textarea value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} /></Label>
        </div>
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Biometric device could not be saved.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>{device ? "Save" : "Register"}</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
