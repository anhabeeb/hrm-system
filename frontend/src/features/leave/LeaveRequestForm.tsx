import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox, LeaveTypeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveRequestPayload } from "./leave.types";

export const LeaveRequestForm = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: LeaveRequestPayload) => void }) => {
  const [values, setValues] = useState<LeaveRequestPayload>({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "" });
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    if (!values.employee_id || !values.leave_type_id || !values.start_date || !values.end_date) return setLocalError("Employee, leave type, start date, and end date are required.");
    if (values.start_date > values.end_date) return setLocalError("Start date must be before or equal to end date.");
    setLocalError(null);
    onSubmit(values);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New leave request</DialogTitle><DialogDescription>Create a backend-validated leave request.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <Label className="space-y-1.5">Employee<EmployeeCombobox value={values.employee_id} onChange={(value) => setValues((current) => ({ ...current, employee_id: value ?? "" }))} /></Label>
          <Label className="space-y-1.5">Leave type<LeaveTypeCombobox value={values.leave_type_id} onChange={(value) => setValues((current) => ({ ...current, leave_type_id: value ?? "" }))} /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label>Start Date<Input type="date" value={values.start_date} onChange={(event) => setValues((current) => ({ ...current, start_date: event.target.value }))} /></Label>
            <Label>End Date<Input type="date" value={values.end_date} onChange={(event) => setValues((current) => ({ ...current, end_date: event.target.value }))} /></Label>
          </div>
          <Label>Reason<Textarea value={values.reason ?? ""} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} /></Label>
        </div>
        {localError ? <FormError message={localError} /> : null}{error ? <FormError message={error} /> : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>Submit request</LoadingButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
