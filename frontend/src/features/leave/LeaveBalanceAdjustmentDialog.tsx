import { useState } from "react";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveBalance, LeaveBalanceAdjustPayload } from "./leave.types";

export const LeaveBalanceAdjustmentDialog = ({ balance, loading, error, onOpenChange, onSubmit }: { balance: LeaveBalance | null; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (employeeId: string, payload: LeaveBalanceAdjustPayload) => void }) => {
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const submit = () => {
    const adjustment_days = Number(adjustment);
    if (!balance || !Number.isFinite(adjustment_days) || reason.trim().length < 3) return setLocalError("Adjustment and reason are required.");
    setLocalError(null);
    onSubmit(balance.employee_id, { leave_type_id: balance.leave_type_id, year: balance.year, adjustment_days, reason });
  };
  return (
    <Dialog open={Boolean(balance)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust leave balance</DialogTitle><DialogDescription>Manual balance adjustments require an audit reason.</DialogDescription></DialogHeader>
        <Label>Adjustment days<Input value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></Label>
        <Label>Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
        {localError ? <FormError message={localError} /> : null}{error ? <FormError message={error} /> : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>Adjust balance</LoadingButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
