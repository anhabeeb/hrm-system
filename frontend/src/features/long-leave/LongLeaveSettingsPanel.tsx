import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { LongLeaveSettings, LongLeaveSettingsPayload } from "./long-leave.types";

const boolValue = (value: LongLeaveSettings[keyof LongLeaveSettings] | undefined) => value === true || value === 1;

export const LongLeaveSettingsPanel = ({
  settings,
  canManage,
  loading,
  error,
  onSave,
}: {
  settings?: LongLeaveSettings;
  canManage: boolean;
  loading?: boolean;
  error?: string | null;
  onSave: (payload: LongLeaveSettingsPayload) => void;
}) => {
  const [draft, setDraft] = useState<LongLeaveSettingsPayload>({ reason: "" });
  useEffect(() => {
    if (settings) setDraft({ ...settings, reason: "" });
  }, [settings]);
  const update = (key: keyof LongLeaveSettingsPayload, value: string | number | boolean | null) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const warning = !boolValue(draft.applies_to_foreigners) && !boolValue(draft.applies_to_locals)
    ? "Long leave must apply to at least one employee group."
    : boolValue(draft.applies_to_locals)
      ? "Local employee long leave is enabled. Use this only when company policy explicitly allows it."
      : null;

  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Long Leave Settings</h2>
          <p className="text-sm text-muted-foreground">Backend-enforced rules for eligibility, salary treatment, and payroll review.</p>
        </div>
        {!canManage ? <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">Read only</span> : null}
      </div>
      {warning ? <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warning}</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Enabled<Switch disabled={!canManage} checked={boolValue(draft.is_enabled)} onCheckedChange={(checked) => update("is_enabled", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Foreign employees<Switch disabled={!canManage} checked={boolValue(draft.applies_to_foreigners)} onCheckedChange={(checked) => update("applies_to_foreigners", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Local override<Switch disabled={!canManage} checked={boolValue(draft.applies_to_locals)} onCheckedChange={(checked) => update("applies_to_locals", checked)} /></Label>
        <Label className="space-y-1 text-sm">Minimum days<Input disabled={!canManage} type="number" value={draft.trigger_days ?? 30} onChange={(event) => update("trigger_days", Number(event.target.value))} /></Label>
        <Label className="space-y-1 text-sm">Maximum days<Input disabled={!canManage} type="number" value={draft.max_continuous_days ?? ""} onChange={(event) => update("max_continuous_days", event.target.value ? Number(event.target.value) : null)} placeholder="No cap" /></Label>
        <Label className="space-y-1 text-sm">Partial pay ratio<Input disabled={!canManage} type="number" min="0" max="1" step="0.05" value={draft.partial_pay_ratio ?? 0.5} onChange={(event) => update("partial_pay_ratio", Number(event.target.value))} /></Label>
        <Label className="space-y-1 text-sm">Default salary treatment<Select disabled={!canManage} value={draft.default_salary_treatment ?? "unpaid"} onValueChange={(value) => update("default_salary_treatment", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unpaid">Unpaid</SelectItem><SelectItem value="paid">Paid</SelectItem><SelectItem value="partially_paid">Partially paid</SelectItem><SelectItem value="custom">Custom review</SelectItem></SelectContent></Select></Label>
        <Label className="space-y-1 text-sm">Default deduction method<Select disabled={!canManage} value={draft.default_deduction_method ?? "calendar_days"} onValueChange={(value) => update("default_deduction_method", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="calendar_days">Calendar days</SelectItem><SelectItem value="working_days">Working days</SelectItem><SelectItem value="scheduled_roster_days">Scheduled roster days</SelectItem><SelectItem value="attendance_days">Attendance days</SelectItem></SelectContent></Select></Label>
        <Label className="space-y-1 text-sm">Salary rule<Select disabled={!canManage} value={draft.salary_rule ?? "pay_only_worked_days"} onValueChange={(value) => update("salary_rule", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pay_only_worked_days">Pay only worked days</SelectItem><SelectItem value="monthly_deduction">Monthly deduction</SelectItem></SelectContent></Select></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Pay only worked days<Switch disabled={!canManage} checked={boolValue(draft.pay_only_worked_days)} onCheckedChange={(checked) => update("pay_only_worked_days", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Count holidays inside leave<Switch disabled={!canManage} checked={boolValue(draft.count_holidays_inside_leave)} onCheckedChange={(checked) => update("count_holidays_inside_leave", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Pay holidays<Switch disabled={!canManage} checked={boolValue(draft.pay_holidays_during_long_leave)} onCheckedChange={(checked) => update("pay_holidays_during_long_leave", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Pay weekly off days<Switch disabled={!canManage} checked={boolValue(draft.pay_weekly_off_days_during_long_leave)} onCheckedChange={(checked) => update("pay_weekly_off_days_during_long_leave", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Require salary preview<Switch disabled={!canManage} checked={boolValue(draft.require_salary_impact_preview)} onCheckedChange={(checked) => update("require_salary_impact_preview", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Deduct full salary if zero worked<Switch disabled={!canManage} checked={boolValue(draft.deduct_full_salary_if_zero_worked_days)} onCheckedChange={(checked) => update("deduct_full_salary_if_zero_worked_days", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Allow HR override<Switch disabled={!canManage} checked={boolValue(draft.allow_hr_override)} onCheckedChange={(checked) => update("allow_hr_override", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Require approval<Switch disabled={!canManage} checked={boolValue(draft.approval_required ?? 1)} onCheckedChange={(checked) => update("approval_required", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Require payroll review<Switch disabled={!canManage} checked={boolValue(draft.require_payroll_review ?? 1)} onCheckedChange={(checked) => update("require_payroll_review", checked)} /></Label>
        <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">Return confirmation<Switch disabled={!canManage} checked={boolValue(draft.require_return_to_work_confirmation ?? 1)} onCheckedChange={(checked) => update("require_return_to_work_confirmation", checked)} /></Label>
      </div>
      {canManage ? (
        <div className="mt-4 grid gap-3">
          <Label className="space-y-1 text-sm">Reason<Textarea value={draft.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Reason for changing long leave settings" /></Label>
          <FormError message={error ?? undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => settings && setDraft({ ...settings, reason: "" })}>Reset</Button>
            <LoadingButton loading={loading} onClick={() => onSave(draft)}>Save settings</LoadingButton>
          </div>
        </div>
      ) : null}
    </section>
  );
};
