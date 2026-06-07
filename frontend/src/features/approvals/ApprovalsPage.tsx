import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { ApprovalActionDialog } from "./ApprovalActionDialog";
import { ApprovalDetailDrawer } from "./ApprovalDetailDrawer";
import { ApprovalFilters } from "./ApprovalFilters";
import { ApprovalInboxTable } from "./ApprovalInboxTable";
import { ApprovalSettingsSummaryPanel } from "./ApprovalSettingsSummaryPanel";
import { ApprovalStepDialog } from "./ApprovalStepDialog";
import { ApprovalStepsTable } from "./ApprovalStepsTable";
import { ApprovalThresholdDialog } from "./ApprovalThresholdDialog";
import { ApprovalThresholdsTable } from "./ApprovalThresholdsTable";
import { approvalsApi } from "./approvals.api";
import { ApprovalWorkflowForm } from "./ApprovalWorkflowForm";
import { ApprovalWorkflowTable } from "./ApprovalWorkflowTable";
import type { ApprovalFilters as ApprovalFilterValues, ApprovalRequest, ApprovalStep, ApprovalThreshold, ApprovalWorkflow } from "./approvals.types";

type ApprovalAction = "approve" | "reject" | "return" | "cancel" | "retry" | "override" | null;
type WorkflowStatusAction = "enableWorkflow" | "disableWorkflow" | "deleteStep" | "enableThreshold" | "disableThreshold" | null;

