import { useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { AppMonthPicker } from "@/components/forms/AppMonthPicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SalaryLoanPayload } from "./salary-loans.types";

export const SalaryLoanForm = ({
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
  onSubmit: (payload: SalaryLoanPayload) => void;
}) => {
  const [payload, setPayload] = useState({ employee_id: "", loan_amount: "", installment_amount: "", start_month: "", reason: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create salary loan</DialogTitle>
          <DialogDescription>Loan and installment amounts are submitted as integer minor units.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Label className="space-y-1 text-sm">Employee<EmployeeCombobox value={payload.employee_id} onChange={(value) => setPayload((current) => ({ ...current, employee_id: value ?? "" }))} /></Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label className="space-y-1 text-sm">Loan amount<Input type="number" min="1" step="1" value={payload.loan_amount} onChange={(event) => setPayload((current) => ({ ...current, loan_amount: event.target.value }))} /></Label>
            <Label className="space-y-1 text-sm">Installment amount<Input type="number" min="1" step="1" value={payload.installment_amount} onChange={(event) => setPayload((current) => ({ ...current, installment_amount: event.target.value }))} /></Label>
          </div>
          <AppMonthPicker label="Start month" value={payload.start_month} onChange={(value) => setPayload((current) => ({ ...current, start_month: value ?? "" }))} />
          <Label className="space-y-1 text-sm">Reason<Textarea value={payload.reason} onChange={(event) => setPayload((current) => ({ ...current, reason: event.target.value }))} /></Label>
          <FormError message={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={() => onSubmit({ employee_id: payload.employee_id, loan_amount: Number(payload.loan_amount), installment_amount: Number(payload.installment_amount), start_month: payload.start_month, reason: payload.reason })}>Create loan</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
