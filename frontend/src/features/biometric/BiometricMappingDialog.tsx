import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { BiometricLog, BiometricMapping, BiometricMappingPayload, BiometricReasonPayload } from "./biometric.types";

export const BiometricMappingDialog = ({ mapping, unmatchedLog, open, loading, error, onOpenChange, onSubmit }: { mapping?: BiometricMapping | null; unmatchedLog?: BiometricLog | null; open: boolean; loading?: boolean; error?: unknown; onOpenChange: (open: boolean) => void; onSubmit: (payload: BiometricMappingPayload | BiometricReasonPayload) => void }) => {
  const [values, setValues] = useState({
    employee_id: mapping?.employee_id ?? "",
    device_id: mapping?.device_id ?? unmatchedLog?.device_id ?? "",
    biometric_user_id: mapping?.biometric_user_id ?? unmatchedLog?.biometric_user_id ?? "",
    enrollment_status: mapping?.enrollment_status ?? "enrolled",
    reason: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    if (!values.employee_id) {
      setLocalError("Employee is required.");
      return;
    }
    if (!unmatchedLog && (!values.device_id || !values.biometric_user_id)) {
      setLocalError("Device and biometric user ID are required.");
      return;
    }
    if (unmatchedLog && !values.reason.trim()) {
      setLocalError("Reason is required.");
      return;
    }
    setLocalError(null);
    onSubmit(unmatchedLog ? { employee_id: values.employee_id, reason: values.reason } : values);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unmatchedLog ? "Map unmatched biometric user" : "Employee biometric mapping"}</DialogTitle>
          <DialogDescription>Map the biometric device user ID to the correct employee profile.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>Employee<EmployeeCombobox value={values.employee_id} onChange={(value) => setValues((current) => ({ ...current, employee_id: value ?? "" }))} /></Label>
          {!unmatchedLog ? (
            <>
              <Label>Device ID<Input value={values.device_id} onChange={(event) => setValues((current) => ({ ...current, device_id: event.target.value }))} /></Label>
              <Label>Biometric User ID<Input value={values.biometric_user_id} onChange={(event) => setValues((current) => ({ ...current, biometric_user_id: event.target.value }))} /></Label>
              <Label>Enrollment status<Input value={values.enrollment_status} onChange={(event) => setValues((current) => ({ ...current, enrollment_status: event.target.value }))} /></Label>
            </>
          ) : null}
          <Label>Reason<Textarea value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} /></Label>
        </div>
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Biometric mapping could not be saved.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Save mapping</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
