import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveBalance } from "./leave.types";

export type LeaveBalanceAction = "opening" | "carry_forward" | "expiry" | "rebuild";

const titleFor = (action: LeaveBalanceAction | null) => {
  if (action === "opening") return "Set opening balance";
  if (action === "carry_forward") return "Carry forward leave";
  if (action === "expiry") return "Expire leave balance";
  return "Rebuild balance from ledger";
};

const descriptionFor = (action: LeaveBalanceAction | null) => {
  if (action === "opening") return "Set the opening balance for this employee, leave type, and year.";
  if (action === "carry_forward") return "Move eligible unused leave into the next leave year.";
  if (action === "expiry") return "Expire leave days with an auditable reason.";
  return "Recalculate stored balance totals from immutable ledger transactions.";
};

export const LeaveBalanceActionDialog = ({
  action,
  balance,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  action: LeaveBalanceAction | null;
  balance: LeaveBalance | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { amount?: number; destinationYear?: number; effectiveDate?: string; reason: string }) => void;
}) => {
  const [amount, setAmount] = useState("");
  const [destinationYear, setDestinationYear] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!balance || !action) return;
    setAmount(action === "opening" ? String(balance.opening_balance ?? 0) : "");
    setDestinationYear(String(Number(balance.year) + 1));
    setEffectiveDate(`${balance.year}-12-31`);
    setReason("");
    setLocalError(null);
  }, [action, balance]);

  const submit = () => {
    if (!balance || !action) return;
    const parsedAmount = Number(amount);
    const parsedDestinationYear = Number(destinationYear);
    if (action !== "rebuild" && (!Number.isFinite(parsedAmount) || (action !== "opening" && parsedAmount <= 0))) {
      setLocalError("Please enter a valid leave day amount.");
      return;
    }
    if (action === "carry_forward" && (!Number.isInteger(parsedDestinationYear) || parsedDestinationYear <= balance.year)) {
      setLocalError("Destination year must be after the source year.");
      return;
    }
    if (action === "expiry" && !effectiveDate) {
      setLocalError("Please choose an expiry effective date.");
      return;
    }
    if (reason.trim().length < 3) {
      setLocalError("A reason is required for this action.");
      return;
    }
    setLocalError(null);
    onSubmit({
      amount: action === "rebuild" ? undefined : parsedAmount,
      destinationYear: action === "carry_forward" ? parsedDestinationYear : undefined,
      effectiveDate: action === "expiry" ? effectiveDate : undefined,
      reason,
    });
  };

  return (
    <Dialog open={Boolean(action && balance)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleFor(action)}</DialogTitle>
          <DialogDescription>{descriptionFor(action)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{balance?.employee_name ?? balance?.employee_id}</div>
            <div className="text-muted-foreground">{balance?.leave_type_name ?? balance?.leave_type_id} · {balance?.year}</div>
          </div>
          {action !== "rebuild" ? (
            <Label>{action === "expiry" ? "Expiry days" : action === "carry_forward" ? "Carry-forward days" : "Opening balance"}
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Label>
          ) : null}
          {action === "carry_forward" ? (
            <Label>Destination year<Input value={destinationYear} onChange={(event) => setDestinationYear(event.target.value)} /></Label>
          ) : null}
          {action === "expiry" ? (
            <AppDatePicker label="Effective date" value={effectiveDate} onChange={(value) => setEffectiveDate(value ?? "")} />
          ) : null}
          <Label>Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
          {localError ? <FormError message={localError} /> : null}
          {error ? <FormError message={error} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>{titleFor(action)}</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