export const ApprovalsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "inbox");
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<ApprovalWorkflow | null>(null);
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const [selectedThreshold, setSelectedThreshold] = useState<ApprovalThreshold | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<ApprovalAction>(null);
  const [workflowFormOpen, setWorkflowFormOpen] = useState(false);
  const [stepFormOpen, setStepFormOpen] = useState(false);
  const [thresholdFormOpen, setThresholdFormOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<WorkflowStatusAction>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewInbox = has("approvals.view");
  const canViewWorkflows = has("approval_workflows.view");
  const canViewThresholds = has("approval_thresholds.view");
  const canViewSettings = canViewInbox || canViewWorkflows || canViewThresholds;
  const activeTab = tab === "workflows" && canViewWorkflows ? "workflows" : tab === "thresholds" && canViewThresholds ? "thresholds" : tab === "settings" && canViewSettings ? "settings" : "inbox";
  const filters = useMemo<ApprovalFilterValues>(() => ({
    status: searchParams.get("status") || undefined,
    module: searchParams.get("module") || undefined,
    workflow_key: searchParams.get("workflow_key") || undefined,
    entity_type: searchParams.get("entity_type") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<ApprovalFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", activeTab);
    setSearchParams(params);
  };
  const setActiveTab = (value: string) => { setTab(value); const params = new URLSearchParams(searchParams); params.set("tab", value); params.set("page", "1"); setSearchParams(params); };
  const listQuery = useQuery({ queryKey: ["approvals", "list", filters], queryFn: () => approvalsApi.list(filters), enabled: activeTab === "inbox" && canViewInbox });
  const historyQuery = useQuery({ queryKey: ["approvals", "history", selected?.id], queryFn: () => approvalsApi.history(selected!.id), enabled: Boolean(selected?.id && drawerOpen) });
  const workflowsQuery = useQuery({ queryKey: ["approvals", "workflows", filters], queryFn: () => approvalsApi.workflows(filters), enabled: activeTab === "workflows" && canViewWorkflows });
  const stepsQuery = useQuery({ queryKey: ["approvals", "steps", selectedWorkflow?.id], queryFn: () => approvalsApi.steps(selectedWorkflow!.id), enabled: Boolean(activeTab === "workflows" && canViewWorkflows && selectedWorkflow?.id) });
  const thresholdsQuery = useQuery({ queryKey: ["approvals", "thresholds", filters], queryFn: () => approvalsApi.thresholds(filters), enabled: activeTab === "thresholds" && canViewThresholds });
  const settingsQuery = useQuery({ queryKey: ["approvals", "settings-summary"], queryFn: approvalsApi.settingsSummary, enabled: canViewSettings || canViewInbox, retry: false });
  const salaryApprovalSettings = (settingsQuery.data?.data?.salary_approval_settings ?? {}) as {
    require_reason_for_approval?: boolean;
    require_reason_for_rejection?: boolean;
  };
  const approvalReasonRequired =
    approvalAction === "approve" ? salaryApprovalSettings.require_reason_for_approval !== false :
      approvalAction === "reject" ? salaryApprovalSettings.require_reason_for_rejection !== false :
        Boolean(approvalAction);
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["approvals"] });
  const approvalMutation = useMutation({
    mutationFn: ({ reason, decision }: { reason: string; decision?: "approve" | "reject" }) => {
      if (!selected) throw new Error("Select an approval request first.");
      if (approvalAction === "approve") return approvalsApi.approve(selected.id, reason);
      if (approvalAction === "reject") return approvalsApi.reject(selected.id, reason);
      if (approvalAction === "return") return approvalsApi.returnForInfo(selected.id, reason);
      if (approvalAction === "cancel") return approvalsApi.cancel(selected.id, reason);
      if (approvalAction === "retry") return approvalsApi.retry(selected.id, reason);
      return approvalsApi.override(selected.id, decision ?? "approve", reason);
    },
    onSuccess: async () => {
      setSuccessMessage(approvalAction === "approve" ? "Approval request approved." : approvalAction === "reject" ? "Approval request rejected." : approvalAction === "return" ? "Approval request returned for more information." : approvalAction === "cancel" ? "Approval request cancelled." : approvalAction === "retry" ? "Approval request retry completed." : "Approval request overridden successfully.");
      setApprovalAction(null);
      await refresh();
    },
  });
  const workflowMutation = useMutation({
    mutationFn: (payload: Partial<ApprovalWorkflow> & { reason?: string }) => selectedWorkflow ? approvalsApi.updateWorkflow(selectedWorkflow.id, payload) : approvalsApi.createWorkflow(payload),
    onSuccess: async () => { setSuccessMessage("Approval workflow updated successfully."); setWorkflowFormOpen(false); await refresh(); },
  });
  const stepMutation = useMutation({
    mutationFn: (payload: Partial<ApprovalStep> & { reason?: string }) => selectedStep ? approvalsApi.updateStep(selectedWorkflow!.id, selectedStep.id, payload) : approvalsApi.createStep(selectedWorkflow!.id, payload),
    onSuccess: async () => { setSuccessMessage("Approval step updated successfully."); setStepFormOpen(false); await refresh(); },
  });
  const thresholdMutation = useMutation({
    mutationFn: (payload: Partial<ApprovalThreshold> & { reason?: string }) => selectedThreshold ? approvalsApi.updateThreshold(selectedThreshold.id, payload) : approvalsApi.createThreshold(payload),
    onSuccess: async () => { setSuccessMessage("Approval threshold updated successfully."); setThresholdFormOpen(false); await refresh(); },
  });
  const statusMutation = useMutation<unknown, unknown, string>({
    mutationFn: (reason: string) => {
      if (statusAction === "enableWorkflow") return approvalsApi.enableWorkflow(selectedWorkflow!.id, reason);
      if (statusAction === "disableWorkflow") return approvalsApi.disableWorkflow(selectedWorkflow!.id, reason);
      if (statusAction === "deleteStep") return approvalsApi.deleteStep(selectedWorkflow!.id, selectedStep!.id, reason);
      if (statusAction === "enableThreshold") return approvalsApi.enableThreshold(selectedThreshold!.id, reason);
      return approvalsApi.disableThreshold(selectedThreshold!.id, reason);
    },
    onSuccess: async () => { setSuccessMessage("Approval configuration updated successfully."); setStatusAction(null); await refresh(); },
  });
  const activeQueryError = activeTab === "workflows" ? workflowsQuery.error ?? stepsQuery.error : activeTab === "thresholds" ? thresholdsQuery.error : activeTab === "settings" ? settingsQuery.error : listQuery.error;
  const error = activeQueryError ?? approvalMutation.error ?? workflowMutation.error ?? stepMutation.error ?? thresholdMutation.error ?? statusMutation.error;

  return (
    <div>
      <PageHeader title="Approvals" description="Review pending approvals, workflow steps, thresholds, and approval history." />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Approval action could not be completed.", "approval")} variant="error" /> : null}
        <ApprovalFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab: activeTab }))} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="inbox">Inbox</TabsTrigger>{canViewWorkflows ? <TabsTrigger value="workflows">Workflows</TabsTrigger> : null}{canViewThresholds ? <TabsTrigger value="thresholds">Thresholds</TabsTrigger> : null}{canViewSettings ? <TabsTrigger value="settings">Settings Summary</TabsTrigger> : null}</TabsList>
          <TabsContent value="inbox"><ApprovalInboxTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canApprove={has("approvals.approve")} canReject={has("approvals.reject")} canReturn={has("approvals.return")} canCancel={has("approvals.view")} canRetry={has("approvals.approve")} canOverride={has("approvals.override")} canHistory={has("approvals.view_history") || has("approvals.view")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onApprove={(row) => { setSelected(row); setApprovalAction("approve"); }} onReject={(row) => { setSelected(row); setApprovalAction("reject"); }} onReturn={(row) => { setSelected(row); setApprovalAction("return"); }} onCancel={(row) => { setSelected(row); setApprovalAction("cancel"); }} onRetry={(row) => { setSelected(row); setApprovalAction("retry"); }} onOverride={(row) => { setSelected(row); setApprovalAction("override"); }} onHistory={(row) => { setSelected(row); setDrawerOpen(true); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          {canViewWorkflows ? <TabsContent value="workflows">
            {has("approval_workflows.manage") ? (
              <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setSelectedWorkflow(null); setWorkflowFormOpen(true); }}><Plus className="h-4 w-4" />Create workflow</Button>
                <Button size="sm" variant="outline" disabled={!selectedWorkflow} onClick={() => { setSelectedStep(null); setStepFormOpen(true); }}><Plus className="h-4 w-4" />Create step</Button>
              </div>
            ) : null}
            <ApprovalWorkflowTable rows={workflowsQuery.data?.data ?? []} loading={workflowsQuery.isLoading} pagination={workflowsQuery.data?.pagination} canManage={has("approval_workflows.manage")} onView={(row) => setSelectedWorkflow(row)} onEdit={(row) => { setSelectedWorkflow(row); setWorkflowFormOpen(true); }} onEnable={(row) => { setSelectedWorkflow(row); setStatusAction("enableWorkflow"); }} onDisable={(row) => { setSelectedWorkflow(row); setStatusAction("disableWorkflow"); }} onSteps={(row) => setSelectedWorkflow(row)} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
            <ApprovalStepsTable rows={stepsQuery.data?.data ?? []} loading={stepsQuery.isLoading} canManage={has("approval_workflows.manage") && Boolean(selectedWorkflow)} onEdit={(row) => { setSelectedStep(row); setStepFormOpen(true); }} onDelete={(row) => { setSelectedStep(row); setStatusAction("deleteStep"); }} />
          </TabsContent> : null}
          {canViewThresholds ? <TabsContent value="thresholds">
            {has("approval_thresholds.edit") ? (
              <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => { setSelectedThreshold(null); setThresholdFormOpen(true); }}><Plus className="h-4 w-4" />Create threshold</Button></div>
            ) : null}
            <ApprovalThresholdsTable rows={thresholdsQuery.data?.data ?? []} loading={thresholdsQuery.isLoading} pagination={thresholdsQuery.data?.pagination} canEdit={has("approval_thresholds.edit")} onEdit={(row) => { setSelectedThreshold(row); setThresholdFormOpen(true); }} onEnable={(row) => { setSelectedThreshold(row); setStatusAction("enableThreshold"); }} onDisable={(row) => { setSelectedThreshold(row); setStatusAction("disableThreshold"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
          </TabsContent> : null}
          {canViewSettings ? <TabsContent value="settings"><ApprovalSettingsSummaryPanel data={settingsQuery.data?.data} /></TabsContent> : null}
        </Tabs>
      </div>
      <ApprovalDetailDrawer approval={selected} history={historyQuery.data?.data ?? []} historyLoading={historyQuery.isLoading} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <ApprovalActionDialog action={approvalAction ?? "approve"} open={Boolean(approvalAction)} loading={approvalMutation.isPending} error={approvalMutation.error ? friendlyHrmError(approvalMutation.error, "Approval action could not be completed.", "approval") : null} reasonRequired={approvalReasonRequired} onOpenChange={(open) => !open && setApprovalAction(null)} onSubmit={(payload) => approvalMutation.mutate(payload)} />
      <ApprovalWorkflowForm workflow={selectedWorkflow} open={workflowFormOpen} loading={workflowMutation.isPending} error={workflowMutation.error ? friendlyHrmError(workflowMutation.error, "Workflow could not be saved.") : null} onOpenChange={setWorkflowFormOpen} onSubmit={(payload) => workflowMutation.mutate(payload)} />
      <ApprovalStepDialog step={selectedStep} open={stepFormOpen} loading={stepMutation.isPending} error={stepMutation.error ? friendlyHrmError(stepMutation.error, "Approval step could not be saved.") : null} onOpenChange={setStepFormOpen} onSubmit={(payload) => stepMutation.mutate(payload)} />
      <ApprovalThresholdDialog threshold={selectedThreshold} open={thresholdFormOpen} loading={thresholdMutation.isPending} error={thresholdMutation.error ? friendlyHrmError(thresholdMutation.error, "Approval threshold could not be saved.") : null} onOpenChange={setThresholdFormOpen} onSubmit={(payload) => thresholdMutation.mutate(payload)} />
      <ReasonDialog open={Boolean(statusAction)} title="Confirm approval configuration change" description="A reason is required for this approval configuration action." loading={statusMutation.isPending} error={statusMutation.error ? friendlyHrmError(statusMutation.error, "Approval configuration could not be updated.") : null} onOpenChange={(open) => !open && setStatusAction(null)} onSubmit={(reason) => statusMutation.mutate(reason)} />
    </div>
  );
};
