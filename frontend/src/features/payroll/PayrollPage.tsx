import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calculator, Plus } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { useToast } from "@/components/feedback/useToast";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { ModuleAttentionPanel, ModuleLandingHeader, ModuleLandingShell, ModuleQuickActions, ModuleSummaryGrid, ModuleSummaryTile } from "@/components/module-landing";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { isModuleEnabled } from "@/lib/features";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { payrollApi } from "./payroll.api";
import { PayrollActionDialog } from "./PayrollActionDialog";
import { PayrollAdjustmentDetailDrawer } from "./PayrollAdjustmentDetailDrawer";
import { PayrollAdjustmentDialog } from "./PayrollAdjustmentDialog";
import { PayrollAdjustmentsTable } from "./PayrollAdjustmentsTable";
import { PayrollExceptionsTable } from "./PayrollExceptionsTable";
import { PayrollFilters } from "./PayrollFilters";
import { PayrollFlowStepper } from "./PayrollFlowStepper";
import { PayrollItemDetailDrawer } from "./PayrollItemDetailDrawer";
import { PayrollItemsTable } from "./PayrollItemsTable";
import { PayrollRunDetailDrawer } from "./PayrollRunDetailDrawer";
import { PayrollRunForm } from "./PayrollRunForm";
import { PayrollRunsTable } from "./PayrollRunsTable";
import { EmployeeAttendanceCalendarWidget } from "@/features/attendance-calendar/EmployeeAttendanceCalendarWidget";
import { usePayrollSubFeatures } from "./usePayrollSubFeatures";
import type { PayrollAdjustment, PayrollCalculatePayload, PayrollException, PayrollFilters as PayrollFilterValues, PayrollItem, PayrollRun } from "./payroll.types";

type PayrollAction = "recalculate" | "submit" | "approve" | "reject" | "finalize" | "resolveException" | null;
type PayrollAdjustmentAction = "approveAdjustment" | "rejectAdjustment" | "cancelAdjustment" | "applyAdjustment" | null;

