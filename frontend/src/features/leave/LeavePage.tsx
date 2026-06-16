import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { ModuleAttentionPanel, ModuleLandingHeader, ModuleLandingShell, ModuleQuickActions, ModuleSummaryGrid, ModuleSummaryTile } from "@/components/module-landing";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { leaveApi } from "./leave.api";
import { LeaveAccrualPanel } from "./LeaveAccrualPanel";
import { LeaveApprovalInboxTable } from "./LeaveApprovalInboxTable";
import { LeaveApprovalSettingsPanel } from "./LeaveApprovalSettingsPanel";
import { LeaveApprovalTimelineDialog } from "./LeaveApprovalTimelineDialog";
import { LeaveBalanceActionDialog, type LeaveBalanceAction } from "./LeaveBalanceActionDialog";
import { LeaveBalanceAdjustmentDialog } from "./LeaveBalanceAdjustmentDialog";
import { LeaveBalancesTable } from "./LeaveBalancesTable";
import { LeaveCalendarPlaceholder } from "./LeaveCalendarPlaceholder";
import { LeaveDelegateDialog } from "./LeaveDelegateDialog";
import { LeaveFilters } from "./LeaveFilters";
import { LeaveRequestDetailDrawer } from "./LeaveRequestDetailDrawer";
import { LeaveRequestForm } from "./LeaveRequestForm";
import { LeaveRequestsTable } from "./LeaveRequestsTable";
import { LeaveTransactionsDialog } from "./LeaveTransactionsDialog";
import { LeaveTypesPanel } from "./LeaveTypesPanel";
import { LeaveTypeSettingsDialog } from "./LeaveTypeSettingsDialog";
import type { LeaveAccrualPayload, LeaveAccrualRow, LeaveBalance, LeaveFilters as LeaveFilterValues, LeaveRequest, LeaveRequestPayload, LeaveType, LeaveTypeUpdatePayload } from "./leave.types";

