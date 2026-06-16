import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { AppMonthPicker } from "@/components/forms/AppMonthPicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AdvancePayload } from "./advances.types";

export const AdvanceForm = ({
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
  onSubmit: (payload: AdvancePayload) => void;
}) => {
  const [payload, setPayload] = useState({ employee_id: "", amount: "", paid_date: "", deduction_month: "", reason: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create advance payment</DialogTitle>
          <DialogDescription>Amounts are submitted as integer minor units to match payroll storage.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1 text-sm">Employee<EmployeeCombobox value={payload.employee_id} onChange={(value) => setPayload((current) => ({ ...current, employee_id: value ?? "" }))} /></Label>
          <Label className="space-y-1 text-sm">Amount minor units<Input type="number" min="1" step="1" value={payload.amount} onChange={(event) => setPayload((current) => ({ ...current, amount: event.target.value }))} /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppDatePicker label="Paid date" value={payload.paid_date} onChange={(value) => setPayload((current) => ({ ...current, paid_date: value ?? "" }))} />
            <AppMonthPicker label="Deduction month" value={payload.deduction_month} onChange={(value) => setPayload((current) => ({ ...current, deduction_month: value ?? "" }))} />
          </div>
          <Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(event) => setPayload((current) => ({ ...current, reason: event.target.value }))} /></Label>
          <FormError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={() => onSubmit({ ...payload, amount: Number(payload.amount) })}>Create advance</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
