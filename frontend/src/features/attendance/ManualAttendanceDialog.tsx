import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { ManualAttendancePayload } from "./attendance.types";

export const ManualAttendanceDialog = ({
  open,
  initial,
  loading,
  error,
  endpointAvailable = true,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initial?: Partial<ManualAttendancePayload>;
  loading?: boolean;
  error?: unknown;
  endpointAvailable?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ManualAttendancePayload) => void;
}) => {
  const [values, setValues] = useState<ManualAttendancePayload>({
    employee_id: initial?.employee_id ?? "",
    outlet_id: initial?.outlet_id ?? "",
    attendance_date: initial?.attendance_date ?? "",
    clock_in_time: initial?.clock_in_time ?? "",
    clock_out_time: initial?.clock_out_time ?? "",
    status: initial?.status ?? "",
    reason: "",
    note: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const update = (key: keyof ManualAttendancePayload, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const submit = () => {
    if (!values.reason.trim()) {
      setLocalError("Reason is required.");
      return;
    }
    if (!values.outlet_id || !values.employee_id || !values.attendance_date || (!values.clock_in_time && !values.clock_out_time && !values.status)) {
      setLocalError("Select an outlet, employee, date, and at least one clock time or status.");
      return;
    }
    setLocalError(null);
    onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual attendance entry</DialogTitle>
          <DialogDescription>Add a status-only entry or manual clock times. Backend payroll locks remain enforced.</DialogDescription>
        </DialogHeader>
        {!endpointAvailable ? (
          <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">Manual attendance entry will be available after the backend endpoint is enabled.</p>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Outlet</Label>
              <OutletCombobox value={values.outlet_id} onChange={(value) => setValues((current) => ({ ...current, outlet_id: value ?? "", employee_id: "" }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Employee</Label>
              <EmployeeCombobox value={values.employee_id} outletId={values.outlet_id} onChange={(value) => update("employee_id", value ?? "")} />
            </div>
            <AppDatePicker label="Attendance date" value={values.attendance_date} onChange={(value) => update("attendance_date", value ?? "")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="manual-in">Clock in</Label>
                <Input id="manual-in" type="time" value={values.clock_in_time} onChange={(event) => update("clock_in_time", event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="manual-out">Clock out</Label>
                <Input id="manual-out" type="time" value={values.clock_out_time} onChange={(event) => update("clock_out_time", event.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manual-status">Status</Label>
              <Input id="manual-status" placeholder="absent, holiday, off_day..." value={values.status} onChange={(event) => update("status", event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manual-reason">Reason</Label>
              <Textarea id="manual-reason" value={values.reason} onChange={(event) => update("reason", event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="manual-note">Note</Label>
              <Textarea id="manual-note" value={values.note} onChange={(event) => update("note", event.target.value)} />
            </div>
          </div>
        )}
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Manual attendance entry could not be submitted.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} disabled={!endpointAvailable} onClick={submit}>Submit entry</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
