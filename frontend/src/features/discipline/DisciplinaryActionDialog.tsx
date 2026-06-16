import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useToast } from "@/components/feedback/useToast";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { EmployeeCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { disciplineApi } from "./discipline.api";
import type { DisciplinaryActionPayload } from "./discipline.types";

const requestTypes = ["INCIDENT_REPORT", "MISCONDUCT_REPORT", "ATTENDANCE_VIOLATION", "POLICY_VIOLATION", "CONDUCT_VIOLATION", "PERFORMANCE_ISSUE", "CUSTOMER_COMPLAINT", "SAFETY_VIOLATION", "HARASSMENT_COMPLAINT", "INVESTIGATION", "THEFT_OR_FRAUD_ALLEGATION", "PROPERTY_DAMAGE", "GENERAL_DISCIPLINARY_REPORT", "GENERAL_DISCIPLINARY_ACTION"];
const actionTypes = ["VERBAL_WARNING", "WRITTEN_WARNING", "FINAL_WARNING", "PERFORMANCE_IMPROVEMENT_PLAN", "TRAINING_REQUIRED", "COUNSELLING_REQUIRED", "SUSPENSION", "SUSPENSION_RECOMMENDATION", "PAYROLL_ACTION_RECOMMENDATION", "TRANSFER_RECOMMENDATION", "OFFBOARDING_RECOMMENDATION", "TERMINATION_RECOMMENDATION", "NO_ACTION", "GENERAL_ACTION", "GENERAL_DISCIPLINARY_ACTION"];
const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const humanize = (value?: string | null) => value ? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) : "-";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmployeeId?: string | null;
  canSelectEmployee?: boolean;
  onSubmitted?: () => Promise<void> | void;
}

export const DisciplinaryActionDialog = ({ open, onOpenChange, currentEmployeeId, canSelectEmployee = false, onSubmitted }: Props) => {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(currentEmployeeId ?? "");
  const [requestType, setRequestType] = useState("INCIDENT_REPORT");
  const [actionType, setActionType] = useState("GENERAL_DISCIPLINARY_ACTION");
  const [severity, setSeverity] = useState("MEDIUM");
  const [incidentDate, setIncidentDate] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [policyReference, setPolicyReference] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [acknowledgementRequired, setAcknowledgementRequired] = useState(true);
  const [payrollFollowUp, setPayrollFollowUp] = useState(false);
  const [offboardingFollowUp, setOffboardingFollowUp] = useState(false);
  const [trainingFollowUp, setTrainingFollowUp] = useState(false);

  const effectiveEmployeeId = canSelectEmployee ? employeeId : currentEmployeeId ?? "";
  const reset = () => {
    setEmployeeId(currentEmployeeId ?? "");
    setRequestType("INCIDENT_REPORT");
    setActionType("GENERAL_DISCIPLINARY_ACTION");
    setSeverity("MEDIUM");
    setIncidentDate("");
    setTitle("");
    setDescription("");
    setPolicyReference("");
    setEvidenceSummary("");
    setAcknowledgementRequired(true);
    setPayrollFollowUp(false);
    setOffboardingFollowUp(false);
    setTrainingFollowUp(false);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!effectiveEmployeeId) throw new Error("Select an employee or link your employee profile before submitting.");
      const payload: DisciplinaryActionPayload = {
        employee_id: canSelectEmployee ? effectiveEmployeeId : undefined,
        request_type: requestType,
        action_type: actionType,
        severity,
        incident_date: incidentDate || undefined,
        title,
        description,
        policy_reference: policyReference || undefined,
        evidence_summary: evidenceSummary || undefined,
        acknowledgement_required: acknowledgementRequired,
        payroll_follow_up_required: payrollFollowUp || actionType === "PAYROLL_ACTION_RECOMMENDATION",
        offboarding_follow_up_required: offboardingFollowUp || actionType === "OFFBOARDING_RECOMMENDATION",
        training_follow_up_required: trainingFollowUp || actionType === "TRAINING_REQUIRED",
        requested_action_json: { action_type: actionType, note: description },
      };
      const created = await disciplineApi.create(payload);
      return disciplineApi.submit(created.data.disciplinary_action.id);
    },
    onSuccess: async () => {
      toast.success("Disciplinary action request submitted for approval.");
      reset();
      onOpenChange(false);
      await onSubmitted?.();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Disciplinary action request could not be submitted.")),
  });

  const canSubmit = Boolean(effectiveEmployeeId && title.trim().length >= 3 && description.trim().length >= 3);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) reset(); onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create disciplinary action request</DialogTitle>
          <DialogDescription>Submit a sensitive employee relations request through Operation Ownership approval. Department, position, and level are derived by HRM.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {canSelectEmployee ? (
            <Label className="grid gap-1 text-sm">Employee<EmployeeCombobox value={employeeId} onChange={(value) => setEmployeeId(value ?? "")} /></Label>
          ) : (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm md:col-span-2">
              {currentEmployeeId ? "Submitting against your linked employee profile." : "Your employee profile is not linked to this login. Please contact HR."}
            </div>
          )}
          <Label className="grid gap-1 text-sm">Request type
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{requestTypes.map((type) => <SelectItem key={type} value={type}>{humanize(type)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-sm">Recommended outcome
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{actionTypes.map((type) => <SelectItem key={type} value={type}>{humanize(type)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <Label className="grid gap-1 text-sm">Severity
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{severities.map((value) => <SelectItem key={value} value={value}>{humanize(value)}</SelectItem>)}</SelectContent>
            </Select>
          </Label>
          <AppDatePicker label="Incident date" value={incidentDate} onChange={(value) => setIncidentDate(value ?? "")} />
          <Label className="grid gap-1 text-sm md:col-span-2">Title<Input value={title} onChange={(event) => setTitle(event.target.value)} /></Label>
          <Label className="grid gap-1 text-sm md:col-span-2">Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Label>
          <Label className="grid gap-1 text-sm">Policy reference<Input value={policyReference} onChange={(event) => setPolicyReference(event.target.value)} /></Label>
          <Label className="grid gap-1 text-sm">Evidence summary<Input value={evidenceSummary} onChange={(event) => setEvidenceSummary(event.target.value)} /></Label>
          <div className="grid gap-2 rounded-md border bg-muted/20 p-3 md:col-span-2">
            <Label className="flex items-center gap-2 text-sm"><Checkbox checked={acknowledgementRequired} onCheckedChange={(checked) => setAcknowledgementRequired(Boolean(checked))} /> Employee acknowledgement required</Label>
            <Label className="flex items-center gap-2 text-sm"><Checkbox checked={trainingFollowUp} onCheckedChange={(checked) => setTrainingFollowUp(Boolean(checked))} /> Training follow-up task</Label>
            <Label className="flex items-center gap-2 text-sm"><Checkbox checked={payrollFollowUp} onCheckedChange={(checked) => setPayrollFollowUp(Boolean(checked))} /> Payroll review follow-up, no payroll mutation</Label>
            <Label className="flex items-center gap-2 text-sm"><Checkbox checked={offboardingFollowUp} onCheckedChange={(checked) => setOffboardingFollowUp(Boolean(checked))} /> Offboarding review follow-up, no direct termination</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>Submit for approval</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
