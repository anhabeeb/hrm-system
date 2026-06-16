import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { employeesApi } from "@/features/employees/employees.api";
import type { EmployeeExitPayload } from "./employeeExit.types";

const resignationTypes = [
  "EMPLOYEE_RESIGNATION",
  "RESIGNATION_ON_BEHALF",
  "RESIGNATION_WITH_NOTICE",
  "IMMEDIATE_RESIGNATION",
  "CONTRACT_END_RESIGNATION",
  "MUTUAL_SEPARATION",
  "RESIGNATION_WITHDRAWAL_REQUEST",
  "GENERAL_RESIGNATION_REQUEST",
];

const offboardingTypes = [
  "STANDARD_OFFBOARDING",
  "POST_RESIGNATION_OFFBOARDING",
  "CONTRACT_END_OFFBOARDING",
  "ADMIN_INITIATED_OFFBOARDING",
  "ACCESS_DISABLE_REQUEST",
  "FINAL_SETTLEMENT_CLEARANCE",
  "DOCUMENT_HANDOVER",
  "GENERAL_OFFBOARDING",
];

const label = (value: string) => value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export const EmployeeExitRequestDialog = ({
  open,
  loading,
  error,
  currentEmployeeId,
  canSelectEmployee,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  currentEmployeeId?: string | null;
  canSelectEmployee?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EmployeeExitPayload) => void;
}) => {
  const employeesQuery = useQuery({
    queryKey: ["employee-exit", "employees", canSelectEmployee],
    queryFn: () => employeesApi.list({ page: 1, page_size: 100, employment_status: "active" }),
    enabled: Boolean(open && canSelectEmployee),
  });
  const [form, setForm] = useState<EmployeeExitPayload>({
    employee_id: currentEmployeeId ?? "",
    operation_type: "RESIGNATION",
    request_type: "EMPLOYEE_RESIGNATION",
    reason: "",
    resignation_date: "",
    requested_last_working_date: "",
    final_settlement_required: true,
    access_disable_required: true,
  });

  useEffect(() => {
    if (open) {
      setForm({
        employee_id: currentEmployeeId ?? "",
        operation_type: "RESIGNATION",
        request_type: "EMPLOYEE_RESIGNATION",
        reason: "",
        resignation_date: "",
        requested_last_working_date: "",
        final_settlement_required: true,
        access_disable_required: true,
      });
    }
  }, [currentEmployeeId, open]);

  const requestTypes = useMemo(() => form.operation_type === "OFFBOARDING" ? offboardingTypes : resignationTypes, [form.operation_type]);
  const update = (key: keyof EmployeeExitPayload, value: string | boolean | number | null) =>
    setForm((current) => ({ ...current, [key]: value }));
  const canSubmit = Boolean(form.request_type && form.reason.trim() && (canSelectEmployee ? form.employee_id : currentEmployeeId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create resignation / offboarding request</DialogTitle>
          <DialogDescription>
            Requests are routed through Operation Ownership and the approval engine. Employee status and login access change only after approved execution.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {error ? <div className="md:col-span-2"><InlineAlert variant="error" title={error} /></div> : null}
          {canSelectEmployee ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Employee selector</span>
              <Select value={form.employee_id || "__none"} onValueChange={(value) => update("employee_id", value === "__none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Search/select employee..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select employee</SelectItem>
                  {(employeesQuery.data?.data ?? []).map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>{employee.full_name} ({employee.employee_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Employee</span>
              <Input value={currentEmployeeId ?? "Your linked employee profile"} disabled />
            </label>
          )}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Operation</span>
            <Select
              value={form.operation_type}
              onValueChange={(value) => setForm((current) => ({
                ...current,
                operation_type: value as EmployeeExitPayload["operation_type"],
                request_type: value === "OFFBOARDING" ? "STANDARD_OFFBOARDING" : "EMPLOYEE_RESIGNATION",
              }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RESIGNATION">Resignation</SelectItem>
                <SelectItem value="OFFBOARDING">Offboarding</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Request type</span>
            <Select value={form.request_type} onValueChange={(value) => update("request_type", value)}>
              <SelectTrigger><SelectValue placeholder="Select request type" /></SelectTrigger>
              <SelectContent>{requestTypes.map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <AppDatePicker label="Resignation date" value={form.resignation_date ?? ""} onChange={(value) => update("resignation_date", value ?? "")} />
          <AppDatePicker label="Requested last working date" value={form.requested_last_working_date ?? ""} onChange={(value) => update("requested_last_working_date", value ?? "")} />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Notice period days</span>
            <Input type="number" min={0} value={form.notice_period_days ?? ""} onChange={(event) => update("notice_period_days", event.target.value ? Number(event.target.value) : null)} />
          </label>
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={Boolean(form.notice_waiver_requested)} onChange={(event) => update("notice_waiver_requested", event.target.checked)} />
            Notice waiver requested
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={Boolean(form.final_settlement_required)} onChange={(event) => update("final_settlement_required", event.target.checked)} />
            Final settlement handoff required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={Boolean(form.access_disable_required)} onChange={(event) => update("access_disable_required", event.target.checked)} />
            Login disable review required
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Reason</span>
            <Input value={form.reason} onChange={(event) => update("reason", event.target.value)} placeholder="Explain the resignation/offboarding request" />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={loading || !canSubmit} onClick={() => onSubmit({ ...form, employee_id: canSelectEmployee ? form.employee_id : currentEmployeeId })}>
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
