import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { StatusBadge } from "@/components/data/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-errors";
import { displayMoney } from "@/features/employees/employee-format";
import { compensationDefinitionsApi } from "@/features/employees/employees.api";
import type { CompensationCalculationType, CompensationComponentDefinition, CompensationComponentDefinitionPayload, CompensationComponentType } from "@/features/employees/employees.types";

const typeLabels: Record<CompensationComponentType, string> = {
  allowance: "Allowance",
  benefit: "Benefit",
  deduction: "Deduction",
};

const calculationLabels: Record<CompensationCalculationType, string> = {
  fixed_amount: "Fixed amount",
  percentage_of_basic_salary: "Percentage of basic salary",
  non_cash_benefit: "Non-cash benefit",
};

const defaultForm = {
  component_type: "allowance" as CompensationComponentType,
  component_code: "",
  component_name: "",
  default_amount_major: "",
  currency: "MVR",
  calculation_type: "fixed_amount" as CompensationCalculationType,
  affects_gross_pay: true,
  affects_net_pay: true,
  description: "",
  reason: "",
};

const majorToMinor = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
};

const minorToMajor = (value?: number | null) => value ? (value / 100).toFixed(2).replace(/\.00$/, "") : "";
const boolValue = (value?: number | boolean | null) => value === true || value === 1;

