import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { approvalsApi } from "../approvals/approvals.api";
import type { ApprovalStep, ApprovalWorkflow } from "../approvals/approvals.types";

const LEAVE_WORKFLOW_KEY = "leave_request";

export const LeaveApprovalSettingsPanel = ({ canManage }: { canManage: boolean }) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("single");
  const [enabled, setEnabled] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [stepForm, setStepForm] = useState({
    step_order: "1",
    step_name: "HR approval",
    required_role_key: "hr_admin",
    required_permission_key: "leave.approvals.approve",
    approval_type: "single",
    is_required: "true",
  });
  const [reason, setReason] = useState("");

  const workflowsQuery = useQuery({
    queryKey: ["approval-workflows", "leave-request"],
    queryFn: () => approvalsApi.workflows({ workflow_key: LEAVE_WORKFLOW_KEY, page_size: 10 }),
  });
  const workflow = workflowsQuery.data?.data?.find((row) => row.workflow_key === LEAVE_WORKFLOW_KEY);
  const stepsQuery = useQuery({
    queryKey: ["approval-workflow-steps", workflow?.id],
    queryFn: () => approvalsApi.steps(workflow!.id),
    enabled: Boolean(workflow?.id),
  });
  const sortedSteps = useMemo(
    () => [...(stepsQuery.data?.data ?? [])].sort((a, b) => Number(a.step_order ?? 0) - Number(b.step_order ?? 0)),
    [stepsQuery.data?.data],
  );
  const selectedStep = useMemo(() => sortedSteps.find((step) => step.id === selectedStepId) ?? null, [selectedStepId, sortedSteps]);

  useEffect(() => {
    if (!workflow) return;
    setMode(workflow.approval_mode ?? "single");
    setEnabled(Boolean(workflow.is_enabled));
  }, [workflow?.id, workflow?.approval_mode, workflow?.is_enabled]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["approval-workflows"] });
    await queryClient.invalidateQueries({ queryKey: ["approval-workflow-steps"] });
  };

  const resetStepForm = (step?: ApprovalStep | null) => {
    const nextOrder = sortedSteps.length > 0 ? Math.max(...sortedSteps.map((row) => Number(row.step_order ?? 0))) + 1 : 1;
    setSelectedStepId(step?.id ?? null);
    setStepForm({
      step_order: String(step?.step_order ?? nextOrder),
      step_name: step?.step_name ?? `Approval step ${nextOrder}`,
      required_role_key: step?.required_role_key ?? "",
      required_permission_key: step?.required_permission_key ?? "leave.approvals.approve",
      approval_type: step?.approval_type ?? (mode === "multi_level" ? "sequential" : "single"),
      is_required: String(step?.is_required ?? true),
    });
  };

  const saveWorkflowMutation = useMutation({
    mutationFn: async () => {
      if (!workflow) {
        return approvalsApi.createWorkflow({
          workflow_key: LEAVE_WORKFLOW_KEY,
          workflow_name: "Leave Request Approval",
          module: "leave",
          approval_mode: mode,
          is_enabled: enabled,
          reason,
        } as Partial<ApprovalWorkflow> & { reason: string });
      }
      const response = await approvalsApi.updateWorkflow(workflow.id, { approval_mode: mode, is_enabled: enabled, reason });
      if (enabled && !Boolean(workflow.is_enabled)) await approvalsApi.enableWorkflow(workflow.id, reason);
      if (!enabled && Boolean(workflow.is_enabled)) await approvalsApi.disableWorkflow(workflow.id, reason);
      return response;
    },
    onSuccess: invalidate,
  });

  const saveStepMutation = useMutation({
    mutationFn: async () => {
      if (!workflow) throw new Error("Save the leave workflow before editing approval steps.");
      const payload: Partial<ApprovalStep> & { reason: string } = {
        step_order: Number(stepForm.step_order),
        step_name: stepForm.step_name.trim() || `Approval step ${stepForm.step_order}`,
        required_role_key: stepForm.required_role_key.trim() || null,
        required_permission_key: stepForm.required_permission_key.trim() || null,
        approval_type: stepForm.approval_type,
        is_required: stepForm.is_required === "true",
        reason,
      };
      return selectedStep
        ? approvalsApi.updateStep(workflow.id, selectedStep.id, payload)
        : approvalsApi.createStep(workflow.id, payload);
    },
    onSuccess: async () => {
      resetStepForm(null);
      await invalidate();
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (step: ApprovalStep) => {
      if (!workflow) throw new Error("Save the leave workflow before removing approval steps.");
      return approvalsApi.deleteStep(workflow.id, step.id, reason);
    },
    onSuccess: async () => {
      resetStepForm(null);
      await invalidate();
    },
  });

  const loading = workflowsQuery.isLoading || stepsQuery.isLoading;
  const error = saveWorkflowMutation.error ?? saveStepMutation.error ?? deleteStepMutation.error ?? workflowsQuery.error ?? stepsQuery.error;
  const duplicateOrders = sortedSteps
    .map((step) => Number(step.step_order ?? 0))
    .filter((order, index, orders) => orders.indexOf(order) !== index);
  const impossibleWarnings = [
    enabled && workflow && sortedSteps.length === 0 ? "The workflow is enabled but has no approval steps. Add at least one approver before relying on it." : null,
    enabled && mode === "multi_level" && sortedSteps.length < 2 ? "Multi-level mode has fewer than two steps. Add another approval step or switch to single level." : null,
    duplicateOrders.length > 0 ? "Duplicate step order values were found. Reorder steps so the approval path is deterministic." : null,
    ...sortedSteps
      .filter((step) => !step.required_role_key && !step.required_permission_key)
      .map((step) => `${step.step_name || `Step ${step.step_order}`} has no role and no permission requirement.`),
    canManage && reason.trim().length > 0 && reason.trim().length < 3 ? "A reason is required when saving workflow or step changes." : null,
  ].filter(Boolean) as string[];
  const stepFormValid = Number(stepForm.step_order) > 0 && stepForm.step_name.trim().length > 0 && reason.trim().length >= 3;

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold">Leave approval settings</h3>
          <p className="text-sm text-muted-foreground">Configure the company approval workflow used when leave requests are submitted.</p>
        </div>
        <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Approvals enabled" : "Approvals disabled"}</Badge>
      </div>
      {error ? <InlineAlert title={friendlyHrmError(error, "Leave approval settings could not be saved.", "leave")} variant="error" /> : null}
      {impossibleWarnings.map((warning) => <InlineAlert key={warning} title={warning} variant="warning" />)}
      <div className="grid gap-3 md:grid-cols-2">
        <Label className="space-y-1 text-sm">
          Approval required
          <Select value={enabled ? "enabled" : "disabled"} disabled={!canManage || loading} onValueChange={(value) => setEnabled(value === "enabled")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="enabled">Require approval for leave requests</SelectItem>
              <SelectItem value="disabled">Auto-approve after balance validation</SelectItem>
            </SelectContent>
          </Select>
        </Label>
        <Label className="space-y-1 text-sm">
          Approval mode
          <Select value={mode} disabled={!canManage || loading} onValueChange={setMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single level</SelectItem>
              <SelectItem value="multi_level">Multi-level sequential</SelectItem>
              <SelectItem value="manual">Manual review</SelectItem>
            </SelectContent>
          </Select>
        </Label>
      </div>
      <div className="rounded-md border p-3 text-sm">
        <p className="font-medium">Balance-safe lifecycle</p>
        <p className="text-muted-foreground">Submit reserves pending balance, final approval moves it to used, and reject/cancel/withdraw releases or reverses through the ledger.</p>
      </div>
      <div className="space-y-3 rounded-md border p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">Approval steps</p>
            <p className="text-xs text-muted-foreground">Steps are evaluated by order. Role and permission requirements are enforced by the backend.</p>
          </div>
          {canManage ? (
            <Button size="sm" variant="outline" disabled={!workflow || loading} onClick={() => resetStepForm(null)}>Add approval step</Button>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full divide-y text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Order</th>
                <th className="px-3 py-2 text-left">Step name</th>
                <th className="px-3 py-2 text-left">Role key</th>
                <th className="px-3 py-2 text-left">Permission key</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Required</th>
                {canManage ? <th className="px-3 py-2 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedSteps.length === 0 ? (
                <tr><td className="px-3 py-4 text-muted-foreground" colSpan={canManage ? 7 : 6}>No approval steps are configured yet.</td></tr>
              ) : sortedSteps.map((step) => (
                <tr key={step.id}>
                  <td className="px-3 py-2">{step.step_order ?? "-"}</td>
                  <td className="px-3 py-2 font-medium">{step.step_name || "Approval step"}</td>
                  <td className="px-3 py-2">{step.required_role_key || <span className="text-muted-foreground">Any role</span>}</td>
                  <td className="px-3 py-2">{step.required_permission_key || <span className="text-muted-foreground">No permission key</span>}</td>
                  <td className="px-3 py-2">{step.approval_type || "single"}</td>
                  <td className="px-3 py-2"><Badge variant={step.is_required === false || step.is_required === 0 ? "outline" : "default"}>{step.is_required === false || step.is_required === 0 ? "Optional" : "Required"}</Badge></td>
                  {canManage ? (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => resetStepForm(step)}>Edit</Button>
                        <LoadingButton size="sm" variant="ghost" loading={deleteStepMutation.isPending && selectedStepId === step.id} disabled={reason.trim().length < 3} onClick={() => { setSelectedStepId(step.id); deleteStepMutation.mutate(step); }}>Remove</LoadingButton>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <div className="grid gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-3">
            <Label className="space-y-1 text-sm">
              Step order
              <Input type="number" min={1} disabled={!workflow || loading} value={stepForm.step_order} onChange={(event) => setStepForm((current) => ({ ...current, step_order: event.target.value }))} />
            </Label>
            <Label className="space-y-1 text-sm">
              Step name
              <Input disabled={!workflow || loading} value={stepForm.step_name} onChange={(event) => setStepForm((current) => ({ ...current, step_name: event.target.value }))} placeholder="HR final approval" />
            </Label>
            <Label className="space-y-1 text-sm">
              Approval type
              <Select value={stepForm.approval_type} disabled={!workflow || loading} onValueChange={(value) => setStepForm((current) => ({ ...current, approval_type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single approver</SelectItem>
                  <SelectItem value="sequential">Sequential</SelectItem>
                </SelectContent>
              </Select>
            </Label>
            <Label className="space-y-1 text-sm">
              Required role key
              <Input disabled={!workflow || loading} value={stepForm.required_role_key} onChange={(event) => setStepForm((current) => ({ ...current, required_role_key: event.target.value }))} placeholder="hr_admin" />
            </Label>
            <Label className="space-y-1 text-sm">
              Required permission key
              <Input disabled={!workflow || loading} value={stepForm.required_permission_key} onChange={(event) => setStepForm((current) => ({ ...current, required_permission_key: event.target.value }))} placeholder="leave.approvals.approve" />
            </Label>
            <Label className="space-y-1 text-sm">
              Step required
              <Select value={stepForm.is_required} disabled={!workflow || loading} onValueChange={(value) => setStepForm((current) => ({ ...current, is_required: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Required step</SelectItem>
                  <SelectItem value="false">Optional/skippable step</SelectItem>
                </SelectContent>
              </Select>
            </Label>
          </div>
        ) : null}
      </div>
      <div className="rounded-md border p-3 text-sm">
        <p className="font-medium">Advanced approval rules</p>
        <div className="mt-2 grid gap-2 text-muted-foreground md:grid-cols-2">
          <p>Rejection reason required: enforced by the leave approval action API.</p>
          <p>Override reason required: enforced for Super Admin approval overrides.</p>
          <p>Cancellation-after-approval approval: not available yet in this leave panel; use the safe cancellation/reversal action until the generic rule is extended.</p>
          <p>Threshold days and negative-balance escalation: handled in generic approval thresholds for the leave_request workflow.</p>
        </div>
      </div>
      {canManage ? (
        <div className="space-y-3">
          <Label className="space-y-1 text-sm">
            Change reason
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are these approval settings changing?" />
          </Label>
          <div className="flex flex-wrap gap-2">
            <LoadingButton loading={saveWorkflowMutation.isPending} disabled={reason.trim().length < 3} onClick={() => saveWorkflowMutation.mutate()}>
              Save workflow settings
            </LoadingButton>
            <LoadingButton variant="outline" loading={saveStepMutation.isPending} disabled={!workflow || !stepFormValid} onClick={() => saveStepMutation.mutate()}>
              {selectedStep ? "Update approval step" : "Create approval step"}
            </LoadingButton>
            {selectedStep ? <Button variant="ghost" onClick={() => resetStepForm(null)}>Cancel step edit</Button> : null}
          </div>
        </div>
      ) : (
        <InlineAlert title="You can view approval settings, but only authorized HR/Admin users can update the leave workflow." />
      )}
      {!workflow && !loading ? <InlineAlert title="No leave approval workflow exists yet. Saving will create the leave_request workflow." variant="warning" /> : null}
      <Button variant="ghost" size="sm" disabled={loading} onClick={() => void invalidate()}>Refresh settings</Button>
    </div>
  );
};