export const LeavePage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "requests");
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [timelineRequest, setTimelineRequest] = useState<LeaveRequest | null>(null);
  const [delegateRequest, setDelegateRequest] = useState<LeaveRequest | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalance | null>(null);
  const [balanceAction, setBalanceAction] = useState<LeaveBalanceAction | null>(null);
  const [actionBalance, setActionBalance] = useState<LeaveBalance | null>(null);
  const [transactionBalance, setTransactionBalance] = useState<LeaveBalance | null>(null);
  const [selectedLeaveType, setSelectedLeaveType] = useState<LeaveType | null>(null);
  const [accrualRows, setAccrualRows] = useState<LeaveAccrualRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | "cancel" | "withdraw" | "escalate" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<LeaveFilterValues>(() => ({
    search: searchParams.get("search") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    leave_type_id: searchParams.get("leave_type_id") || undefined,
    status: searchParams.get("status") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    year: searchParams.get("year") ? Number(searchParams.get("year")) : undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<LeaveFilterValues>) => {
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

  const requestsQuery = useQuery({ queryKey: ["leave", "requests", filters], queryFn: () => leaveApi.listRequests(filters) });
  const approvalInboxQuery = useQuery({ queryKey: ["leave", "approvals", "inbox", filters], queryFn: () => leaveApi.listApprovalInbox(filters) });
  const approvalHistoryQuery = useQuery({ queryKey: ["leave", "approvals", "history", filters], queryFn: () => leaveApi.listApprovalHistory(filters) });
  const balancesQuery = useQuery({ queryKey: ["leave", "balances", filters], queryFn: () => leaveApi.listBalances(filters) });
  const typesQuery = useQuery({ queryKey: ["leave", "types", filters], queryFn: () => leaveApi.listTypes({ page_size: 100 }) });
  const policiesQuery = useQuery({ queryKey: ["leave", "policies", filters], queryFn: () => leaveApi.listPolicies({ page_size: 100 }) });
  const calendarQuery = useQuery({ queryKey: ["leave", "calendar", filters], queryFn: () => leaveApi.calendar(filters), retry: false });
  const transactionsQuery = useQuery({
    queryKey: ["leave", "transactions", transactionBalance?.employee_id, transactionBalance?.leave_type_id, transactionBalance?.year],
    queryFn: () => leaveApi.listBalanceTransactions(transactionBalance!.employee_id, {
      leave_type_id: transactionBalance?.leave_type_id,
      year: transactionBalance?.year,
      page_size: 100,
    }),
    enabled: Boolean(transactionBalance?.employee_id),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["leave"] });

  const createMutation = useMutation({
    mutationFn: leaveApi.createRequest,
    onSuccess: async () => { setSuccessMessage("Leave request submitted successfully."); setFormOpen(false); await refresh(); },
  });
  const actionMutation = useMutation<unknown, unknown, { id: string; reason: string }>({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => {
      if (action === "approve") return leaveApi.approveRequest(id, reason);
      if (action === "reject") return leaveApi.rejectRequest(id, reason);
      if (action === "withdraw") return leaveApi.withdrawRequest(id, reason);
      if (action === "escalate") return leaveApi.escalateRequest(id, reason);
      return leaveApi.cancelRequest(id, reason);
    },
    onSuccess: async () => {
      setSuccessMessage(action === "approve" ? "Leave request approved." : action === "reject" ? "Leave request rejected." : action === "withdraw" ? "Leave request withdrawn." : action === "escalate" ? "Leave approval escalated." : "Leave request cancelled.");
      setAction(null);
      setSelectedRequest(null);
      await refresh();
    },
  });
  const adjustMutation = useMutation({
    mutationFn: ({ employeeId, payload }: Parameters<typeof leaveApi.adjustBalance>[0] extends never ? never : { employeeId: string; payload: Parameters<typeof leaveApi.adjustBalance>[1] }) => leaveApi.adjustBalance(employeeId, payload),
    onSuccess: async () => { setSuccessMessage("Leave balance adjusted successfully."); setSelectedBalance(null); await refresh(); },
  });
  const balanceActionMutation = useMutation({
    mutationFn: async (input: { balance: LeaveBalance; action: LeaveBalanceAction; amount?: number; destinationYear?: number; effectiveDate?: string; reason: string }) => {
      if (input.action === "opening") {
        return leaveApi.setOpeningBalance({
          employee_id: input.balance.employee_id,
          leave_type_id: input.balance.leave_type_id,
          year: input.balance.year,
          opening_balance: input.amount ?? 0,
          reason: input.reason,
        });
      }
      if (input.action === "carry_forward") {
        return leaveApi.carryForwardBalance({
          employee_id: input.balance.employee_id,
          leave_type_id: input.balance.leave_type_id,
          source_year: input.balance.year,
          destination_year: input.destinationYear ?? input.balance.year + 1,
          reason: input.reason,
        });
      }
      if (input.action === "expiry") {
        return leaveApi.expireBalance({
          employee_id: input.balance.employee_id,
          leave_type_id: input.balance.leave_type_id,
          year: input.balance.year,
          expiry_days: input.amount ?? 0,
          effective_date: input.effectiveDate ?? `${input.balance.year}-12-31`,
          reason: input.reason,
        });
      }
      return leaveApi.rebuildBalance(input.balance.employee_id, input.balance.year, input.reason);
    },
    onSuccess: async () => {
      setSuccessMessage("Leave balance action completed successfully.");
      setBalanceAction(null);
      setActionBalance(null);
      await refresh();
    },
  });
  const previewAccrualMutation = useMutation({
    mutationFn: (payload: LeaveAccrualPayload) => leaveApi.previewAccrual(payload),
    onSuccess: (response) => {
      setSuccessMessage("Leave accrual preview generated.");
      setAccrualRows(response.data.rows ?? []);
    },
  });
  const applyAccrualMutation = useMutation({
    mutationFn: (payload: LeaveAccrualPayload) => leaveApi.applyAccrual(payload),
    onSuccess: async (response) => {
      setSuccessMessage(`Leave accrual applied. ${response.data.summary?.applied ?? 0} applied, ${response.data.summary?.skipped ?? 0} skipped.`);
      setAccrualRows([...(response.data.applied ?? []), ...(response.data.skipped ?? [])]);
      await refresh();
    },
  });
  const updateTypeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: LeaveTypeUpdatePayload }) => leaveApi.updateType(id, payload),
    onSuccess: async () => {
      setSuccessMessage("Leave type balance settings updated.");
      setSelectedLeaveType(null);
      await refresh();
    },
  });
  const delegateMutation = useMutation({
    mutationFn: ({ id, delegated_to, reason }: { id: string; delegated_to: string; reason: string }) => leaveApi.delegateRequest(id, { delegated_to, reason }),
    onSuccess: async () => {
      setSuccessMessage("Leave approval delegated.");
      setDelegateRequest(null);
      await refresh();
    },
  });

  const canCreate = auth.hasAnyPermission(["leave.create", "leave.requests.create_for_employee", "approvals.requests.create", "approvals.requests.createForOthers"]);
  const canCreateForOthers = auth.isSuperAdmin || auth.hasAnyPermission(["leave.requests.create_for_employee", "approvals.requests.createForOthers"]);
  const canApprove = auth.hasAnyPermission(["leave.approvals.approve", "leave.approve", "approvals.requests.approve", "approvals.department.approve", "approvals.hrFinal.approve", "approvals.financeFinal.approve"]);
  const canReject = auth.hasAnyPermission(["leave.approvals.reject", "leave.reject", "approvals.requests.reject", "approvals.department.reject", "approvals.hrFinal.reject", "approvals.financeFinal.reject"]);
  const canCancel = auth.hasAnyPermission(["leave.requests.cancel", "leave.cancel", "leave.edit", "approvals.requests.cancel", "approvals.requests.cancelAny"]);
  const canWithdraw = auth.hasAnyPermission(["leave.requests.withdraw", "leave.cancel", "leave.edit", "approvals.requests.cancel"]);
  const canDelegate = auth.hasAnyPermission(["leave.approvals.delegate", "leave.approvals.override"]);
  const canEscalate = auth.hasAnyPermission(["leave.approvals.escalate", "leave.approvals.override"]);
  const canAdjust = auth.hasAnyPermission(["leave.balances.adjust", "leave.manage_balances", "leave_policy_override.manage"]);
  const canApplyAccrual = auth.hasAnyPermission(["leave.accrual.apply", "leave.balances.manage", "leave.manage_balances"]);
  const canManageLeaveTypes = auth.hasAnyPermission(["leave_settings.manage", "leave_policy_limits.edit", "leave_types.enable_disable"]);
  const canManageApprovalSettings = auth.hasAnyPermission(["leave.approvals.settings.manage", "approval_workflows.manage", "leave_settings.manage"]);
  const canViewApprovalInbox = auth.hasAnyPermission(["leave.approvals.view", "leave.approvals.approve", "leave.approve", "approvals.requests.view", "approvals.view"]);
  const canViewBalances = auth.hasAnyPermission(["leave.balances.view", "leave.manage_balances", "leave.view"]);
  const canViewLeaveCalendar = auth.hasAnyPermission(["leave.view", "leave.approvals.view"]);
  const canViewRosterConflictReview = auth.hasFeature("roster") && auth.hasAnyPermission(["rosters.view", "roster.view", "rosters.manage", "rosters.weeklyMatrix.view", "rosters.weeklyMatrix.viewTeam"]);
  const actionError = createMutation.error ?? actionMutation.error ?? delegateMutation.error ?? adjustMutation.error ?? balanceActionMutation.error ?? previewAccrualMutation.error ?? applyAccrualMutation.error ?? updateTypeMutation.error;
  const requestRows = requestsQuery.data?.data ?? [];
  const approvalRows = approvalInboxQuery.data?.data ?? [];
  const balanceRows = balancesQuery.data?.data ?? [];
  const calendarRows = calendarQuery.data?.data.calendar ?? [];
  const pendingLeaveRequests = requestRows.filter((row) => String(row.status ?? "").toLowerCase().includes("pending")).length;
  const approvedThisMonth = requestRows.filter((row) => {
    const request = row as LeaveRequest & { updated_at?: string | null };
    const approvedAt = request.approved_at ?? request.updated_at ?? request.created_at;
    return String(row.status ?? "").toLowerCase().includes("approved") && approvedAt?.slice(0, 7) === new Date().toISOString().slice(0, 7);
  }).length;
  const sickLeaveRows = requestRows.filter((row) => {
    const request = row as LeaveRequest & { leave_type?: string | null };
    return String(request.leave_type_name ?? request.leave_type ?? "").toLowerCase().includes("sick");
  }).length;
  const lowBalanceRows = balanceRows.filter((row) => {
    const balance = row as LeaveBalance & { balance_days?: number | null; remaining_days?: number | null };
    return Number(balance.balance_days ?? balance.available_days ?? balance.remaining_days ?? 0) <= 2;
  }).length;
  const openBalanceAction = (nextAction: LeaveBalanceAction) => (row: LeaveBalance) => {
    setActionBalance(row);
    setBalanceAction(nextAction);
  };

  return (
    <div>
      {canCreate ? <PageActionBar label="Leave page actions"><Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />New request</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {actionError ? <InlineAlert title={friendlyHrmError(actionError, "Leave action could not be completed.", "leave")} variant="error" /> : null}
        {(requestsQuery.isError || balancesQuery.isError) ? <InlineAlert title="Leave data could not be loaded." variant="error" /> : null}
        <ModuleLandingShell>
          <ModuleLandingHeader
            title="Leave"
            description="Review leave requests, balances, sick leave, and long leave."
            status="Leave"
            actions={(
              <ModuleQuickActions>
                {canCreate ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />Create Leave Request</Button> : null}
                {canViewApprovalInbox ? <Button variant="outline" onClick={() => setActiveTab("approvals")}>Open Pending Approvals</Button> : null}
                {canViewBalances ? <Button variant="outline" onClick={() => setActiveTab("balances")}>View Leave Balances</Button> : null}
                {canViewLeaveCalendar ? <Button variant="outline" onClick={() => setActiveTab("calendar")}>Leave Calendar</Button> : null}
              </ModuleQuickActions>
            )}
          />
          <ModuleSummaryGrid>
            <ModuleSummaryTile label="Pending requests" value={pendingLeaveRequests} status={pendingLeaveRequests ? "warning" : "success"} />
            <ModuleSummaryTile label="Approval inbox" value={approvalRows.length} helperText="Visible assigned approvals" status={approvalRows.length ? "warning" : "success"} />
            <ModuleSummaryTile label="Approved this month" value={approvedThisMonth} />
            <ModuleSummaryTile label="Sick leave rows" value={sickLeaveRows} helperText="From visible requests" />
            <ModuleSummaryTile label="Low balances" value={lowBalanceRows} status={lowBalanceRows ? "warning" : "success"} />
            <ModuleSummaryTile label="Calendar entries" value={calendarRows.length} helperText="Loaded leave calendar rows" />
          </ModuleSummaryGrid>
          <ModuleAttentionPanel
            description="Current leave workload based on your scoped rows."
            items={[
              approvalRows.length ? `${approvalRows.length} leave approval item(s) are waiting in your inbox.` : null,
              pendingLeaveRequests ? `${pendingLeaveRequests} visible leave request(s) are still pending.` : null,
              lowBalanceRows ? `${lowBalanceRows} visible leave balance row(s) are low.` : null,
              canViewRosterConflictReview ? "Roster conflict review remains available from the Roster module." : null,
            ]}
          />
        </ModuleLandingShell>
        <LeaveFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab }))} />
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="requests">Requests</TabsTrigger><TabsTrigger value="approvals">Approvals</TabsTrigger><TabsTrigger value="approval-history">Approval History</TabsTrigger><TabsTrigger value="balances">Balances</TabsTrigger><TabsTrigger value="accrual">Accrual</TabsTrigger><TabsTrigger value="calendar">Calendar</TabsTrigger><TabsTrigger value="types">Leave Types / Policies</TabsTrigger><TabsTrigger value="approval-settings">Approval Settings</TabsTrigger></TabsList>
          <TabsContent value="requests"><LeaveRequestsTable rows={requestsQuery.data?.data ?? []} loading={requestsQuery.isLoading} pagination={requestsQuery.data?.pagination} canApprove={canApprove} canReject={canReject} canCancel={canCancel} canWithdraw={canWithdraw} canEscalate={canEscalate} onView={(row) => { setSelectedRequest(row); setDrawerOpen(true); }} onTimeline={setTimelineRequest} onApprove={(row) => { setSelectedRequest(row); setAction("approve"); }} onReject={(row) => { setSelectedRequest(row); setAction("reject"); }} onCancel={(row) => { setSelectedRequest(row); setAction("cancel"); }} onWithdraw={(row) => { setSelectedRequest(row); setAction("withdraw"); }} onEscalate={(row) => { setSelectedRequest(row); setAction("escalate"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          <TabsContent value="approvals"><LeaveApprovalInboxTable rows={approvalInboxQuery.data?.data ?? []} loading={approvalInboxQuery.isLoading} pagination={approvalInboxQuery.data?.pagination} canApprove={canApprove} canReject={canReject} canDelegate={canDelegate} onView={setTimelineRequest} onApprove={(row) => { setSelectedRequest(row); setAction("approve"); }} onReject={(row) => { setSelectedRequest(row); setAction("reject"); }} onDelegate={setDelegateRequest} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          <TabsContent value="approval-history"><LeaveRequestsTable rows={approvalHistoryQuery.data?.data ?? []} loading={approvalHistoryQuery.isLoading} pagination={approvalHistoryQuery.data?.pagination} canApprove={false} canReject={false} canCancel={false} canWithdraw={false} canEscalate={false} onView={setTimelineRequest} onTimeline={setTimelineRequest} onApprove={() => undefined} onReject={() => undefined} onCancel={() => undefined} onWithdraw={() => undefined} onEscalate={() => undefined} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          <TabsContent value="balances"><LeaveBalancesTable rows={balancesQuery.data?.data ?? []} loading={balancesQuery.isLoading} pagination={balancesQuery.data?.pagination} canAdjust={canAdjust} onAdjust={setSelectedBalance} onOpening={openBalanceAction("opening")} onCarryForward={openBalanceAction("carry_forward")} onExpire={openBalanceAction("expiry")} onRebuild={openBalanceAction("rebuild")} onTransactions={setTransactionBalance} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          <TabsContent value="accrual"><LeaveAccrualPanel rows={accrualRows} loading={previewAccrualMutation.isPending} applying={applyAccrualMutation.isPending} error={actionError ? friendlyHrmError(actionError, "Leave accrual could not be completed.", "leave") : null} success={successMessage} canApply={canApplyAccrual} onPreview={(payload) => previewAccrualMutation.mutate(payload)} onApply={(payload) => applyAccrualMutation.mutate(payload)} /></TabsContent>
          <TabsContent value="calendar"><LeaveCalendarPlaceholder rows={calendarQuery.data?.data.calendar} /></TabsContent>
          <TabsContent value="types"><LeaveTypesPanel types={typesQuery.data?.data ?? []} policies={policiesQuery.data?.data ?? []} loading={typesQuery.isLoading || policiesQuery.isLoading} canManage={canManageLeaveTypes} onEditType={setSelectedLeaveType} /></TabsContent>
          <TabsContent value="approval-settings"><LeaveApprovalSettingsPanel canManage={canManageApprovalSettings} /></TabsContent>
        </Tabs>
      </div>
      <LeaveRequestDetailDrawer request={selectedRequest} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <LeaveApprovalTimelineDialog request={timelineRequest} open={Boolean(timelineRequest)} onOpenChange={(open) => !open && setTimelineRequest(null)} />
      <LeaveRequestForm
        open={formOpen}
        loading={createMutation.isPending}
        error={createMutation.error ? friendlyHrmError(createMutation.error, "Leave request could not be submitted.", "leave") : null}
        canCreateForOthers={canCreateForOthers}
        currentEmployeeId={auth.user?.employee_id ?? null}
        currentEmployeeName={auth.user?.full_name ?? null}
        onOpenChange={setFormOpen}
        onSubmit={(payload: LeaveRequestPayload) => createMutation.mutate(payload)}
      />
      <ReasonDialog open={Boolean(action)} title={action === "approve" ? "Approve leave request" : action === "reject" ? "Reject leave request" : action === "withdraw" ? "Withdraw leave request" : action === "escalate" ? "Escalate leave approval" : "Cancel leave request"} description="A reason is required for this leave action." confirmLabel={action === "approve" ? "Approve" : action === "reject" ? "Reject" : action === "withdraw" ? "Withdraw request" : action === "escalate" ? "Escalate approval" : "Cancel request"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Leave action could not be completed.", "leave") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => selectedRequest && actionMutation.mutate({ id: selectedRequest.id, reason })} />
      <LeaveDelegateDialog request={delegateRequest} loading={delegateMutation.isPending} error={delegateMutation.error ? friendlyHrmError(delegateMutation.error, "Leave approval could not be delegated.", "leave") : null} onOpenChange={(open) => !open && setDelegateRequest(null)} onSubmit={(delegated_to, reason) => delegateRequest && delegateMutation.mutate({ id: delegateRequest.id, delegated_to, reason })} />
      <LeaveBalanceAdjustmentDialog balance={selectedBalance} loading={adjustMutation.isPending} error={adjustMutation.error ? friendlyHrmError(adjustMutation.error, "Leave balance could not be adjusted.", "leave") : null} onOpenChange={(open) => !open && setSelectedBalance(null)} onSubmit={(employeeId, payload) => adjustMutation.mutate({ employeeId, payload })} />
      <LeaveBalanceActionDialog action={balanceAction} balance={actionBalance} loading={balanceActionMutation.isPending} error={balanceActionMutation.error ? friendlyHrmError(balanceActionMutation.error, "Leave balance action could not be completed.", "leave") : null} onOpenChange={(open) => { if (!open) { setBalanceAction(null); setActionBalance(null); } }} onSubmit={(payload) => actionBalance && balanceActionMutation.mutate({ balance: actionBalance, action: balanceAction!, ...payload })} />
      <LeaveTypeSettingsDialog leaveType={selectedLeaveType} loading={updateTypeMutation.isPending} error={updateTypeMutation.error ? friendlyHrmError(updateTypeMutation.error, "Leave type settings could not be updated.", "leave") : null} onOpenChange={(open) => !open && setSelectedLeaveType(null)} onSubmit={(id, payload) => updateTypeMutation.mutate({ id, payload })} />
      <LeaveTransactionsDialog balance={transactionBalance} rows={transactionsQuery.data?.data ?? []} loading={transactionsQuery.isLoading} open={Boolean(transactionBalance)} onOpenChange={(open) => !open && setTransactionBalance(null)} />
    </div>
  );
};
