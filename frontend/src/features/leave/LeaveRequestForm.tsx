import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { FormError } from "@/components/feedback/FormError";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { EmployeeCombobox, LeaveTypeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { leaveApi } from "./leave.api";
import type { LeaveRequestPayload } from "./leave.types";

export const LeaveRequestForm = ({
  open,
  loading,
  error,
  canCreateForOthers = false,
  currentEmployeeId,
  currentEmployeeName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  canCreateForOthers?: boolean;
  currentEmployeeId?: string | null;
  currentEmployeeName?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: LeaveRequestPayload) => void;
}) => {
  const [values, setValues] = useState<LeaveRequestPayload>({ employee_id: "", leave_type_id: "", start_date: "", end_date: "", reason: "", supporting_document_attached: false });
  const [localError, setLocalError] = useState<string | null>(null);
  const previewEmployeeId = canCreateForOthers ? values.employee_id : currentEmployeeId ?? "";
  const previewEnabled = Boolean(open && previewEmployeeId && values.leave_type_id && values.start_date && values.end_date && values.start_date <= values.end_date);
  const previewQuery = useQuery({
    queryKey: ["leave", "policy-preview", previewEmployeeId, values.leave_type_id, values.start_date, values.end_date],
    queryFn: () => leaveApi.previewPolicy({
      employee_id: previewEmployeeId,
      leave_type_id: values.leave_type_id,
      start_date: values.start_date,
      end_date: values.end_date,
      reason: values.reason,
    }),
    enabled: previewEnabled,
    retry: false,
  });
  const preview = previewQuery.data?.data.policy_preview;

  useEffect(() => {
    if (!open) return;
    setValues((current) => ({
      ...current,
      employee_id: canCreateForOthers ? current.employee_id : currentEmployeeId ?? "",
    }));
    setLocalError(null);
  }, [canCreateForOthers, currentEmployeeId, open]);

  const submit = () => {
    if (!canCreateForOthers && !currentEmployeeId) {
      return setLocalError("Your employee profile is not linked to this login. Please contact HR.");
    }
    if (!values.employee_id || !values.leave_type_id || !values.start_date || !values.end_date) return setLocalError("Employee, leave type, start date, and end date are required.");
    if (values.start_date > values.end_date) return setLocalError("Start date must be before or equal to end date.");
    setLocalError(null);
    onSubmit({ ...values, employee_id: canCreateForOthers ? values.employee_id : currentEmployeeId ?? "" });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New leave request</DialogTitle><DialogDescription>Create a backend-validated leave request.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          {canCreateForOthers ? (
            <Label className="space-y-1.5">Employee<EmployeeCombobox value={values.employee_id} onChange={(value) => setValues((current) => ({ ...current, employee_id: value ?? "" }))} /></Label>
          ) : (
            <Label>Employee<Input value={currentEmployeeName ?? currentEmployeeId ?? "Employee profile not linked"} disabled /></Label>
          )}
          <Label className="space-y-1.5">Leave type<LeaveTypeCombobox value={values.leave_type_id} onChange={(value) => setValues((current) => ({ ...current, leave_type_id: value ?? "" }))} /></Label>
          <AppDateRangePicker
            fromLabel="Start date"
            toLabel="End date"
            dateFrom={values.start_date}
            dateTo={values.end_date}
            onChange={({ dateFrom, dateTo }) => setValues((current) => ({ ...current, start_date: dateFrom ?? "", end_date: dateTo ?? "" }))}
          />
          <Label>Reason<Textarea value={values.reason ?? ""} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} /></Label>
          {preview ? (
            <div className="rounded-md border bg-slate-50 p-3 text-sm" data-setup-target="leave-policy-rules">
              <div className="font-medium">Leave policy preview</div>
              <div className="mt-2 grid gap-2 text-muted-foreground sm:grid-cols-2">
                <span>Days requested: {preview.requested_days}</span>
                <span>Paid status: {preview.paid_status} ({preview.paid_percentage}%)</span>
                <span>Approval: {preview.approval_required ? "Required" : "Not required"}</span>
                <span>Payroll deduction: {preview.salary_deduction_required ? `${preview.deductible_days} day(s)` : "None"}</span>
                <span>Deduction source: {preview.salary_deduction_required ? (preview.deduction_source_label ?? preview.payroll_source_label ?? preview.deduction_mode) : "Not applicable"}</span>
              </div>
              {preview.document_required ? (
                <div className="space-y-2">
                  <InlineAlert title={preview.document_reason ?? "Supporting document required."} variant="warning" />
                  <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                    <div>
                      <p className="font-medium text-foreground">Supporting document submitted</p>
                      <p className="text-xs text-muted-foreground">If this is not switched on, the request is saved as pending document and cannot proceed to approval.</p>
                    </div>
                    <Switch checked={Boolean(values.supporting_document_attached)} onCheckedChange={(checked) => setValues((current) => ({ ...current, supporting_document_attached: checked }))} />
                  </div>
                </div>
              ) : null}
              {preview.warnings?.map((warning) => <InlineAlert key={warning} title={warning} />)}
              {preview.blocking_errors?.map((blockingError) => <InlineAlert key={blockingError} title={blockingError} variant="error" />)}
            </div>
          ) : previewQuery.isError ? (
            <InlineAlert title="Leave policy preview could not be loaded. The backend will still validate this request." variant="warning" />
          ) : null}
        </div>
        {localError ? <FormError message={localError} /> : null}{error ? <FormError message={error} /> : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>Submit request</LoadingButton></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
