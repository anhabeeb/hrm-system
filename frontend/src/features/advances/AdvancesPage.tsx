import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { useToast } from "@/components/feedback/useToast";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { AdvanceActionDialog } from "./AdvanceActionDialog";
import { AdvanceDetailDrawer } from "./AdvanceDetailDrawer";
import { AdvanceFilters } from "./AdvanceFilters";
import { AdvanceForm } from "./AdvanceForm";
import { AdvanceSalaryDetailDrawer } from "./AdvanceSalaryDetailDrawer";
import { AdvanceSalaryRequestDialog } from "./AdvanceSalaryRequestDialog";
import { AdvanceSalaryRequestsTable } from "./AdvanceSalaryRequestsTable";
import { advancesApi } from "./advances.api";
import { AdvancesTable } from "./AdvancesTable";
import type { AdvanceFilters as AdvanceFilterValues, AdvancePayment, AdvancePayload, AdvanceSalaryRequest } from "./advances.types";

export const AdvancesPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "salary-requests");
  const [selected, setSelected] = useState<AdvancePayment | null>(null);
  const [selectedSalary, setSelectedSalary] = useState<AdvanceSalaryRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [salaryDrawerOpen, setSalaryDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [salaryFormOpen, setSalaryFormOpen] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [salaryAction, setSalaryAction] = useState<"approve" | "reject" | "cancel" | "executePayment" | null>(null);
  const filters = useMemo<AdvanceFilterValues>(() => ({
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    status: searchParams.get("status") || undefined,
    deduction_month: searchParams.get("deduction_month") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<AdvanceFilterValues>) => {
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
  const listQuery = useQuery({ queryKey: ["advances", "legacy", filters], queryFn: () => advancesApi.list(filters), enabled: tab === "legacy" });
  const salaryQuery = useQuery({ queryKey: ["advances", "salary-requests", filters], queryFn: () => advancesApi.listSalaryRequests(filters), enabled: tab === "salary-requests" });
  const salaryTimelineQuery = useQuery({
    queryKey: ["advances", "salary-request-timeline", selectedSalary?.id],
    queryFn: () => advancesApi.salaryRequestTimeline(selectedSalary!.id),
    enabled: Boolean(selectedSalary?.id && salaryDrawerOpen),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["advances"] });
  const createMutation = useMutation({
    mutationFn: advancesApi.create,
    onSuccess: async () => {
      toast.success("Advance payment requested successfully.");
      setFormOpen(false);
      await refresh();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Advance could not be created.", "payroll")),
  });
  const actionMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }: { reason: string }) => action === "approve" ? advancesApi.approve(selected!.id, reason) : advancesApi.reject(selected!.id, reason),
    onSuccess: async () => {
      toast.success(action === "approve" ? "Advance payment approved." : "Advance payment rejected.");
      setAction(null);
      await refresh();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Advance action could not be completed.", "payroll")),
  });
  const salaryActionMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }: { reason: string }) => {
      if (!selectedSalary || !salaryAction) throw new Error("Select an advance salary request first.");
      if (salaryAction === "approve") return advancesApi.approveSalaryRequest(selectedSalary.id, reason || "Approved from advances page.");
      if (salaryAction === "reject") return advancesApi.rejectSalaryRequest(selectedSalary.id, reason);
      if (salaryAction === "cancel") return advancesApi.cancelSalaryRequest(selectedSalary.id, reason);
      return advancesApi.executeSalaryPayment(selectedSalary.id, reason);
    },
    onSuccess: async () => {
      toast.success(
        salaryAction === "approve" ? "Advance salary request approved." :
          salaryAction === "reject" ? "Advance salary request rejected." :
            salaryAction === "cancel" ? "Advance salary request cancelled." :
              "Advance salary payment executed.",
      );
      setSalaryAction(null);
      await refresh();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Advance salary action could not be completed.", "payroll")),
  });
  const hasAdvancePermission = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canCreateLegacy = hasAdvancePermission("advances.create");
  const canCreateSalary = hasAdvancePermission("advanceSalary.requests.create") || hasAdvancePermission("advanceSalary.requests.createForOthers");
  const canApproveSalary = hasAdvancePermission("advanceSalary.requests.approve") || hasAdvancePermission("advanceSalary.requests.review") || hasAdvancePermission("advanceSalary.requests.finalApprove") || hasAdvancePermission("approvals.department.approve") || hasAdvancePermission("approvals.financeFinal.approve");
  const canRejectSalary = hasAdvancePermission("advanceSalary.requests.reject") || hasAdvancePermission("approvals.department.reject") || hasAdvancePermission("approvals.financeFinal.reject");
  const canCancelSalary = hasAdvancePermission("advanceSalary.requests.cancel") || hasAdvancePermission("advanceSalary.requests.cancelAny");
  const canExecuteSalary = hasAdvancePermission("advanceSalary.payments.execute") || hasAdvancePermission("approvals.operationExecutor.apply");
  const error = tab === "salary-requests" ? salaryQuery.error ?? salaryActionMutation.error : listQuery.error ?? createMutation.error ?? actionMutation.error;
  return (
    <div>
      {canCreateLegacy || canCreateSalary ? (
        <PageActionBar label="Advances page actions">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canCreateSalary ? <Button onClick={() => setSalaryFormOpen(true)}><Plus className="h-4 w-4" />Request advance salary</Button> : null}
            {canCreateLegacy ? <Button variant="outline" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />New advance</Button> : null}
          </div>
        </PageActionBar>
      ) : null}
      <div className="space-y-4 p-4 md:p-6">
        <AdvanceFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab }))} />
        {error ? <p className="sr-only">{friendlyHrmError(error, "Advance action could not be completed.", "payroll")}</p> : null}
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="salary-requests">Advance salary requests</TabsTrigger><TabsTrigger value="legacy">Legacy advances</TabsTrigger></TabsList>
          <TabsContent value="salary-requests">
            <AdvanceSalaryRequestsTable
              rows={salaryQuery.data?.data ?? []}
              loading={salaryQuery.isLoading}
              pagination={salaryQuery.data?.pagination}
              canApprove={canApproveSalary}
              canReject={canRejectSalary}
              canCancel={canCancelSalary}
              canExecutePayment={canExecuteSalary}
              onView={(row) => { setSelectedSalary(row); setSalaryDrawerOpen(true); }}
              onApprove={(row) => { setSelectedSalary(row); setSalaryAction("approve"); }}
              onReject={(row) => { setSelectedSalary(row); setSalaryAction("reject"); }}
              onCancel={(row) => { setSelectedSalary(row); setSalaryAction("cancel"); }}
              onExecutePayment={(row) => { setSelectedSalary(row); setSalaryAction("executePayment"); }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="legacy">
            <AdvancesTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canApprove={auth.hasPermission("advances.approve")} canReject={auth.hasPermission("advances.reject")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onApprove={(row) => { setSelected(row); setAction("approve"); }} onReject={(row) => { setSelected(row); setAction("reject"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
          </TabsContent>
        </Tabs>
      </div>
      <AdvanceForm open={formOpen} loading={createMutation.isPending} error={createMutation.error ? friendlyHrmError(createMutation.error, "Advance could not be created.", "payroll") : null} onOpenChange={setFormOpen} onSubmit={(payload: AdvancePayload) => createMutation.mutate(payload)} />
      <AdvanceSalaryRequestDialog open={salaryFormOpen} onOpenChange={setSalaryFormOpen} currentEmployeeId={auth.user?.employee_id ?? null} canSelectEmployee={hasAdvancePermission("advanceSalary.requests.createForOthers")} onSubmitted={refresh} />
      <AdvanceDetailDrawer advance={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <AdvanceSalaryDetailDrawer request={selectedSalary} timeline={salaryTimelineQuery.data?.data ?? null} open={salaryDrawerOpen} onOpenChange={setSalaryDrawerOpen} />
      <AdvanceActionDialog open={Boolean(action)} action={action ?? "approve"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Advance action could not be completed.", "payroll") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => actionMutation.mutate({ reason })} />
      <AdvanceActionDialog open={Boolean(salaryAction)} action={salaryAction ?? "approve"} loading={salaryActionMutation.isPending} error={salaryActionMutation.error ? friendlyHrmError(salaryActionMutation.error, "Advance salary action could not be completed.", "payroll") : null} onOpenChange={(open) => !open && setSalaryAction(null)} onSubmit={(reason) => salaryActionMutation.mutate({ reason })} />
    </div>
  );
};
