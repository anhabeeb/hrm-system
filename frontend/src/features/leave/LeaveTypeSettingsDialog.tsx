import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveType, LeaveTypeUpdatePayload } from "./leave.types";

const checked = (value: unknown) => value === true || value === 1;
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);

export const LeaveTypeSettingsDialog = ({
  leaveType,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  leaveType: LeaveType | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, payload: LeaveTypeUpdatePayload) => void;
}) => {
  const [values, setValues] = useState({
    requires_balance: false,
    allow_negative_balance: false,
    max_negative_balance: "",
    accrual_enabled: false,
    accrual_frequency: "monthly",
    annual_entitlement_days: "",
    accrual_amount: "",
    prorate_on_joining: false,
    prorate_on_termination: false,
    carry_forward_enabled: false,
    carry_forward_limit_days: "",
    carry_forward_expiry_month: "",
    carry_forward_expiry_day: "",
    half_day_enabled: false,
    sort_order: "",
    reason: "",
  });
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!leaveType) return;
    setValues({
      requires_balance: checked(leaveType.requires_balance),
      allow_negative_balance: checked(leaveType.allow_negative_balance),
      max_negative_balance: leaveType.max_negative_balance == null ? "" : String(leaveType.max_negative_balance),
      accrual_enabled: checked(leaveType.accrual_enabled),
      accrual_frequency: leaveType.accrual_frequency ?? "monthly",
      annual_entitlement_days: leaveType.annual_entitlement_days == null ? "" : String(leaveType.annual_entitlement_days),
      accrual_amount: leaveType.accrual_amount == null ? "" : String(leaveType.accrual_amount),
      prorate_on_joining: checked(leaveType.prorate_on_joining),
      prorate_on_termination: checked(leaveType.prorate_on_termination),
      carry_forward_enabled: checked(leaveType.carry_forward_enabled),
      carry_forward_limit_days: leaveType.carry_forward_limit_days == null ? "" : String(leaveType.carry_forward_limit_days),
      carry_forward_expiry_month: leaveType.carry_forward_expiry_month == null ? "" : String(leaveType.carry_forward_expiry_month),
      carry_forward_expiry_day: leaveType.carry_forward_expiry_day == null ? "" : String(leaveType.carry_forward_expiry_day),
      half_day_enabled: checked(leaveType.half_day_enabled),
      sort_order: leaveType.sort_order == null ? "" : String(leaveType.sort_order),
      reason: "",
    });
    setLocalError(null);
  }, [leaveType]);

  const set = (key: keyof typeof values, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const submit = () => {
    if (!leaveType) return;
    if (values.reason.trim().length < 3) {
      setLocalError("A reason is required for this action.");
      return;
    }
    const numericFields = [
      values.max_negative_balance,
      values.annual_entitlement_days,
      values.accrual_amount,
      values.carry_forward_limit_days,
      values.carry_forward_expiry_month,
      values.carry_forward_expiry_day,
      values.sort_order,
    ].filter((value) => value.trim() !== "");
    if (numericFields.some((value) => !Number.isFinite(Number(value)))) {
      setLocalError("Please enter valid numeric values.");
      return;
    }
    setLocalError(null);
    onSubmit(leaveType.id, {
      requires_balance: values.requires_balance,
      allow_negative_balance: values.allow_negative_balance,
      max_negative_balance: numberOrNull(values.max_negative_balance),
      accrual_enabled: values.accrual_enabled,
      accrual_frequency: values.accrual_frequency,
      annual_entitlement_days: numberOrNull(values.annual_entitlement_days),
      accrual_amount: numberOrNull(values.accrual_amount),
      prorate_on_joining: values.prorate_on_joining,
      prorate_on_termination: values.prorate_on_termination,
      carry_forward_enabled: values.carry_forward_enabled,
      carry_forward_limit_days: numberOrNull(values.carry_forward_limit_days),
      carry_forward_expiry_month: numberOrNull(values.carry_forward_expiry_month),
      carry_forward_expiry_day: numberOrNull(values.carry_forward_expiry_day),
      half_day_enabled: values.half_day_enabled,
      sort_order: values.sort_order.trim() === "" ? undefined : Number(values.sort_order),
      reason: values.reason,
    });
  };

  return (
    <Dialog open={Boolean(leaveType)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit leave type balance settings</DialogTitle>
          <DialogDescription>Update accrual, carry-forward, negative-balance, and request balance rules.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Label className="flex items-center gap-2"><Checkbox checked={values.requires_balance} onCheckedChange={(value) => set("requires_balance", Boolean(value))} /> Requires balance</Label>
          <Label className="flex items-center gap-2"><Checkbox checked={values.allow_negative_balance} onCheckedChange={(value) => set("allow_negative_balance", Boolean(value))} /> Allow negative balance</Label>
          <Label>Max negative balance<Input value={values.max_negative_balance} onChange={(event) => set("max_negative_balance", event.target.value)} /></Label>
          <Label className="flex items-center gap-2"><Checkbox checked={values.accrual_enabled} onCheckedChange={(value) => set("accrual_enabled", Boolean(value))} /> Accrual enabled</Label>
          <Label>Accrual frequency<Select value={values.accrual_frequency} onValueChange={(value) => set("accrual_frequency", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["none", "monthly", "yearly", "daily", "custom"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Label>
          <Label>Annual entitlement<Input value={values.annual_entitlement_days} onChange={(event) => set("annual_entitlement_days", event.target.value)} /></Label>
          <Label>Accrual amount<Input value={values.accrual_amount} onChange={(event) => set("accrual_amount", event.target.value)} /></Label>
          <Label className="flex items-center gap-2"><Checkbox checked={values.prorate_on_joining} onCheckedChange={(value) => set("prorate_on_joining", Boolean(value))} /> Prorate on joining</Label>
          <Label className="flex items-center gap-2"><Checkbox checked={values.prorate_on_termination} onCheckedChange={(value) => set("prorate_on_termination", Boolean(value))} /> Prorate on termination</Label>
          <Label className="flex items-center gap-2"><Checkbox checked={values.carry_forward_enabled} onCheckedChange={(value) => set("carry_forward_enabled", Boolean(value))} /> Carry-forward enabled</Label>
          <Label>Carry-forward limit<Input value={values.carry_forward_limit_days} onChange={(event) => set("carry_forward_limit_days", event.target.value)} /></Label>
          <Label>Carry-forward expiry month<Input value={values.carry_forward_expiry_month} onChange={(event) => set("carry_forward_expiry_month", event.target.value)} /></Label>
          <Label>Carry-forward expiry day<Input value={values.carry_forward_expiry_day} onChange={(event) => set("carry_forward_expiry_day", event.target.value)} /></Label>
          <Label className="flex items-center gap-2"><Checkbox checked={values.half_day_enabled} onCheckedChange={(value) => set("half_day_enabled", Boolean(value))} /> Half-day enabled</Label>
          <Label>Sort order<Input value={values.sort_order} onChange={(event) => set("sort_order", event.target.value)} /></Label>
          <Label className="md:col-span-2">Reason<Textarea value={values.reason} onChange={(event) => set("reason", event.target.value)} /></Label>
        </div>
        {localError ? <FormError message={localError} /> : null}
        {error ? <FormError message={error} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>Save settings</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
