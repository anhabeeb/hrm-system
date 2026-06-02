import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { leaveApi } from "./leave.api";
import { LeaveBalanceAdjustmentDialog } from "./LeaveBalanceAdjustmentDialog";
import { LeaveBalancesTable } from "./LeaveBalancesTable";
import { LeaveCalendarPlaceholder } from "./LeaveCalendarPlaceholder";
import { LeaveFilters } from "./LeaveFilters";
import { LeaveRequestDetailDrawer } from "./LeaveRequestDetailDrawer";
import { LeaveRequestForm } from "./LeaveRequestForm";
import { LeaveRequestsTable } from "./LeaveRequestsTable";
import { LeaveTypesPanel } from "./LeaveTypesPanel";
import type { LeaveBalance, LeaveFilters as LeaveFilterValues, LeaveRequest, LeaveRequestPayload } from "./leave.types";

export const LeavePage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "requests");
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalance | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | "cancel" | null>(null);
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
  const balancesQuery = useQuery({ queryKey: ["leave", "balances", filters], queryFn: () => leaveApi.listBalances(filters) });
  const typesQuery = useQuery({ queryKey: ["leave", "types", filters], queryFn: () => leaveApi.listTypes({ page_size: 100 }) });
  const policiesQuery = useQuery({ queryKey: ["leave", "policies", filters], queryFn: () => leaveApi.listPolicies({ page_size: 100 }) });
  const calendarQuery = useQuery({ queryKey: ["leave", "calendar", filters], queryFn: () => leaveApi.calendar(filters), retry: false });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["leave"] });

  const createMutation = useMutation({
    mutationFn: leaveApi.createRequest,
    onSuccess: async () => { setSuccessMessage("Leave request submitted successfully."); setFormOpen(false); await refresh(); },
  });
  const actionMutation = useMutation<unknown, unknown, { id: string; reason: string }>({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => {
      if (action === "approve") return leaveApi.approveRequest(id, reason);
      if (action === "reject") return leaveApi.rejectRequest(id, reason);
      return leaveApi.cancelRequest(id, reason);
    },
    onSuccess: async () => {
      setSuccessMessage(action === "approve" ? "Leave request approved." : action === "reject" ? "Leave request rejected." : "Leave request cancelled.");
      setAction(null);
      setSelectedRequest(null);
      await refresh();
    },
  });
  const adjustMutation = useMutation({
    mutationFn: ({ employeeId, payload }: Parameters<typeof leaveApi.adjustBalance>[0] extends never ? never : { employeeId: string; payload: Parameters<typeof leaveApi.adjustBalance>[1] }) => leaveApi.adjustBalance(employeeId, payload),
    onSuccess: async () => { setSuccessMessage("Leave balance adjusted successfully."); setSelectedBalance(null); await refresh(); },
  });

  const canCreate = auth.hasPermission("leave.create");
  const canApprove = auth.hasPermission("leave.approve");
  const canReject = auth.hasPermission("leave.reject");
  const canCancel = auth.hasAnyPermission(["leave.cancel", "leave.edit"]);
  const canAdjust = auth.hasAnyPermission(["leave.manage_balances", "leave_policy_override.manage"]);
  const actionError = createMutation.error ?? actionMutation.error ?? adjustMutation.error;

  return (
    <div>
      <PageHeader title="Leave" description="Manage leave requests, balances, approvals, and leave policies." />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {actionError ? <InlineAlert title={friendlyHrmError(actionError, "Leave action could not be completed.", "leave")} variant="error" /> : null}
        {(requestsQuery.isError || balancesQuery.isError) ? <InlineAlert title="Leave data could not be loaded." variant="error" /> : null}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-base font-semibold">Leave operations</h2><p className="text-sm text-muted-foreground">Backend-paginated lists with reason-based HR actions.</p></div>
          {canCreate ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />New request</Button> : null}
        </div>
        <LeaveFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab }))} />
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="requests">Requests</TabsTrigger><TabsTrigger value="balances">Balances</TabsTrigger><TabsTrigger value="calendar">Calendar</TabsTrigger><TabsTrigger value="types">Leave Types / Policies</TabsTrigger></TabsList>
          <TabsContent value="requests"><LeaveRequestsTable rows={requestsQuery.data?.data ?? []} loading={requestsQuery.isLoading} pagination={requestsQuery.data?.pagination} canApprove={canApprove} canReject={canReject} canCancel={canCancel} onView={(row) => { setSelectedRequest(row); setDrawerOpen(true); }} onApprove={(row) => { setSelectedRequest(row); setAction("approve"); }} onReject={(row) => { setSelectedRequest(row); setAction("reject"); }} onCancel={(row) => { setSelectedRequest(row); setAction("cancel"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          <TabsContent value="balances"><LeaveBalancesTable rows={balancesQuery.data?.data ?? []} loading={balancesQuery.isLoading} pagination={balancesQuery.data?.pagination} canAdjust={canAdjust} onAdjust={setSelectedBalance} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          <TabsContent value="calendar"><LeaveCalendarPlaceholder rows={calendarQuery.data?.data.calendar} /></TabsContent>
          <TabsContent value="types"><LeaveTypesPanel types={typesQuery.data?.data ?? []} policies={policiesQuery.data?.data ?? []} loading={typesQuery.isLoading || policiesQuery.isLoading} /></TabsContent>
        </Tabs>
      </div>
      <LeaveRequestDetailDrawer request={selectedRequest} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <LeaveRequestForm open={formOpen} loading={createMutation.isPending} error={createMutation.error ? friendlyHrmError(createMutation.error, "Leave request could not be submitted.", "leave") : null} onOpenChange={setFormOpen} onSubmit={(payload: LeaveRequestPayload) => createMutation.mutate(payload)} />
      <ReasonDialog open={Boolean(action)} title={action === "approve" ? "Approve leave request" : action === "reject" ? "Reject leave request" : "Cancel leave request"} description="A reason is required for this leave action." confirmLabel={action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Cancel request"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Leave action could not be completed.", "leave") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => selectedRequest && actionMutation.mutate({ id: selectedRequest.id, reason })} />
      <LeaveBalanceAdjustmentDialog balance={selectedBalance} loading={adjustMutation.isPending} error={adjustMutation.error ? friendlyHrmError(adjustMutation.error, "Leave balance could not be adjusted.", "leave") : null} onOpenChange={(open) => !open && setSelectedBalance(null)} onSubmit={(employeeId, payload) => adjustMutation.mutate({ employeeId, payload })} />
    </div>
  );
};