export const PayrollPage = () => {
  const auth = useAuth();
  const payrollSubFeatures = usePayrollSubFeatures();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "runs");
  const [formOpen, setFormOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [selectedItem, setSelectedItem] = useState<PayrollItem | null>(null);
  const [selectedException, setSelectedException] = useState<PayrollException | null>(null);
  const [selectedAdjustment, setSelectedAdjustment] = useState<PayrollAdjustment | null>(null);
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [adjustmentDrawerOpen, setAdjustmentDrawerOpen] = useState(false);
  const [action, setAction] = useState<PayrollAction>(null);
  const [adjustmentAction, setAdjustmentAction] = useState<PayrollAdjustmentAction>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<PayrollFilterValues>(() => ({
    payroll_month: searchParams.get("payroll_month") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    status: searchParams.get("status") || undefined,
    severity: searchParams.get("severity") || undefined,
    exception_type: searchParams.get("exception_type") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<PayrollFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", tab);
    setSearchParams(params);
  };
  const setActiveTab = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    params.set("page", "1");
    setSearchParams(params);
  };

  const runsQuery = useQuery({ queryKey: ["payroll", "runs", filters], queryFn: () => payrollApi.list(filters) });
  const itemsQuery = useQuery({ queryKey: ["payroll", "items", selectedRun?.id, filters], queryFn: () => payrollApi.listItems(selectedRun!.id, filters), enabled: Boolean(selectedRun?.id) });
  const exceptionsQuery = useQuery({ queryKey: ["payroll", "exceptions", selectedRun?.id, filters], queryFn: () => payrollApi.listExceptions(selectedRun!.id, filters), enabled: Boolean(selectedRun?.id) });
  const adjustmentsQuery = useQuery({ queryKey: ["payroll", "adjustments", filters], queryFn: () => payrollApi.listAdjustments(filters), enabled: tab === "adjustments" });
  const adjustmentTimelineQuery = useQuery({
    queryKey: ["payroll", "adjustment-timeline", selectedAdjustment?.id],
    queryFn: () => payrollApi.adjustmentTimeline(selectedAdjustment!.id),
    enabled: Boolean(selectedAdjustment?.id && adjustmentDrawerOpen),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["payroll"] });

  const calculateMutation = useMutation({
    mutationFn: payrollApi.calculate,
    onSuccess: async () => { setSuccessMessage("Payroll calculated successfully."); setFormOpen(false); await refresh(); },
  });
  const actionMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }: { reason: string }) => {
      if (action === "resolveException" && selectedRun && selectedException) return payrollApi.resolveException(selectedRun.id, selectedException.id, reason);
      if (!selectedRun) throw new Error("Select a payroll run first.");
      if (action === "recalculate") return payrollApi.recalculate(selectedRun.id, reason);
      if (action === "submit") return payrollApi.submitApproval(selectedRun.id, reason);
      if (action === "approve") return payrollApi.approve(selectedRun.id, reason);
      if (action === "reject") return payrollApi.reject(selectedRun.id, reason);
      if (action === "finalize") return payrollApi.finalize(selectedRun.id, reason);
      throw new Error("Select a payroll action first.");
    },
    onSuccess: async () => {
      const messages: Record<Exclude<PayrollAction, null>, string> = {
        recalculate: "Payroll recalculated successfully.",
        submit: "Payroll submitted for approval.",
        approve: "Payroll approved.",
        reject: "Payroll rejected.",
        finalize: "Payroll finalized successfully.",
        resolveException: "Payroll exception resolved.",
      };
      setSuccessMessage(action ? messages[action] : "Payroll action completed successfully.");
      setAction(null);
      setSelectedException(null);
      await refresh();
    },
  });
  const adjustmentMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!selectedAdjustment || !adjustmentAction) throw new Error("Select a payroll adjustment first.");
      if (adjustmentAction === "approveAdjustment") return payrollApi.approveAdjustment(selectedAdjustment.id, reason || "Approved from payroll adjustments page.");
      if (adjustmentAction === "rejectAdjustment") return payrollApi.rejectAdjustment(selectedAdjustment.id, reason);
      if (adjustmentAction === "cancelAdjustment") return payrollApi.cancelAdjustment(selectedAdjustment.id, reason);
      return payrollApi.applyAdjustment(selectedAdjustment.id, reason);
    },
    onSuccess: async () => {
      toast.success(
        adjustmentAction === "approveAdjustment" ? "Payroll adjustment approved." :
          adjustmentAction === "rejectAdjustment" ? "Payroll adjustment rejected." :
            adjustmentAction === "cancelAdjustment" ? "Payroll adjustment cancelled." :
              "Payroll adjustment apply action completed.",
      );
      setAdjustmentAction(null);
      await refresh();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Payroll adjustment action could not be completed.", "payroll")),
  });

  const error = runsQuery.error ?? itemsQuery.error ?? exceptionsQuery.error ?? adjustmentsQuery.error ?? calculateMutation.error ?? actionMutation.error ?? adjustmentMutation.error;
  const hasPayrollPermission = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canCalculate = payrollSubFeatures.salaryProcessingEnabled && hasPayrollPermission("payroll.calculate");
  const canCreateAdjustment = payrollSubFeatures.manualDeductionsEnabled && (hasPayrollPermission("payroll.adjustments.create") || hasPayrollPermission("payroll.adjustments.createForOthers"));
  const canRecalculate = payrollSubFeatures.salaryProcessingEnabled && hasPayrollPermission("payroll.recalculate");
  const canSubmitForApproval = payrollSubFeatures.approvalsEnabled && hasPayrollPermission("payroll.review");
  const canApprove = payrollSubFeatures.approvalsEnabled && hasPayrollPermission("payroll.approve");
  const canReject = payrollSubFeatures.approvalsEnabled && hasPayrollPermission("payroll.reject");
  const canFinalize = payrollSubFeatures.salaryProcessingEnabled && hasPayrollPermission("payroll.finalize");
  const canResolve = auth.hasPermission("payroll.resolve_exceptions");
  const canApproveAdjustment = payrollSubFeatures.approvalsEnabled && (hasPayrollPermission("payroll.adjustments.approve") || hasPayrollPermission("payroll.adjustments.review") || hasPayrollPermission("payroll.adjustments.finalApprove") || hasPayrollPermission("approvals.department.approve") || hasPayrollPermission("approvals.financeFinal.approve"));
  const canRejectAdjustment = payrollSubFeatures.approvalsEnabled && (hasPayrollPermission("payroll.adjustments.reject") || hasPayrollPermission("approvals.department.reject") || hasPayrollPermission("approvals.financeFinal.reject"));
  const canCancelAdjustment = hasPayrollPermission("payroll.adjustments.cancel") || hasPayrollPermission("payroll.adjustments.cancelAny");
  const canApplyAdjustment = payrollSubFeatures.manualDeductionsEnabled && hasPayrollPermission("payroll.adjustments.apply");
  const canViewAttendanceReview =
    isModuleEnabled(auth.user, "payroll") &&
    isModuleEnabled(auth.user, "attendance") &&
    auth.hasAnyPermission(["payroll.attendanceReview.view", "payroll.view"]);
  const canUsePayrollAdjustments = payrollSubFeatures.manualDeductionsEnabled && isModuleEnabled(auth.user, "payroll_adjustments") && (canCreateAdjustment || auth.hasAnyPermission(["payroll.adjustments.view", "payroll.adjustments.review", "payroll.view"]));
  const visibleTab = tab === "attendance-review" && !canViewAttendanceReview ? "runs" : tab === "adjustments" && !canUsePayrollAdjustments ? "runs" : tab;

  const actionCopy = {
    recalculate: ["Recalculate payroll", "Recalculate this draft payroll run using current attendance, leave, and deduction data.", "Recalculate"],
    submit: ["Submit payroll for approval", "Submit this company-wide payroll run for approval.", "Submit"],
    approve: ["Approve payroll", "Approve this payroll run after review.", "Approve"],
    reject: ["Reject payroll", "Reject this payroll run and send it back for correction.", "Reject"],
    finalize: ["Finalize payroll", "Finalize this payroll run, apply approved repayment deductions, create payslip snapshots, and prevent further payroll-impacting edits.", "Finalize payroll"],
    resolveException: ["Resolve payroll exception", "Record the resolution notes for this payroll exception.", "Resolve"],
  } as const;
  const selectedActionCopy = action ? actionCopy[action] : ["Payroll action", "A reason is required.", "Continue"];
  const runRows = runsQuery.data?.data ?? [];
  const adjustmentRows = adjustmentsQuery.data?.data ?? [];
  const exceptionRows = exceptionsQuery.data?.data ?? [];
  const currentRun = selectedRun ?? runRows[0] ?? null;
  const currentRunSummary = currentRun as (PayrollRun & { period_label?: string | null; pay_date?: string | null }) | null;
  const pendingAdjustments = adjustmentRows.filter((row) => String(row.status ?? "").toLowerCase().includes("pending")).length;
  const unresolvedExceptions = exceptionRows.filter((row) => String(row.status ?? "").toLowerCase() !== "resolved").length;
  const finalizedRuns = runRows.filter((row) => String(row.status ?? "").toLowerCase().includes("final")).length;

  return (
    <div>
      {canCalculate || canCreateAdjustment ? (
        <PageActionBar label="Payroll page actions">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canUsePayrollAdjustments && canCreateAdjustment ? <Button variant="outline" onClick={() => setAdjustmentOpen(true)}><Plus className="h-4 w-4" />Request adjustment</Button> : null}
            {canCalculate ? <Button onClick={() => setFormOpen(true)}><Calculator className="h-4 w-4" />Calculate draft</Button> : null}
          </div>
        </PageActionBar>
      ) : null}
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Payroll action could not be completed.", "payroll")} variant="error" /> : null}
        {!payrollSubFeatures.salaryProcessingEnabled ? <InlineAlert title="Salary Processing is disabled. Payroll run calculation, recalculation, and finalization actions are hidden." /> : null}
        {!payrollSubFeatures.manualDeductionsEnabled ? <InlineAlert title="Manual Deductions are disabled. Payroll adjustment creation and application actions are hidden." /> : null}
        {!payrollSubFeatures.approvalsEnabled ? <InlineAlert title="Payroll Approvals are disabled. Submit, approve, and reject payroll actions are hidden." /> : null}
        <ModuleLandingShell>
          <ModuleLandingHeader
            title="Payroll"
            description="Prepare payroll, review attendance, adjustments, advances, and payslips."
            status="Payroll readiness"
            actions={(
              <ModuleQuickActions>
                {canViewAttendanceReview ? <Button variant="outline" onClick={() => setActiveTab("attendance-review")}>Payroll Attendance Review</Button> : null}
                {canUsePayrollAdjustments ? <Button variant="outline" onClick={() => canCreateAdjustment ? setAdjustmentOpen(true) : setActiveTab("adjustments")}><Plus className="h-4 w-4" />Payroll Adjustments</Button> : null}
                {canCalculate ? <Button onClick={() => setFormOpen(true)}><Calculator className="h-4 w-4" />Create Payroll Run</Button> : null}
              </ModuleQuickActions>
            )}
          />
          <ModuleSummaryGrid>
            <ModuleSummaryTile label="Current payroll period" value={currentRunSummary?.payroll_month ?? currentRunSummary?.period_label ?? "Not configured"} helperText="Latest visible run" />
            <ModuleSummaryTile label="Pay date" value={currentRunSummary?.pay_date ?? "Not configured"} />
            <ModuleSummaryTile label="Payroll status" value={currentRun?.status ?? "No visible run"} status={currentRun?.status ? "info" : "neutral"} />
            {payrollSubFeatures.manualDeductionsEnabled ? <ModuleSummaryTile label="Pending adjustments" value={adjustmentsQuery.isFetched ? pendingAdjustments : "—"} helperText={adjustmentsQuery.isFetched ? "Loaded adjustment rows" : "Open the Adjustments tab to load details."} status={pendingAdjustments ? "warning" : "neutral"} /> : null}
            <ModuleSummaryTile label="Review blockers" value={selectedRun ? unresolvedExceptions : "—"} helperText={selectedRun ? "Exceptions for selected run" : "Select a payroll run to load exception blockers."} status={unresolvedExceptions ? "danger" : "neutral"} />
            <ModuleSummaryTile label="Finalized runs" value={finalizedRuns} status={finalizedRuns ? "success" : "neutral"} />
          </ModuleSummaryGrid>
          <ModuleAttentionPanel
            description="Payroll readiness signals from selected and visible payroll records."
            items={[
              selectedRun ? null : "Select a payroll run to load items and exception blockers.",
              unresolvedExceptions ? `${unresolvedExceptions} payroll exception(s) need review for the selected run.` : null,
              payrollSubFeatures.manualDeductionsEnabled && pendingAdjustments ? `${pendingAdjustments} loaded payroll adjustment(s) are pending.` : null,
              canViewAttendanceReview ? "Attendance review is available before final payroll processing." : null,
            ]}
          />
        </ModuleLandingShell>
        <PayrollFlowStepper status={selectedRun?.status} />
        <PayrollFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab }))} />
        <Tabs value={visibleTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="runs">Runs</TabsTrigger><TabsTrigger value="items">Items</TabsTrigger><TabsTrigger value="exceptions">Exceptions</TabsTrigger>{canUsePayrollAdjustments ? <TabsTrigger value="adjustments">Adjustments</TabsTrigger> : null}{canViewAttendanceReview ? <TabsTrigger value="attendance-review">Attendance Review</TabsTrigger> : null}</TabsList>
          <TabsContent value="runs">
            <PayrollRunsTable
              rows={runsQuery.data?.data ?? []}
              loading={runsQuery.isLoading}
              pagination={runsQuery.data?.pagination}
              onView={(row) => { setSelectedRun(row); setRunDrawerOpen(true); }}
              onRecalculate={(row) => { setSelectedRun(row); setAction("recalculate"); }}
              onSubmit={(row) => { setSelectedRun(row); setAction("submit"); }}
              onApprove={(row) => { setSelectedRun(row); setAction("approve"); }}
              onReject={(row) => { setSelectedRun(row); setAction("reject"); }}
              onFinalize={(row) => { setSelectedRun(row); setAction("finalize"); }}
              canRecalculate={canRecalculate}
              canSubmit={canSubmitForApproval}
              canApprove={canApprove}
              canReject={canReject}
              canFinalize={canFinalize}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="items">
            {selectedRun ? <PayrollItemsTable rows={itemsQuery.data?.data ?? []} loading={itemsQuery.isLoading} pagination={itemsQuery.data?.pagination} onView={(row) => { setSelectedItem(row); setItemDrawerOpen(true); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /> : <EmptyState title="Select a payroll run" description="Open a payroll run first to review outlet-filtered employee payroll rows." />}
          </TabsContent>
          <TabsContent value="exceptions">
            {selectedRun ? <PayrollExceptionsTable rows={exceptionsQuery.data?.data ?? []} loading={exceptionsQuery.isLoading} pagination={exceptionsQuery.data?.pagination} canResolve={canResolve} onResolve={(row) => { setSelectedException(row); setAction("resolveException"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /> : <EmptyState title="Select a payroll run" description="Open a payroll run first to review exceptions and blockers." />}
          </TabsContent>
          {canUsePayrollAdjustments ? <TabsContent value="adjustments">
            <PayrollAdjustmentsTable
              rows={adjustmentsQuery.data?.data ?? []}
              loading={adjustmentsQuery.isLoading}
              pagination={adjustmentsQuery.data?.pagination}
              canApprove={canApproveAdjustment}
              canReject={canRejectAdjustment}
              canCancel={canCancelAdjustment}
              canApply={canApplyAdjustment}
              onView={(row) => { setSelectedAdjustment(row); setAdjustmentDrawerOpen(true); }}
              onApprove={(row) => { setSelectedAdjustment(row); setAdjustmentAction("approveAdjustment"); }}
              onReject={(row) => { setSelectedAdjustment(row); setAdjustmentAction("rejectAdjustment"); }}
              onCancel={(row) => { setSelectedAdjustment(row); setAdjustmentAction("cancelAdjustment"); }}
              onApply={(row) => { setSelectedAdjustment(row); setAdjustmentAction("applyAdjustment"); }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent> : null}
          {canViewAttendanceReview ? (
            <TabsContent value="attendance-review">
              <EmployeeAttendanceCalendarWidget source="payroll" />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
      <PayrollRunForm open={formOpen} loading={calculateMutation.isPending} error={calculateMutation.error ? friendlyHrmError(calculateMutation.error, "Payroll calculation could not be started.", "payroll") : null} onOpenChange={setFormOpen} onSubmit={(payload: PayrollCalculatePayload) => calculateMutation.mutate(payload)} />
      <PayrollAdjustmentDialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen} currentEmployeeId={auth.user?.employee_id ?? null} canSelectEmployee={hasPayrollPermission("payroll.adjustments.createForOthers")} onSubmitted={refresh} />
      <PayrollRunDetailDrawer run={selectedRun} open={runDrawerOpen} onOpenChange={setRunDrawerOpen} />
      <PayrollItemDetailDrawer item={selectedItem} open={itemDrawerOpen} onOpenChange={setItemDrawerOpen} />
      <PayrollAdjustmentDetailDrawer adjustment={selectedAdjustment} timeline={adjustmentTimelineQuery.data?.data ?? null} open={adjustmentDrawerOpen} onOpenChange={setAdjustmentDrawerOpen} />
      <PayrollActionDialog open={Boolean(action)} title={selectedActionCopy[0]} description={selectedActionCopy[1]} confirmLabel={selectedActionCopy[2]} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Payroll action could not be completed.", "payroll") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => actionMutation.mutate({ reason })} />
      <PayrollActionDialog
        open={Boolean(adjustmentAction)}
        title={adjustmentAction === "approveAdjustment" ? "Approve payroll adjustment" : adjustmentAction === "rejectAdjustment" ? "Reject payroll adjustment" : adjustmentAction === "cancelAdjustment" ? "Cancel payroll adjustment" : "Apply payroll adjustment"}
        description={adjustmentAction === "applyAdjustment" ? "Apply this approved adjustment to the payroll adjustment ledger. Locked payroll records will be sent to manual review." : "A reason is required for this payroll adjustment action."}
        confirmLabel={adjustmentAction === "applyAdjustment" ? "Apply adjustment" : adjustmentAction === "rejectAdjustment" ? "Reject" : adjustmentAction === "cancelAdjustment" ? "Cancel request" : "Approve"}
        loading={adjustmentMutation.isPending}
        error={adjustmentMutation.error ? friendlyHrmError(adjustmentMutation.error, "Payroll adjustment action could not be completed.", "payroll") : null}
        onOpenChange={(open) => !open && setAdjustmentAction(null)}
        onSubmit={(reason) => adjustmentMutation.mutate({ reason })}
      />
    </div>
  );
};
