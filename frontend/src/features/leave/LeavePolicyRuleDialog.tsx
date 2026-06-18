import { useEffect, useState } from "react";

import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveTypePolicyRule, LeaveTypePolicyRuleUpdatePayload } from "./leave.types";

const bool = (value: unknown) => value === true || value === 1;

export const LeavePolicyRuleDialog = ({
  rule,
  loading,
  error,
  onOpenChange,
  onSubmit,
}: {
  rule: LeaveTypePolicyRule | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, payload: LeaveTypePolicyRuleUpdatePayload) => void;
}) => {
  const [form, setForm] = useState<LeaveTypePolicyRuleUpdatePayload>({
    paid_status: "paid",
    paid_percentage: 100,
    payroll_impact_enabled: true,
    document_requirement: "never",
    document_required_mode: "never",
    document_after_days: null,
    document_required_after_consecutive_days: null,
    document_after_used_days: null,
    document_required_after_used_days: null,
    allow_no_document_until_used_days: null,
    require_document_for_backdated_request: false,
    require_document_for_extension: false,
    approval_required: true,
    approval_workflow_key: "leave_request",
    salary_deduction_enabled: false,
    deduction_mode: "none",
    deduction_component: "leave_policy",
    deduction_component_keys_json: null,
    deduction_pay_component_keys: null,
    deduction_daily_rate_method: "payroll_working_days",
    deduction_custom_divisor: null,
    payroll_source_label: "leave_policy",
    annual_entitlement_days: null,
    allow_half_day: false,
    allow_carry_forward: false,
    carry_forward_limit_days: null,
    reset_period: "calendar_year",
    count_weekends: false,
    count_public_holidays: false,
    notes: null,
    is_enabled: true,
    reason: "",
  });

  useEffect(() => {
    if (!rule) return;
    setForm({
      paid_status: rule.paid_status as LeaveTypePolicyRuleUpdatePayload["paid_status"],
      paid_percentage: Number(rule.paid_percentage ?? 100),
      payroll_impact_enabled: bool(rule.payroll_impact_enabled ?? true),
      document_requirement: rule.document_required_mode ?? rule.document_requirement ?? "never",
      document_required_mode: rule.document_required_mode ?? rule.document_requirement ?? "never",
      document_after_days: rule.document_required_after_consecutive_days ?? rule.document_after_days ?? null,
      document_required_after_consecutive_days: rule.document_required_after_consecutive_days ?? rule.document_after_days ?? null,
      document_after_used_days: rule.document_required_after_used_days ?? rule.document_after_used_days ?? null,
      document_required_after_used_days: rule.document_required_after_used_days ?? rule.document_after_used_days ?? null,
      allow_no_document_until_used_days: rule.allow_no_document_until_used_days ?? null,
      require_document_for_backdated_request: bool(rule.require_document_for_backdated_request),
      require_document_for_extension: bool(rule.require_document_for_extension),
      approval_required: bool(rule.approval_required),
      approval_workflow_key: rule.approval_workflow_key ?? "leave_request",
      salary_deduction_enabled: bool(rule.salary_deduction_enabled),
      deduction_mode: rule.deduction_mode ?? "none",
      deduction_component: rule.deduction_component ?? "leave_policy",
      deduction_component_keys_json: rule.deduction_component_keys_json ?? null,
      deduction_pay_component_keys: rule.deduction_pay_component_keys ?? rule.deduction_component_keys_json ?? null,
      deduction_daily_rate_method: rule.deduction_daily_rate_method ?? "payroll_working_days",
      deduction_custom_divisor: rule.deduction_custom_divisor ?? null,
      payroll_source_label: rule.payroll_source_label ?? "leave_policy",
      annual_entitlement_days: rule.annual_entitlement_days ?? null,
      allow_half_day: bool(rule.allow_half_day),
      allow_carry_forward: bool(rule.allow_carry_forward),
      carry_forward_limit_days: rule.carry_forward_limit_days ?? null,
      reset_period: rule.reset_period ?? "calendar_year",
      count_weekends: bool(rule.count_weekends),
      count_public_holidays: bool(rule.count_public_holidays),
      notes: rule.notes ?? null,
      is_enabled: bool(rule.is_enabled),
      reason: "",
    });
  }, [rule]);

  const setField = <K extends keyof LeaveTypePolicyRuleUpdatePayload>(key: K, value: LeaveTypePolicyRuleUpdatePayload[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const documentSummary = (() => {
    const consecutive = form.document_after_days ?? 0;
    const used = form.document_after_used_days ?? 0;
    if (form.document_required_mode === "always") return "Documents are required for every request.";
    if (form.document_required_mode === "after_consecutive_days") return `Documents are required only when the request exceeds ${consecutive} consecutive day(s).`;
    if (form.document_required_mode === "after_used_days") return `Documents are required only when yearly used days exceed ${used} day(s).`;
    if (form.document_required_mode === "after_consecutive_or_used_days") return `Documents are required when the request exceeds ${consecutive} consecutive day(s) or yearly used days exceed ${used} day(s).`;
    return "Documents are not required by this rule.";
  })();
  const showComponentKeys = ["selected_allowance", "selected_pay_components", "allowance_first_then_basic"].includes(String(form.deduction_mode));

  return (
    <Dialog open={Boolean(rule)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit leave policy rule</DialogTitle>
          <DialogDescription>{rule?.leave_type_name ?? "Leave type"} policy controls documents, approval, and payroll deduction behavior.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">General</div>
          <Label className="space-y-1.5">Paid status
            <Select value={form.paid_status} onValueChange={(value) => setField("paid_status", value as LeaveTypePolicyRuleUpdatePayload["paid_status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial_paid">Partially paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>Paid percentage<Input type="number" min={0} max={100} value={form.paid_percentage ?? 0} onChange={(event) => setField("paid_percentage", Number(event.target.value))} /></Label>
          <Label>Annual entitlement days<Input type="number" min={0} value={form.annual_entitlement_days ?? ""} onChange={(event) => setField("annual_entitlement_days", event.target.value === "" ? null : Number(event.target.value))} /></Label>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="text-sm font-medium">Allow half-day</span><Switch checked={Boolean(form.allow_half_day)} onCheckedChange={(value) => setField("allow_half_day", value)} /></div>
          <div className="md:col-span-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document requirement rules</div>
          <Label className="space-y-1.5">Document rule
            <Select value={form.document_required_mode} onValueChange={(value) => {
              setField("document_required_mode", value);
              setField("document_requirement", value);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="always">Always</SelectItem>
                <SelectItem value="after_consecutive_days">After consecutive days</SelectItem>
                <SelectItem value="after_used_days">After used days</SelectItem>
                <SelectItem value="after_consecutive_or_used_days">After consecutive or used days</SelectItem>
                <SelectItem value="custom">Custom/manual review</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>Consecutive day threshold<Input type="number" min={0} value={form.document_after_days ?? ""} onChange={(event) => {
            const value = event.target.value === "" ? null : Number(event.target.value);
            setField("document_after_days", value);
            setField("document_required_after_consecutive_days", value);
          }} /></Label>
          <Label>Used day threshold<Input type="number" min={0} value={form.document_after_used_days ?? ""} onChange={(event) => {
            const value = event.target.value === "" ? null : Number(event.target.value);
            setField("document_after_used_days", value);
            setField("document_required_after_used_days", value);
          }} /></Label>
          <Label>No-document allowance days<Input type="number" min={0} value={form.allow_no_document_until_used_days ?? ""} onChange={(event) => setField("allow_no_document_until_used_days", event.target.value === "" ? null : Number(event.target.value))} /></Label>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Require for backdated request</span><Switch checked={Boolean(form.require_document_for_backdated_request)} onCheckedChange={(value) => setField("require_document_for_backdated_request", value)} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Require for leave extension</span><Switch checked={Boolean(form.require_document_for_extension)} onCheckedChange={(value) => setField("require_document_for_extension", value)} /></div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground md:col-span-2" data-setup-target="leave-document-rules">
            <p className="font-medium text-foreground">Document rule summary</p>
            <p>{documentSummary}</p>
            <p className="mt-2">FRL example: documents are required only if the request exceeds 2 consecutive days. Sick Leave example: first 15 used sick days need no document if each request is 2 days or less.</p>
          </div>
          <div className="md:col-span-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payroll / deduction rules</div>
          <Label className="space-y-1.5" data-setup-target="leave-deduction-rules">Deduction mode
            <Select value={form.deduction_mode} onValueChange={(value) => setField("deduction_mode", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No salary deduction</SelectItem>
                <SelectItem value="basic_salary">Basic salary</SelectItem>
                <SelectItem value="selected_allowance">Selected allowance</SelectItem>
                <SelectItem value="selected_pay_components">Selected pay components</SelectItem>
                <SelectItem value="allowance_first_then_basic">Allowance first, then basic</SelectItem>
                <SelectItem value="custom">Custom/manual</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>Payroll source label<Input value={form.payroll_source_label ?? ""} onChange={(event) => setField("payroll_source_label", event.target.value)} /></Label>
          <Label className="space-y-1.5">Daily rate method
            <Select value={form.deduction_daily_rate_method ?? "payroll_working_days"} onValueChange={(value) => setField("deduction_daily_rate_method", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payroll_working_days">Payroll working days</SelectItem>
                <SelectItem value="calendar_days">Calendar days</SelectItem>
                <SelectItem value="fixed_30_days">Fixed 30 days</SelectItem>
                <SelectItem value="custom_divisor">Custom divisor</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>Custom divisor<Input type="number" min={1} value={form.deduction_custom_divisor ?? ""} onChange={(event) => setField("deduction_custom_divisor", event.target.value === "" ? null : Number(event.target.value))} /></Label>
          <Label>Primary pay component key<Input value={form.deduction_component ?? ""} onChange={(event) => setField("deduction_component", event.target.value)} placeholder="attendance_allowance" /></Label>
          {showComponentKeys ? (
            <Label className="md:col-span-2">Selected pay component keys
              <Textarea
                value={form.deduction_pay_component_keys ?? form.deduction_component_keys_json ?? ""}
                onChange={(event) => {
                  setField("deduction_component_keys_json", event.target.value || null);
                  setField("deduction_pay_component_keys", event.target.value || null);
                }}
                placeholder={'["attendance_allowance", "transport_allowance"]'}
              />
              <span className="text-xs font-normal text-muted-foreground">Use component code, name, id, or definition id. These are matched during payroll calculation.</span>
            </Label>
          ) : null}
          <div className="md:col-span-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approval rules</div>
          <Label>Approval workflow key<Input value={form.approval_workflow_key ?? ""} onChange={(event) => setField("approval_workflow_key", event.target.value)} /></Label>
          <div className="space-y-3 rounded-md border p-3 md:col-span-2">
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Approval required</span><Switch checked={Boolean(form.approval_required)} onCheckedChange={(value) => setField("approval_required", value)} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Salary deduction enabled</span><Switch checked={Boolean(form.salary_deduction_enabled)} onCheckedChange={(value) => setField("salary_deduction_enabled", value)} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Payroll impact enabled</span><Switch checked={Boolean(form.payroll_impact_enabled)} onCheckedChange={(value) => setField("payroll_impact_enabled", value)} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Rule enabled</span><Switch checked={Boolean(form.is_enabled)} onCheckedChange={(value) => setField("is_enabled", value)} /></div>
          </div>
          <div className="md:col-span-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Carry forward / reset</div>
          <Label className="space-y-1.5">Reset period
            <Select value={form.reset_period ?? "calendar_year"} onValueChange={(value) => setField("reset_period", value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar_year">Calendar year</SelectItem>
                <SelectItem value="company_leave_year">Company leave year</SelectItem>
                <SelectItem value="employee_anniversary">Employee anniversary</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>Carry-forward limit<Input type="number" min={0} value={form.carry_forward_limit_days ?? ""} onChange={(event) => setField("carry_forward_limit_days", event.target.value === "" ? null : Number(event.target.value))} /></Label>
          <div className="space-y-2 rounded-md border p-3 md:col-span-2">
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Carry forward allowed</span><Switch checked={Boolean(form.allow_carry_forward)} onCheckedChange={(value) => setField("allow_carry_forward", value)} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Count weekends</span><Switch checked={Boolean(form.count_weekends)} onCheckedChange={(value) => setField("count_weekends", value)} /></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Count public holidays</span><Switch checked={Boolean(form.count_public_holidays)} onCheckedChange={(value) => setField("count_public_holidays", value)} /></div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-2">
            <p className="font-medium">Summary preview</p>
            <p className="text-muted-foreground">{form.paid_status === "unpaid" ? "Unpaid leave." : "Paid leave."} {form.salary_deduction_enabled ? `Salary deduction uses ${form.deduction_mode}.` : "No salary deduction."} {documentSummary}</p>
          </div>
          <Label className="md:col-span-2">Policy notes<Textarea value={form.notes ?? ""} onChange={(event) => setField("notes", event.target.value || null)} /></Label>
          <Label className="md:col-span-2">Reason<Textarea value={form.reason} onChange={(event) => setField("reason", event.target.value)} /></Label>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} disabled={!rule || form.reason.trim().length < 3} onClick={() => rule && onSubmit(rule.id, form)}>Save policy rule</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
