import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LongLeavePayload } from "./long-leave.types";

export const LongLeaveForm = ({
  open,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: LongLeavePayload) => void;
}) => {
  const [payload, setPayload] = useState<LongLeavePayload>({ employee_id: "", leave_request_id: "", start_date: "", expected_return_date: "", salary_treatment: "unpaid", deduction_method: "calendar_days", reason: "" });
  const update = (key: keyof LongLeavePayload, value: string) => setPayload((current) => ({ ...current, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create long leave</DialogTitle>
          <DialogDescription>Creates a long leave record and asks the backend to prepare salary-impact preview when possible.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Label className="space-y-1 text-sm">Employee<EmployeeCombobox value={payload.employee_id} onChange={(value) => update("employee_id", value ?? "")} /></Label>
          <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">Foreign employees are eligible by default. Local employee override requires backend permission and policy approval.</p>
          <Label className="space-y-1 text-sm">Linked leave request, optional<Input value={payload.leave_request_id ?? ""} onChange={(event) => update("leave_request_id", event.target.value)} placeholder="Optional leave request ID" /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="space-y-1 text-sm">Start date<Input type="date" value={payload.start_date} onChange={(event) => update("start_date", event.target.value)} /></Label>
            <Label className="space-y-1 text-sm">Expected return<Input type="date" value={payload.expected_return_date} onChange={(event) => update("expected_return_date", event.target.value)} /></Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="space-y-1 text-sm">Salary treatment<Select value={payload.salary_treatment ?? "unpaid"} onValueChange={(value) => update("salary_treatment", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unpaid">Unpaid</SelectItem><SelectItem value="partially_paid">Partially paid</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select></Label>
            <Label className="space-y-1 text-sm">Deduction method<Select value={payload.deduction_method ?? "calendar_days"} onValueChange={(value) => update("deduction_method", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="calendar_days">Calendar days</SelectItem><SelectItem value="working_days">Working days</SelectItem><SelectItem value="scheduled_roster_days">Scheduled roster days</SelectItem><SelectItem value="attendance_days">Attendance days</SelectItem></SelectContent></Select></Label>
          </div>
          <Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(event) => update("reason", event.target.value)} /></Label>
          <Label className="space-y-1 text-sm">Notes<Textarea value={payload.notes ?? ""} onChange={(event) => update("notes", event.target.value)} /></Label>
          <FormError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={() => onSubmit(payload)}>Create long leave</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
