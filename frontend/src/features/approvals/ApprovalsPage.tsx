import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { useToast } from "@/components/feedback/useToast";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { ModuleAttentionPanel, ModuleLandingHeader, ModuleLandingShell, ModuleQuickActions, ModuleSummaryGrid, ModuleSummaryTile } from "@/components/module-landing";
import { Button } from "@/components/ui/button";
import { attendanceApi } from "@/features/attendance/attendance.api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { advancesApi } from "@/features/advances/advances.api";
import { useAuth } from "@/features/auth/auth.store";
import { disciplineApi } from "@/features/discipline/discipline.api";
import { documentsApi } from "@/features/documents/documents.api";
import { employeeExitApi } from "@/features/offboarding/employeeExit.api";
import { employeeStructureChangeApi } from "@/features/employee-structure-change/employeeStructureChange.api";
import { leaveApi } from "@/features/leave/leave.api";
import { payrollApi } from "@/features/payroll/payroll.api";
import { rostersApi } from "@/features/rosters/rosters.api";
import { isModuleEnabled } from "@/lib/features";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { hasAttendanceSubFeature, hasPayrollSubFeature } from "@/lib/subfeatures";
import { ApprovalActionDialog } from "./ApprovalActionDialog";
import { ApprovalDetailDrawer } from "./ApprovalDetailDrawer";
import { ApprovalEngineActionDialog } from "./ApprovalEngineActionDialog";
import { ApprovalEngineRequestsTable } from "./ApprovalEngineRequestsTable";
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
import type { ApprovalEngineRequest, ApprovalFilters as ApprovalFilterValues, ApprovalRequest, ApprovalStep, ApprovalThreshold, ApprovalWorkflow } from "./approvals.types";

type ApprovalAction = "approve" | "reject" | "return" | "cancel" | "retry" | "override" | null;
type EngineAction = "approve" | "reject" | "cancel" | "escalate" | null;
type WorkflowStatusAction = "enableWorkflow" | "disableWorkflow" | "deleteStep" | "enableThreshold" | "disableThreshold" | null;

const operationModuleEnabled = (user: ReturnType<typeof useAuth>["user"], operationType: string) => {
  if (operationType === "LEAVE_REQUEST") return isModuleEnabled(user, "leave_management");
  if (operationType === "ATTENDANCE_CORRECTION") return isModuleEnabled(user, "attendance") && hasAttendanceSubFeature(user, "corrections_enabled");
  if (operationType === "ROSTER_CHANGE") return isModuleEnabled(user, "roster");
  if (operationType === "PAYROLL_ADJUSTMENT") return isModuleEnabled(user, "payroll") && hasPayrollSubFeature(user, "manual_deductions_enabled") && hasPayrollSubFeature(user, "approvals_enabled");
  if (operationType === "ADVANCE_SALARY_REQUEST" || operationType === "ADVANCE_PAYMENT") return isModuleEnabled(user, "payroll") && hasPayrollSubFeature(user, "advances_enabled");
  if (operationType === "DOCUMENT_KYC_UPDATE" || operationType === "DOCUMENT_APPROVAL") return isModuleEnabled(user, "documents_kyc") || isModuleEnabled(user, "document_tracking");
  if (operationType === "EMPLOYEE_DOCUMENT_UPDATE") return isModuleEnabled(user, "employee_management");
  if (operationType === "EMPLOYEE_TRANSFER" || operationType === "EMPLOYEE_STRUCTURE_CHANGE") return isModuleEnabled(user, "employee_management") && isModuleEnabled(user, "employee_structure_changes");
  if (operationType === "RESIGNATION" || operationType === "OFFBOARDING") return isModuleEnabled(user, "resignation_offboarding");
  if (operationType === "DISCIPLINARY_ACTION") return isModuleEnabled(user, "disciplinary_actions");
  if (operationType === "CONTRACT_RENEWAL") return isModuleEnabled(user, "contract_tracking");
  if (operationType === "ASSET_ISSUE" || operationType === "ASSET_RETURN") return isModuleEnabled(user, "asset_tracking");
  if (operationType === "UNIFORM_ISSUE" || operationType === "UNIFORM_RETURN") return isModuleEnabled(user, "uniform_tracking");
  return true;
};

