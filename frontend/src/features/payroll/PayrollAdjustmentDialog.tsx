import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useToast } from "@/components/feedback/useToast";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { payrollApi } from "./payroll.api";
import type { PayrollAdjustmentPayload } from "./payroll.types";

const adjustmentTypes = [
  "BASIC_SALARY_CORRECTION",
  "SALARY_INCREMENT_CORRECTION",
  "ALLOWANCE_ADJUSTMENT",
  "BENEFIT_ADJUSTMENT",
  "DEDUCTION_ADJUSTMENT",
  "ABSENCE_DEDUCTION_CORRECTION",
  "UNPAID_LEAVE_DEDUCTION_CORRECTION",
  "OVERTIME_ADJUSTMENT",
  "SERVICE_CHARGE_ADJUSTMENT",
  "BONUS_ADJUSTMENT",
  "PENALTY_ADJUSTMENT",
  "PAYROLL_COMPONENT_ADJUSTMENT",
  "PAYSLIP_CORRECTION",
  "MANUAL_ADJUSTMENT",
  "GENERAL_PAYROLL_ADJUSTMENT",
];

const label = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmployeeId?: string | null;
  canSelectEmployee?: boolean;
  onSubmitted?: () => Promise<void> | void;
}

export const PayrollAdjustmentDialog = ({ open, onOpenChange, currentEmployeeId, canSelectEmployee = false, onSubmitted }: Props) => {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(currentEmployeeId ?? "");
  const [adjustmentType, setAdjustmentType] = useState("GENERAL_PAYROLL_ADJUSTMENT");
  const [direction, setDirection] = useState<PayrollAdjustmentPayload["adjustment_direction"]>("ADD");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("MVR");
  const [payrollMonth, setPayrollMonth] = useState("");
  const [payrollRunId, setPayrollRunId] = useState("");
  const [payrollItemId, setPayrollItemId] = useState("");
  const [payslipId, setPayslipId] = useState("");
  const [reason, setReason] = useState("");
  const [showAdvancedReferences, setShowAdvancedReferences] = useState(false);

  const effectiveEmployeeId = canSelectEmployee ? employeeId : currentEmployeeId ?? "";
  const reset = () => {
    setEmployeeId(currentEmployeeId ?? "");
    setAdjustmentType("GENERAL_PAYROLL_ADJUSTMENT");
    setDirection("ADD");
    setAmount("");
    setCurrency("MVR");
    setPayrollMonth("");
    setPayrollRunId("");
    setPayrollItemId("");
    setPayslipId("");
    setReason("");
    setShowAdvancedReferences(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!effectiveEmployeeId) throw new Error("Your employee profile is not linked to this login. Please contact HR.");
      const payload: PayrollAdjustmentPayload = {
        employee_id: canSelectEmployee ? effectiveEmployeeId : undefined,
        payroll_run_id: canSelectEmployee && showAdvancedReferences ? payrollRunId || undefined : undefined,
        payroll_item_id: canSelectEmployee && showAdvancedReferences ? payrollItemId || undefined : undefined,
        payslip_id: canSelectEmployee && showAdvancedReferences ? payslipId || undefined : undefined,
        adjustment_type: adjustmentType,
        adjustment_direction: direction,
        amount: direction === "NEUTRAL" ? null : Number(amount),
        currency,
        effective_payroll_month: payrollMonth || undefined,
        reason,
        requested_value_json: {
          note: reason,
          payroll_run_id: payrollRunId || null,
          payroll_item_id: payrollItemId || null,
          payslip_id: payslipId || null,
        },
      };
      const created = await payrollApi.createAdjustment(payload);
      return payrollApi.submitAdjustment(created.data.payroll_adjustment.id);
    },
    onSuccess: async () => {
      toast.success("Payroll adjustment request submitted for approval.");
      reset();
      onOpenChange(false);
      await onSubmitted?.();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Payroll adjustment request could not be submitted.")),
  });

  const canSubmit = Boolean(effectiveEmployeeId && reason.trim() && (direction === "NEUTRAL" || Number(amount) !== 0));

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) reset(); onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request payroll adjustment</DialogTitle>
          <DialogDescription>Submit a payroll adjustment for operation-owner and final approval. Department, position, and level are derived by HRM.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {canSelectEmployee ? (
            <Label className="grid gap-1 text-sm">Employee<EmployeeCombobox value={employeeId} onChange={(value) => setEmployeeId(value ?? "")} /></Label>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm md:col-span-2">
              {currentEmployeeId ? "Requesting for your linked employee profile." : "Your employee profile is not linked to this login. Please contact HR."}
            </div>
          )}
          <Label className="grid gap-1 text-sm">Adjustment type
            <Select value={adjustmentType} onValueChange={setAdjustmentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{adjustmentTypes.map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-sm">Direction
            <Select value={direction} onValueChange={(value) => setDirection(value as PayrollAdjustmentPayload["adjustment_direction"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADD">Add</SelectItem>
                <SelectItem value="DEDUCT">Deduct</SelectItem>
                <SelectItem value="NEUTRAL">Non-monetary</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-sm">Amount<Input type="number" step="0.01" value={amount} disabled={direction === "NEUTRAL"} onChange={(event) => setAmount(event.target.value)} /></Label>
          <Label className="grid gap-1 text-sm">Currency<Input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></Label>
          <Label className="grid gap-1 text-sm">Payroll month<Input type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} /></Label>
          {canSelectEmployee ? (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Advanced payroll references</p>
                  <p className="text-xs text-muted-foreground">Use only when HR/payroll already knows the exact run, item, or payslip. Backend ownership validation still applies.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAdvancedReferences((value) => !value)}>
                  {showAdvancedReferences ? "Hide references" : "Add references"}
                </Button>
              </div>
              {showAdvancedReferences ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <Label className="grid gap-1 text-sm">Payroll run reference, optional<Input value={payrollRunId} onChange={(event) => setPayrollRunId(event.target.value)} /></Label>
                  <Label className="grid gap-1 text-sm">Payroll item reference, optional<Input value={payrollItemId} onChange={(event) => setPayrollItemId(event.target.value)} /></Label>
                  <Label className="grid gap-1 text-sm">Payslip reference, optional<Input value={payslipId} onChange={(event) => setPayslipId(event.target.value)} /></Label>
                </div>
              ) : null}
            </div>
          ) : null}
          <Label className="grid gap-1 text-sm md:col-span-2">Reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} /></Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>Submit for approval</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
