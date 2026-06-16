import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { CorrectionRequestPayload, ReasonPayload } from "./attendance.types";

export const CorrectionRequestDialog = ({
  open,
  mode = "request",
  title = "Request attendance correction",
  description = "Submit a correction request with a clear reason for HR review.",
  initial,
  loading,
  error,
  canSelectEmployee = true,
  currentEmployeeId,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode?: "request" | "reason";
  title?: string;
  description?: string;
  initial?: Partial<CorrectionRequestPayload> & { outlet_id?: string };
  loading?: boolean;
  error?: unknown;
  canSelectEmployee?: boolean;
  currentEmployeeId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CorrectionRequestPayload | ReasonPayload) => void;
}) => {
  const [values, setValues] = useState<CorrectionRequestPayload>({
    employee_id: initial?.employee_id ?? currentEmployeeId ?? "",
    attendance_date: initial?.attendance_date ?? "",
    correction_type: initial?.correction_type ?? "clock_in_time",
    requested_clock_in: "",
    requested_clock_out: "",
    reason: "",
  });
  const [outletId, setOutletId] = useState(initial?.outlet_id ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues({
      employee_id: initial?.employee_id ?? currentEmployeeId ?? "",
      attendance_date: initial?.attendance_date ?? "",
      correction_type: initial?.correction_type ?? "clock_in_time",
      requested_clock_in: "",
      requested_clock_out: "",
      reason: "",
    });
    setOutletId(initial?.outlet_id ?? "");
    setLocalError(null);
  }, [currentEmployeeId, initial?.attendance_date, initial?.correction_type, initial?.employee_id, initial?.outlet_id, open]);

  const submit = () => {
    if (!values.reason.trim()) {
      setLocalError("Reason is required.");
      return;
    }
    if (mode === "request" && !canSelectEmployee && !currentEmployeeId) {
      setLocalError("Your employee profile is not linked to this login. Please contact HR.");
      return;
    }
    if (mode === "request" && (!values.employee_id || !values.attendance_date || !values.correction_type)) {
      setLocalError("Employee, date, and correction type are required.");
      return;
    }
    setLocalError(null);
    onSubmit(mode === "request" ? { ...values, outlet_id: outletId || undefined } : { reason: values.reason, notes: values.reason, resolution_notes: values.reason });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {mode === "request" ? (
            <>
              {canSelectEmployee ? (
                <>
                  <div className="grid gap-1.5">
                    <Label>Outlet</Label>
                    <OutletCombobox value={outletId} onChange={(value) => { setOutletId(value ?? ""); setValues((current) => ({ ...current, employee_id: "" })); }} placeholder="Select outlet first" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Employee</Label>
                    <EmployeeCombobox value={values.employee_id} outletId={outletId} onChange={(value) => setValues((current) => ({ ...current, employee_id: value ?? "" }))} />
                  </div>
                </>
              ) : (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {currentEmployeeId ? "This correction will be submitted for your linked employee profile." : "Your employee profile is not linked to this login. Please contact HR."}
                </div>
              )}
              <AppDatePicker label="Attendance date" value={values.attendance_date} onChange={(value) => setValues((current) => ({ ...current, attendance_date: value ?? "" }))} />
              <div className="grid gap-1.5">
                <Label>Correction type</Label>
                <Select value={values.correction_type} onValueChange={(value) => setValues((current) => ({ ...current, correction_type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clock_in_time">Clock in time</SelectItem>
                    <SelectItem value="clock_out_time">Clock out time</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="manual_summary_update">Manual summary update</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="time" value={values.requested_clock_in} onChange={(event) => setValues((current) => ({ ...current, requested_clock_in: event.target.value }))} aria-label="Requested clock in" />
                <Input type="time" value={values.requested_clock_out} onChange={(event) => setValues((current) => ({ ...current, requested_clock_out: event.target.value }))} aria-label="Requested clock out" />
              </div>
            </>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="correction-reason">Reason</Label>
            <Textarea id="correction-reason" value={values.reason} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} />
          </div>
        </div>
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={friendlyOperationalError(error, "Attendance correction could not be submitted.")} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>{mode === "request" ? "Submit correction" : "Submit"}</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
