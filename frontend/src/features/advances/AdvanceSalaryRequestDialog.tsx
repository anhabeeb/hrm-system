import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useToast } from "@/components/feedback/useToast";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { AppMonthPicker } from "@/components/forms/AppMonthPicker";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { advancesApi } from "./advances.api";
import type { AdvanceSalaryPayload } from "./advances.types";

const requestTypes = [
  "SALARY_ADVANCE",
  "EMERGENCY_ADVANCE",
  "MEDICAL_ADVANCE",
  "TRAVEL_ADVANCE",
  "FESTIVAL_ADVANCE",
  "LOAN_ADVANCE",
  "OTHER_ADVANCE",
];

const humanize = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmployeeId?: string | null;
  canSelectEmployee?: boolean;
  onSubmitted?: () => Promise<void> | void;
}

export const AdvanceSalaryRequestDialog = ({ open, onOpenChange, currentEmployeeId, canSelectEmployee = false, onSubmitted }: Props) => {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(currentEmployeeId ?? "");
  const [requestType, setRequestType] = useState("SALARY_ADVANCE");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MVR");
  const [requestedPaymentDate, setRequestedPaymentDate] = useState("");
  const [repaymentStartMonth, setRepaymentStartMonth] = useState("");
  const [repaymentMonths, setRepaymentMonths] = useState("1");
  const [reason, setReason] = useState("");
  const [employeeNote, setEmployeeNote] = useState("");

  const effectiveEmployeeId = canSelectEmployee ? employeeId : currentEmployeeId ?? "";
  const reset = () => {
    setEmployeeId(currentEmployeeId ?? "");
    setRequestType("SALARY_ADVANCE");
    setAmount("");
    setCurrency("MVR");
    setRequestedPaymentDate("");
    setRepaymentStartMonth("");
    setRepaymentMonths("1");
    setReason("");
    setEmployeeNote("");
  };

  useEffect(() => {
    if (open) setEmployeeId(currentEmployeeId ?? "");
  }, [currentEmployeeId, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!effectiveEmployeeId) throw new Error("Your employee profile is not linked to this login. Please contact HR.");
      const payload: AdvanceSalaryPayload = {
        employee_id: canSelectEmployee ? effectiveEmployeeId : undefined,
        request_type: requestType,
        requested_amount: Number(amount),
        currency,
        requested_payment_date: requestedPaymentDate || undefined,
        repayment_start_month: repaymentStartMonth || undefined,
        repayment_months: Number(repaymentMonths || 1),
        reason,
        employee_note: employeeNote || undefined,
      };
      const created = await advancesApi.createSalaryRequest(payload);
      return advancesApi.submitSalaryRequest(created.data.advance_salary_request.id);
    },
    onSuccess: async () => {
      toast.success("Your advance salary request has been submitted for approval.");
      reset();
      onOpenChange(false);
      await onSubmitted?.();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Advance salary request could not be submitted.", "payroll")),
  });

  const canSubmit = Boolean(effectiveEmployeeId && reason.trim().length >= 3 && Number(amount) > 0 && Number(repaymentMonths) > 0);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) reset(); onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request advance salary</DialogTitle>
          <DialogDescription>
            Submit an advance salary request for operation-owner and final approval. Department, position, and level are derived by HRM.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {canSelectEmployee ? (
            <Label className="grid gap-1 text-sm">Employee<EmployeeCombobox value={employeeId} onChange={(value) => setEmployeeId(value ?? "")} /></Label>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm md:col-span-2">
              {currentEmployeeId ? "Requesting for your linked employee profile." : "Your employee profile is not linked to this login. Please contact HR."}
            </div>
          )}
          <Label className="grid gap-1 text-sm">Request type
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{requestTypes.map((type) => <SelectItem key={type} value={type}>{humanize(type)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-sm">Requested amount<Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Label>
          <Label className="grid gap-1 text-sm">Currency<Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></Label>
          <AppDatePicker label="Requested payment date" value={requestedPaymentDate} onChange={(value) => setRequestedPaymentDate(value ?? "")} />
          <AppMonthPicker label="Repayment start month" value={repaymentStartMonth} onChange={(value) => setRepaymentStartMonth(value ?? "")} />
          <Label className="grid gap-1 text-sm">Repayment months<Input type="number" min="1" max="60" value={repaymentMonths} onChange={(event) => setRepaymentMonths(event.target.value)} /></Label>
          <Label className="grid gap-1 text-sm md:col-span-2">Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
          <Label className="grid gap-1 text-sm md:col-span-2">Employee note, optional<Textarea value={employeeNote} onChange={(event) => setEmployeeNote(event.target.value)} /></Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>Submit for approval</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