export const ApprovalsPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "inbox");
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [selectedEngineRequest, setSelectedEngineRequest] = useState<ApprovalEngineRequest | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<ApprovalWorkflow | null>(null);
  const [selectedStep, setSelectedStep] = useState<ApprovalStep | null>(null);
  const [selectedThreshold, setSelectedThreshold] = useState<ApprovalThreshold | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<ApprovalAction>(null);
  const [engineAction, setEngineAction] = useState<EngineAction>(null);
  const [workflowFormOpen, setWorkflowFormOpen] = useState(false);
  const [stepFormOpen, setStepFormOpen] = useState(false);
  const [thresholdFormOpen, setThresholdFormOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<WorkflowStatusAction>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewInbox = has("approvals.view");
  const canViewWorkflows = has("approval_workflows.view") || has("approvals.workflows.view");
  const canViewThresholds = has("approval_thresholds.view");
  const canViewEngineRequests = has("approvals.requests.view") || has("approvals.department.view") || has("approvals.hrFinal.view") || has("approvals.financeFinal.view") || has("employeeDiscipline.actions.view") || has("employeeDiscipline.actions.viewOwn") || has("employeeDiscipline.actions.review") || has("employeeDiscipline.actions.finalApprove") || has("employeeDiscipline.actions.apply") || canViewInbox;
  const canViewSettings = canViewInbox || canViewWorkflows || canViewThresholds;
  const canViewMyPendingApprovals = canViewEngineRequests || canViewInbox || has("approvals.requests.approve") || has("approvals.department.approve") || has("approvals.operationOwner.approve");
  const activeTab = tab === "workflows" && canViewWorkflows ? "workflows" : tab === "requests" && canViewEngineRequests ? "requests" : tab === "my-pending" ? "my-pending" : tab === "my-requests" ? "my-requests" : tab === "thresholds" && canViewThresholds ? "thresholds" : tab === "settings" && canViewSettings ? "settings" : "inbox";
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
  const engineRequestsQuery = useQuery({ queryKey: ["approvals", "engine-requests", activeTab, filters], queryFn: () => activeTab === "my-pending" ? approvalsApi.myPendingEngine(filters) : activeTab === "my-requests" ? approvalsApi.myRequestsEngine(filters) : approvalsApi.engineRequests(filters), enabled: activeTab === "requests" || activeTab === "my-pending" || activeTab === "my-requests" });
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
  const engineMutation = useMutation<unknown, unknown, { reason?: string }>({
    mutationFn: async ({ reason }: { reason?: string }) => {
      if (!selectedEngineRequest) throw new Error("Select an approval request first.");
      if (selectedEngineRequest.operation_type === "LEAVE_REQUEST") {
        if (engineAction === "approve") return await leaveApi.approveRequest(selectedEngineRequest.subject_id, reason ?? "Approved from Approvals page.");
        if (engineAction === "reject") return await leaveApi.rejectRequest(selectedEngineRequest.subject_id, reason ?? "");
        if (engineAction === "cancel") return await leaveApi.cancelRequest(selectedEngineRequest.subject_id, reason ?? "");
      }
      if (selectedEngineRequest.operation_type === "ATTENDANCE_CORRECTION") {
        if (engineAction === "approve") return await attendanceApi.approveCorrection(selectedEngineRequest.subject_id, { reason: reason ?? "Approved from Approvals page." });
        if (engineAction === "reject") return await attendanceApi.rejectCorrection(selectedEngineRequest.subject_id, { reason: reason ?? "" });
        if (engineAction === "cancel") return await attendanceApi.cancelCorrection(selectedEngineRequest.subject_id, { reason: reason ?? "" });
      }
      if (selectedEngineRequest.operation_type === "ROSTER_CHANGE") {
        if (engineAction === "approve") return await rostersApi.approveChange(selectedEngineRequest.subject_id, { reason: reason ?? "Approved from Approvals page." });
        if (engineAction === "reject") return await rostersApi.rejectChange(selectedEngineRequest.subject_id, { reason: reason ?? "" });
        if (engineAction === "cancel") return await rostersApi.cancelChange(selectedEngineRequest.subject_id, { reason: reason ?? "" });
      }
      if (selectedEngineRequest.operation_type === "PAYROLL_ADJUSTMENT") {
        if (engineAction === "approve") return await payrollApi.approveAdjustment(selectedEngineRequest.subject_id, reason ?? "Approved from Approvals page.");
        if (engineAction === "reject") return await payrollApi.rejectAdjustment(selectedEngineRequest.subject_id, reason ?? "");
        if (engineAction === "cancel") return await payrollApi.cancelAdjustment(selectedEngineRequest.subject_id, reason ?? "");
      }
      if (selectedEngineRequest.operation_type === "ADVANCE_SALARY_REQUEST") {
        if (engineAction === "approve") return await advancesApi.approveSalaryRequest(selectedEngineRequest.subject_id, reason ?? "Approved from Approvals page.");
        if (engineAction === "reject") return await advancesApi.rejectSalaryRequest(selectedEngineRequest.subject_id, reason ?? "");
        if (engineAction === "cancel") return await advancesApi.cancelSalaryRequest(selectedEngineRequest.subject_id, reason ?? "");
      }
      if (selectedEngineRequest.operation_type === "DOCUMENT_KYC_UPDATE" || selectedEngineRequest.operation_type === "DOCUMENT_APPROVAL") {
        if (engineAction === "approve") return await documentsApi.approveKycRequest(selectedEngineRequest.subject_id, reason ?? "Approved from Approvals page.");
        if (engineAction === "reject") return await documentsApi.rejectKycRequest(selectedEngineRequest.subject_id, reason ?? "");
        if (engineAction === "cancel") return await documentsApi.cancelKycRequest(selectedEngineRequest.subject_id, reason ?? "");
      }
      if (selectedEngineRequest.operation_type === "EMPLOYEE_TRANSFER" || selectedEngineRequest.operation_type === "EMPLOYEE_STRUCTURE_CHANGE") {
        if (engineAction === "approve") return await employeeStructureChangeApi.approve(selectedEngineRequest.subject_id, reason ?? "Approved from Approvals page.");
        if (engineAction === "reject") return await employeeStructureChangeApi.reject(selectedEngineRequest.subject_id, reason ?? "");
        if (engineAction === "cancel") return await employeeStructureChangeApi.cancel(selectedEngineRequest.subject_id, reason ?? "");
      }
      if (selectedEngineRequest.operation_type === "RESIGNATION" || selectedEngineRequest.operation_type === "OFFBOARDING") {
        if (engineAction === "approve") return await employeeExitApi.approve(selectedEngineRequest.subject_id, reason ?? "Approved from Approvals page.");
        if (engineAction === "reject") return await employeeExitApi.reject(selectedEngineRequest.subject_id, reason ?? "");
        if (engineAction === "cancel") return await employeeExitApi.cancel(selectedEngineRequest.subject_id, reason ?? "");
      }
      if (selectedEngineRequest.operation_type === "DISCIPLINARY_ACTION") {
        if (engineAction === "approve") return await disciplineApi.approve(selectedEngineRequest.subject_id, reason ?? "Approved from Approvals page.");
        if (engineAction === "reject") return await disciplineApi.reject(selectedEngineRequest.subject_id, reason ?? "");
        if (engineAction === "cancel") return await disciplineApi.cancel(selectedEngineRequest.subject_id, reason ?? "");
      }
      if (engineAction === "approve") return await approvalsApi.approveEngineRequest(selectedEngineRequest.id);
      if (engineAction === "reject") return await approvalsApi.rejectEngineRequest(selectedEngineRequest.id, reason ?? "");
      if (engineAction === "escalate") return await approvalsApi.escalateEngineRequest(selectedEngineRequest.id, reason ?? "");
      return await approvalsApi.cancelEngineRequest(selectedEngineRequest.id, reason);
    },
    onSuccess: async () => {
      toast.success(
        engineAction === "approve" ? "Approval request approved." :
          engineAction === "reject" ? "Approval request rejected." :
            engineAction === "escalate" ? "Approval request escalated." :
              "Approval request cancelled.",
      );
      setEngineAction(null);
      setSelectedEngineRequest(null);
      await refresh();
    },
    onError: (err) => toast.error(friendlyHrmError(err, "Approval action could not be completed.", "approval")),
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
  const activeQueryError = activeTab === "workflows" ? workflowsQuery.error ?? stepsQuery.error : activeTab === "thresholds" ? thresholdsQuery.error : activeTab === "settings" ? settingsQuery.error : activeTab === "requests" || activeTab === "my-pending" || activeTab === "my-requests" ? engineRequestsQuery.error : listQuery.error;
  const error = activeQueryError ?? approvalMutation.error ?? workflowMutation.error ?? stepMutation.error ?? thresholdMutation.error ?? statusMutation.error;
  const inboxRows = listQuery.data?.data ?? [];
  const engineRows = useMemo(() =>
    (engineRequestsQuery.data?.data ?? []).map((row) => {
      const enabled = row.module_enabled ?? operationModuleEnabled(auth.user, row.operation_type);
      return {
        ...row,
        module_enabled: enabled,
        read_only: row.read_only || !enabled,
        disabled_reason: row.disabled_reason ?? (!enabled ? "Module disabled" : null),
      };
    }),
  [auth.user, engineRequestsQuery.data?.data]);
  const workflowRows = workflowsQuery.data?.data ?? [];
  const thresholdRows = thresholdsQuery.data?.data ?? [];
  const pendingInbox = inboxRows.filter((row) => String(row.status ?? "").toLowerCase().includes("pending")).length;
  const pendingEngine = engineRows.filter((row) => String(row.status ?? "").toLowerCase().includes("pending")).length;
  const manualAssignmentRows = engineRows.filter((row) => String(row.status ?? "").toLowerCase().includes("manual")).length;
  const highPriorityRows = engineRows.filter((row) => {
    const request = row as ApprovalEngineRequest & { priority?: string | null; severity?: string | null };
    return ["high", "critical"].includes(String(request.priority ?? request.severity ?? "").toLowerCase());
  }).length;

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Approval action could not be completed.", "approval")} variant="error" /> : null}
        <ModuleLandingShell>
          <ModuleLandingHeader
            title="Approvals"
            description="Review pending requests across HR, payroll, attendance, documents, lifecycle, and discipline."
            status="Approval workflow"
            actions={(
              <ModuleQuickActions>
                {canViewMyPendingApprovals ? <Button variant="outline" onClick={() => setActiveTab("my-pending")}>My Assigned Approvals</Button> : null}
                {canViewEngineRequests ? <Button variant="outline" onClick={() => setActiveTab("requests")}>All Approval Requests</Button> : null}
                {canViewWorkflows ? <Button variant="outline" onClick={() => setActiveTab("workflows")}>Workflow Setup</Button> : null}
                {canViewSettings ? <Button variant="outline" onClick={() => setActiveTab("settings")}>Settings Summary</Button> : null}
              </ModuleQuickActions>
            )}
          />
          <ModuleSummaryGrid>
            <ModuleSummaryTile label="Pending inbox" value={listQuery.isFetched ? pendingInbox : "—"} helperText={canViewInbox ? "Open Inbox tab to load details." : "Inbox requires approval view permission."} status={pendingInbox ? "warning" : "neutral"} />
            <ModuleSummaryTile label="Approval queue" value={engineRequestsQuery.isFetched ? pendingEngine : "—"} helperText="Open approval queue tab to load details." status={pendingEngine ? "warning" : "neutral"} />
            <ModuleSummaryTile label="High priority" value={engineRequestsQuery.isFetched ? highPriorityRows : "—"} helperText="Open approval queue tab to load details." status={highPriorityRows ? "danger" : "neutral"} />
            <ModuleSummaryTile label="Manual assignment" value={engineRequestsQuery.isFetched ? manualAssignmentRows : "—"} helperText="Open approval queue tab to load details." status={manualAssignmentRows ? "warning" : "neutral"} />
            <ModuleSummaryTile label="Workflows" value={workflowsQuery.isFetched ? (workflowsQuery.data?.pagination?.total ?? workflowRows.length) : "—"} helperText={canViewWorkflows ? "Open Workflows tab to load details." : "Workflow setup requires permission."} />
            <ModuleSummaryTile label="Thresholds" value={thresholdsQuery.isFetched ? (thresholdsQuery.data?.pagination?.total ?? thresholdRows.length) : "—"} helperText={canViewThresholds ? "Open Thresholds tab to load details." : "Threshold setup requires permission."} />
          </ModuleSummaryGrid>
          <ModuleAttentionPanel
            description="Approval workload from visible inbox and engine request rows."
            items={[
              pendingInbox ? `${pendingInbox} inbox approval(s) need action.` : null,
              pendingEngine ? `${pendingEngine} engine approval request(s) are pending in the loaded queue.` : null,
              manualAssignmentRows ? `${manualAssignmentRows} approval request(s) need assignment or manual review.` : null,
              highPriorityRows ? `${highPriorityRows} loaded approval request(s) are high priority.` : null,
            ]}
          />
        </ModuleLandingShell>
        <ApprovalFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab: activeTab }))} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="inbox">Inbox</TabsTrigger>{canViewEngineRequests ? <TabsTrigger value="requests">Approval Requests</TabsTrigger> : null}<TabsTrigger value="my-pending">My Pending</TabsTrigger><TabsTrigger value="my-requests">My Requests</TabsTrigger>{canViewWorkflows ? <TabsTrigger value="workflows">Workflows</TabsTrigger> : null}{canViewThresholds ? <TabsTrigger value="thresholds">Thresholds</TabsTrigger> : null}{canViewSettings ? <TabsTrigger value="settings">Settings Summary</TabsTrigger> : null}</TabsList>
          <TabsContent value="inbox"><ApprovalInboxTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canApprove={has("approvals.approve")} canReject={has("approvals.reject")} canReturn={has("approvals.return")} canCancel={has("approvals.view")} canRetry={has("approvals.approve")} canOverride={has("approvals.override")} canHistory={has("approvals.view_history") || has("approvals.view")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onApprove={(row) => { setSelected(row); setApprovalAction("approve"); }} onReject={(row) => { setSelected(row); setApprovalAction("reject"); }} onReturn={(row) => { setSelected(row); setApprovalAction("return"); }} onCancel={(row) => { setSelected(row); setApprovalAction("cancel"); }} onRetry={(row) => { setSelected(row); setApprovalAction("retry"); }} onOverride={(row) => { setSelected(row); setApprovalAction("override"); }} onHistory={(row) => { setSelected(row); setDrawerOpen(true); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          {(canViewEngineRequests || activeTab === "my-pending" || activeTab === "my-requests") ? <TabsContent value={activeTab === "my-pending" ? "my-pending" : activeTab === "my-requests" ? "my-requests" : "requests"}>
            <ApprovalEngineRequestsTable
              rows={engineRequestsQuery.data?.data ?? []}
              loading={engineRequestsQuery.isLoading}
                canApprove={has("approvals.requests.approve") || has("approvals.department.approve") || has("approvals.hrFinal.approve") || has("approvals.financeFinal.approve") || has("approvals.operationOwner.approve") || has("approvals.operationFinal.approve") || has("documentKyc.requests.approve") || has("documentKyc.requests.finalApprove") || has("employees.structureRequests.review") || has("employees.structureRequests.finalApprove") || has("employeeLifecycle.resignations.review") || has("employeeLifecycle.resignations.finalApprove") || has("employeeLifecycle.offboarding.review") || has("employeeLifecycle.offboarding.finalApprove") || has("employeeDiscipline.actions.review") || has("employeeDiscipline.actions.investigate") || has("employeeDiscipline.actions.finalApprove")}
                canReject={has("approvals.requests.reject") || has("approvals.department.reject") || has("approvals.hrFinal.reject") || has("approvals.financeFinal.reject") || has("approvals.operationOwner.reject") || has("approvals.operationFinal.reject") || has("documentKyc.requests.reject") || has("employees.structureRequests.reject") || has("employeeLifecycle.resignations.reject") || has("employeeLifecycle.offboarding.reject") || has("employeeDiscipline.actions.reject")}
              canCancel={has("approvals.requests.cancel") || has("employeeLifecycle.resignations.cancel") || has("employeeLifecycle.offboarding.cancel") || has("employeeDiscipline.actions.cancel")}
              onView={(row) => { setSelectedEngineRequest(row); toast.info(row.title, row.summary || "Approval request details and timeline are available from the API."); }}
              onApprove={(row) => { setSelectedEngineRequest(row); setEngineAction("approve"); }}
              onReject={(row) => { setSelectedEngineRequest(row); setEngineAction("reject"); }}
              onCancel={(row) => { setSelectedEngineRequest(row); setEngineAction("cancel"); }}
            />
          </TabsContent> : null}
          {canViewWorkflows ? <TabsContent value="workflows">
            {has("approval_workflows.manage") || has("approvals.workflows.manage") ? (
              <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setSelectedWorkflow(null); setWorkflowFormOpen(true); }}><Plus className="h-4 w-4" />Create workflow</Button>
                <Button size="sm" variant="outline" disabled={!selectedWorkflow} onClick={() => { setSelectedStep(null); setStepFormOpen(true); }}><Plus className="h-4 w-4" />Create step</Button>
              </div>
            ) : null}
            <ApprovalWorkflowTable rows={workflowsQuery.data?.data ?? []} loading={workflowsQuery.isLoading} pagination={workflowsQuery.data?.pagination} canManage={has("approval_workflows.manage") || has("approvals.workflows.manage")} onView={(row) => setSelectedWorkflow(row)} onEdit={(row) => { setSelectedWorkflow(row); setWorkflowFormOpen(true); }} onEnable={(row) => { setSelectedWorkflow(row); setStatusAction("enableWorkflow"); }} onDisable={(row) => { setSelectedWorkflow(row); setStatusAction("disableWorkflow"); }} onSteps={(row) => setSelectedWorkflow(row)} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
            <ApprovalStepsTable rows={stepsQuery.data?.data ?? []} loading={stepsQuery.isLoading} canManage={(has("approval_workflows.manage") || has("approvals.workflowSteps.manage")) && Boolean(selectedWorkflow)} onEdit={(row) => { setSelectedStep(row); setStepFormOpen(true); }} onDelete={(row) => { setSelectedStep(row); setStatusAction("deleteStep"); }} />
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
      <ApprovalEngineActionDialog action={engineAction ?? "approve"} open={Boolean(engineAction)} loading={engineMutation.isPending} onOpenChange={(open) => !open && setEngineAction(null)} onSubmit={(payload) => engineMutation.mutate(payload)} />
      <ApprovalWorkflowForm workflow={selectedWorkflow} open={workflowFormOpen} loading={workflowMutation.isPending} error={workflowMutation.error ? friendlyHrmError(workflowMutation.error, "Workflow could not be saved.") : null} onOpenChange={setWorkflowFormOpen} onSubmit={(payload) => workflowMutation.mutate(payload)} />
      <ApprovalStepDialog step={selectedStep} open={stepFormOpen} loading={stepMutation.isPending} error={stepMutation.error ? friendlyHrmError(stepMutation.error, "Approval step could not be saved.") : null} onOpenChange={setStepFormOpen} onSubmit={(payload) => stepMutation.mutate(payload)} />
      <ApprovalThresholdDialog threshold={selectedThreshold} open={thresholdFormOpen} loading={thresholdMutation.isPending} error={thresholdMutation.error ? friendlyHrmError(thresholdMutation.error, "Approval threshold could not be saved.") : null} onOpenChange={setThresholdFormOpen} onSubmit={(payload) => thresholdMutation.mutate(payload)} />
      <ReasonDialog open={Boolean(statusAction)} title="Confirm approval configuration change" description="A reason is required for this approval configuration action." loading={statusMutation.isPending} error={statusMutation.error ? friendlyHrmError(statusMutation.error, "Approval configuration could not be updated.") : null} onOpenChange={(open) => !open && setStatusAction(null)} onSubmit={(reason) => statusMutation.mutate(reason)} />
    </div>
  );
};
