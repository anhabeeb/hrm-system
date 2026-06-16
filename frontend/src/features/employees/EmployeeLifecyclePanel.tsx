import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { FormError } from "@/components/feedback/FormError";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-errors";
import { displayDate } from "./employee-format";
import { EmployeeStatusBadge } from "./EmployeeStatusBadge";
import { employeesApi } from "./employees.api";
import type { Employee, EmployeeStatusChangePayload, EmployeeStatusHistoryRow, EmploymentStatus } from "./employees.types";

const lifecycleStatuses: Array<{ value: EmploymentStatus; label: string }> = [
  { value: "probation", label: "Probation" },
  { value: "confirmed", label: "Confirm employee" },
  { value: "active", label: "Active / return to active" },
  { value: "suspended", label: "Suspend employee" },
  { value: "resigned", label: "Record resignation" },
  { value: "terminated", label: "Terminate employee" },
  { value: "retired", label: "Retire employee" },
  { value: "inactive", label: "Mark inactive" },
  { value: "rehired", label: "Rehire employee" },
];

const accessDefaults = (status: EmploymentStatus) =>
  ["suspended", "resigned", "terminated", "retired", "inactive"].includes(status)
    ? { disable_user_access: true, revoke_active_sessions: true }
    : { disable_user_access: false, revoke_active_sessions: false };

const today = () => new Date().toISOString().slice(0, 10);

const statusLabel = (status?: string | null) =>
  status ? status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not recorded";

export const EmployeeLifecyclePanel = ({
  employee,
  canManageStatus,
}: {
  employee: Employee;
  canManageStatus: boolean;
}) => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeStatusChangePayload>({
    new_status: "suspended",
    effective_from: today(),
    reason: "",
    notes: "",
    disable_user_access: true,
    revoke_active_sessions: true,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ["employee-status-history", employee.id],
    queryFn: () => employeesApi.statusHistory(employee.id),
    enabled: Boolean(employee.id),
  });

  const mutation = useMutation({
    mutationFn: (payload: EmployeeStatusChangePayload) => employeesApi.changeStatus(employee.id, payload),
    onSuccess: async (result) => {
      setSuccessMessage("Employee status updated successfully.");
      setDialogOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee-status-history", employee.id] }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
      ]);
    },
  });

  useEffect(() => {
    if (!dialogOpen) {
      setLocalError(null);
      const defaults = accessDefaults("suspended");
      setForm({
        new_status: "suspended",
        effective_from: today(),
        reason: "",
        notes: "",
        ...defaults,
      });
    }
  }, [dialogOpen]);

  const openWithStatus = (status: EmploymentStatus) => {
    setForm({
      new_status: status,
      effective_from: today(),
      reason: "",
      notes: "",
      ...accessDefaults(status),
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.effective_from) {
      setLocalError("Effective date is required.");
      return;
    }
    if (form.effective_from > today()) {
      setLocalError("Future-dated employee status changes require scheduled activation and are not available yet.");
      return;
    }
    if (form.reason.trim().length < 3) {
      setLocalError("A reason is required for this action.");
      return;
    }
    setLocalError(null);
    mutation.mutate({
      ...form,
      reason: form.reason.trim(),
      notes: form.notes?.trim() || null,
    });
  };

  const currentHistory = historyQuery.data?.data?.history?.[0];

  return (
    <div className="space-y-4">
      {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">Current status</div>
            <div className="flex items-center gap-2">
              <EmployeeStatusBadge status={employee.employment_status} />
              <span className="text-sm text-muted-foreground">
                Effective since {displayDate(currentHistory?.effective_from ?? employee.joined_at)}
              </span>
            </div>
            {currentHistory?.reason ? <p className="text-sm text-muted-foreground">Reason: {currentHistory.reason}</p> : null}
          </div>
          {canManageStatus ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openWithStatus("confirmed")}>Confirm employee</Button>
              <Button variant="outline" size="sm" onClick={() => openWithStatus("suspended")}>Suspend</Button>
              <Button variant="outline" size="sm" onClick={() => openWithStatus("resigned")}>Resignation</Button>
              <Button variant="destructive" size="sm" onClick={() => openWithStatus("terminated")}>Terminate</Button>
              <Button variant="outline" size="sm" onClick={() => openWithStatus("rehired")}>Rehire</Button>
            </div>
          ) : null}
        </div>
      </div>

      <DataTable<EmployeeStatusHistoryRow>
        rows={historyQuery.data?.data?.history ?? []}
        loading={historyQuery.isLoading}
        getRowId={(row) => row.id}
        emptyTitle="No status history yet"
        emptyDescription="Lifecycle changes will appear here after HR records them."
        compact
        columns={[
          { key: "effective_from", header: "Effective from", cell: (row) => displayDate(row.effective_from ?? row.changed_at) },
          { key: "effective_to", header: "Effective to", cell: (row) => row.effective_to ? displayDate(row.effective_to) : "Current / open" },
          { key: "old_status", header: "Old status", cell: (row) => statusLabel(row.old_status) },
          { key: "new_status", header: "New status", cell: (row) => <EmployeeStatusBadge status={row.new_status} /> },
          { key: "reason", header: "Reason", cell: (row) => row.reason ?? "Not recorded" },
          { key: "created_by_name", header: "Created by", cell: (row) => row.created_by_name ?? row.changed_by_name ?? row.created_by ?? row.changed_by ?? "System" },
          { key: "created_at", header: "Created", cell: (row) => displayDate(row.created_at ?? row.changed_at) },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Change employee status</DialogTitle>
            <DialogDescription>
              Record an immediate lifecycle change. Future scheduling will be added later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.new_status}
                onValueChange={(value) => setForm((current) => ({ ...current, new_status: value as EmploymentStatus, ...accessDefaults(value as EmploymentStatus) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lifecycleStatuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <AppDatePicker label="Effective from" maxDate={today()} value={form.effective_from} onChange={(value) => setForm((current) => ({ ...current, effective_from: value ?? "" }))} />
              <p className="text-xs text-muted-foreground">Status changes are applied immediately. Future scheduling will be added later.</p>
            </div>
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason for the status change" />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional HR notes" />
            </div>
            {["suspended", "resigned", "terminated", "retired", "inactive"].includes(form.new_status) ? (
              <InlineAlert title="Payroll and access warning" variant="warning">
                This status may exclude the employee from future attendance expectations or payroll after the effective date. Finalized payroll periods cannot be changed.
              </InlineAlert>
            ) : null}
            <div className="space-y-3 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={Boolean(form.disable_user_access)} onCheckedChange={(checked) => setForm((current) => ({ ...current, disable_user_access: Boolean(checked) }))} />
                Disable linked user access when this status is applied
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={Boolean(form.revoke_active_sessions)} onCheckedChange={(checked) => setForm((current) => ({ ...current, revoke_active_sessions: Boolean(checked) }))} />
                Revoke active sessions when this status is applied
              </label>
            </div>
            {localError ? <FormError message={localError} /> : null}
            {mutation.error ? <FormError message={mutation.error instanceof ApiError ? mutation.error.message : "Employee status could not be updated."} /> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <LoadingButton loading={mutation.isPending} onClick={submit}>Save status change</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
