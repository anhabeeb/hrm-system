import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [payload, setPayload] = useState<LongLeavePayload>({ employee_id: "", leave_request_id: "", start_date: "", expected_return_date: "", reason: "" });
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
          <Label className="space-y-1 text-sm">Leave request ID<Input value={payload.leave_request_id} onChange={(event) => update("leave_request_id", event.target.value)} /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="space-y-1 text-sm">Start date<Input type="date" value={payload.start_date} onChange={(event) => update("start_date", event.target.value)} /></Label>
            <Label className="space-y-1 text-sm">Expected return<Input type="date" value={payload.expected_return_date} onChange={(event) => update("expected_return_date", event.target.value)} /></Label>
          </div>
          <Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(event) => update("reason", event.target.value)} /></Label>
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