export const CompensationDefinitionsPanel = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompensationComponentDefinition | null>(null);
  const [statusTarget, setStatusTarget] = useState<CompensationComponentDefinition | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["compensation-component-definitions", "settings"],
    queryFn: () => compensationDefinitionsApi.list({ page: 1, page_size: 100 }),
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["compensation-component-definitions"] });

  const saveMutation = useMutation({
    mutationFn: (payload: CompensationComponentDefinitionPayload) =>
      editing ? compensationDefinitionsApi.update(editing.id, payload) : compensationDefinitionsApi.create(payload),
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      await refresh();
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason: string }) =>
      status === "active" ? compensationDefinitionsApi.disable(id, reason) : compensationDefinitionsApi.enable(id, reason),
    onSuccess: refresh,
  });

  const apiError = saveMutation.error instanceof ApiError ? saveMutation.error : null;
  const fieldError = (field: string) => fieldErrors[field] ?? apiError?.fieldErrors?.[field];

  const openForm = (definition?: CompensationComponentDefinition) => {
    setEditing(definition ?? null);
    setFieldErrors({});
    saveMutation.reset();
    setForm(definition ? {
      component_type: definition.component_type,
      component_code: definition.component_code,
      component_name: definition.component_name,
      default_amount_major:
        definition.calculation_type === "percentage_of_basic_salary"
          ? String(definition.default_amount ?? "")
          : minorToMajor(definition.default_amount),
      currency: definition.currency ?? "MVR",
      calculation_type: definition.calculation_type,
      affects_gross_pay: boolValue(definition.affects_gross_pay),
      affects_net_pay: boolValue(definition.affects_net_pay),
      description: definition.description ?? "",
      reason: "",
    } : defaultForm);
    setOpen(true);
  };

  const submit = () => {
    const errors: Record<string, string> = {};
    const amount = form.calculation_type === "percentage_of_basic_salary" ? Number(form.default_amount_major) : majorToMinor(form.default_amount_major);
    if (!form.component_code.trim()) errors.component_code = "Code is required.";
    if (!form.component_name.trim()) errors.component_name = "Name is required.";
    if (!Number.isFinite(amount) || amount === null || amount < 0) errors.amount = "Enter a valid default amount or percentage.";
    if (!form.reason.trim()) errors.reason = "Reason is required.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || amount === null || !Number.isFinite(amount)) return;

    saveMutation.mutate({
      component_type: form.component_type,
      component_code: form.component_code.trim().toUpperCase(),
      component_name: form.component_name.trim(),
      default_amount: Math.round(amount),
      amount: Math.round(amount),
      currency: form.currency.trim().toUpperCase(),
      calculation_type: form.calculation_type,
      affects_gross_pay: form.calculation_type === "non_cash_benefit" ? false : form.affects_gross_pay,
      affects_net_pay: form.calculation_type === "non_cash_benefit" ? false : form.affects_net_pay,
      description: form.description.trim() || null,
      reason: form.reason.trim(),
    });
  };

  const toggleStatus = (definition: CompensationComponentDefinition) => setStatusTarget(definition);

  const rows = query.data?.data ?? [];

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Compensation Components</h2>
          <p className="text-sm text-muted-foreground">Reusable allowances, benefits, and deductions for employee compensation assignments.</p>
        </div>
        <Button onClick={() => openForm()}>Add Component</Button>
      </div>
      <DataTable
        compact
        loading={query.isLoading}
        columns={[
          { key: "component_code", header: "Code", cell: (row) => row.component_code },
          { key: "component_name", header: "Name", cell: (row) => row.component_name },
          { key: "component_type", header: "Type", cell: (row) => typeLabels[row.component_type] ?? row.component_type },
          { key: "calculation_type", header: "Calculation", cell: (row) => calculationLabels[row.calculation_type] ?? row.calculation_type },
          { key: "default_amount", header: "Default", cell: (row) => row.calculation_type === "percentage_of_basic_salary" ? `${row.default_amount ?? 0}%` : displayMoney(row.default_amount ?? 0, row.currency ?? "MVR") },
          { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
        ]}
        rows={rows}
        getRowId={(row) => row.id}
        emptyTitle="No compensation component definitions."
        emptyDescription="Add reusable company components so employee assignments can be standardized."
        rowActions={(row) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openForm(row)}>Edit</Button>
            <Button size="sm" variant="outline" onClick={() => toggleStatus(row)} disabled={statusMutation.isPending}>
              {row.status === "active" ? "Disable" : "Enable"}
            </Button>
          </div>
        )}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit compensation component" : "Add compensation component"}</DialogTitle>
            <DialogDescription>Definitions standardize recurring compensation fields used on employee profiles.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="space-y-1">
                <span>Type</span>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={form.component_type} onChange={(event) => setForm((current) => ({ ...current, component_type: event.target.value as CompensationComponentType }))}>
                  {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Label>
              <Label className="space-y-1">
                <span>Calculation</span>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm" value={form.calculation_type} onChange={(event) => setForm((current) => ({ ...current, calculation_type: event.target.value as CompensationCalculationType }))}>
                  {Object.entries(calculationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="space-y-1"><span>Code</span><Input value={form.component_code} onChange={(event) => setForm((current) => ({ ...current, component_code: event.target.value.toUpperCase() }))} />{fieldError("component_code") ? <span className="block text-xs text-red-600">{fieldError("component_code")}</span> : null}</Label>
              <Label className="space-y-1"><span>Name</span><Input value={form.component_name} onChange={(event) => setForm((current) => ({ ...current, component_name: event.target.value }))} />{fieldError("component_name") ? <span className="block text-xs text-red-600">{fieldError("component_name")}</span> : null}</Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="space-y-1"><span>Default amount / percentage</span><Input value={form.default_amount_major} onChange={(event) => setForm((current) => ({ ...current, default_amount_major: event.target.value }))} />{fieldError("amount") ? <span className="block text-xs text-red-600">{fieldError("amount")}</span> : null}</Label>
              <Label className="space-y-1"><span>Currency</span><Input value={form.currency} maxLength={3} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></Label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={form.affects_gross_pay} disabled={form.calculation_type === "non_cash_benefit"} onChange={(event) => setForm((current) => ({ ...current, affects_gross_pay: event.target.checked }))} />Affects gross pay</Label>
              <Label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={form.affects_net_pay} disabled={form.calculation_type === "non_cash_benefit"} onChange={(event) => setForm((current) => ({ ...current, affects_net_pay: event.target.checked }))} />Affects net pay</Label>
            </div>
            <Label className="space-y-1"><span>Description</span><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Label>
            <Label className="space-y-1"><span>Reason</span><Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />{fieldError("reason") ? <span className="block text-xs text-red-600">{fieldError("reason")}</span> : null}</Label>
            <FormError error={apiError} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <LoadingButton loading={saveMutation.isPending} onClick={submit}>Save component</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={Boolean(statusTarget)}
        title={`${statusTarget?.status === "active" ? "Disable" : "Enable"} compensation component`}
        description="A reason is required before changing this compensation component definition status."
        confirmLabel={statusTarget?.status === "active" ? "Disable component" : "Enable component"}
        loading={statusMutation.isPending}
        onOpenChange={(nextOpen) => { if (!nextOpen) setStatusTarget(null); }}
        onSubmit={(reason) => {
          if (!statusTarget) return;
          statusMutation.mutate({ id: statusTarget.id, status: statusTarget.status, reason });
          setStatusTarget(null);
        }}
      />
    </section>
  );
};
