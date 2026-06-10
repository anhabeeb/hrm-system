import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { PendingUniformReturnsTable } from "./PendingUniformReturnsTable";
import { UniformDetailDrawer } from "./UniformDetailDrawer";
import { UniformFilters } from "./UniformFilters";
import { UniformIssueDialog } from "./UniformIssueDialog";
import { UniformIssuesTable } from "./UniformIssuesTable";
import { UniformReturnDialog } from "./UniformReturnDialog";
import { uniformsApi } from "./uniforms.api";
import type { UniformFilters as UniformFilterValues, UniformIssuePayload, UniformRecord, UniformReturnPayload } from "./uniforms.types";

export const UniformsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "issues");
  const [selected, setSelected] = useState<UniformRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewPendingReturns = has("uniforms.pending_return");
  const activeTab = tab === "pending" && canViewPendingReturns ? "pending" : "issues";
  const filters = useMemo<UniformFilterValues>(() => ({
    employee_id: searchParams.get("employee_id") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    uniform_type: searchParams.get("uniform_type") || undefined,
    status: searchParams.get("status") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<UniformFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", activeTab);
    setSearchParams(params);
  };
  const setActiveTab = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    params.set("page", "1");
    setSearchParams(params);
  };
  const listQuery = useQuery({ queryKey: ["uniforms", "list", filters], queryFn: () => uniformsApi.list(filters), enabled: activeTab === "issues" });
  const pendingQuery = useQuery({ queryKey: ["uniforms", "pending", filters], queryFn: () => uniformsApi.pendingReturn(filters), enabled: activeTab === "pending" && canViewPendingReturns });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["uniforms"] });
  const issueMutation = useMutation({ mutationFn: uniformsApi.issue, onSuccess: async () => { setSuccessMessage("Uniform issued successfully."); setIssueOpen(false); await refresh(); } });
  const returnMutation = useMutation({ mutationFn: (payload: UniformReturnPayload) => uniformsApi.returnUniform(selected!.id, payload), onSuccess: async () => { setSuccessMessage("Uniform returned successfully."); setReturnOpen(false); await refresh(); } });
  const activeQueryError = activeTab === "pending" ? pendingQuery.error : listQuery.error;
  const error = activeQueryError ?? issueMutation.error ?? returnMutation.error;

  return (
    <div>
      {has("uniforms.issue") ? <PageActionBar label="Uniforms page actions"><Button onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4" />Issue uniform</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Uniform action could not be completed.")} variant="error" /> : null}
        <UniformFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab: activeTab }))} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="issues">Issues</TabsTrigger>{canViewPendingReturns ? <TabsTrigger value="pending">Pending Returns</TabsTrigger> : null}</TabsList>
          <TabsContent value="issues"><UniformIssuesTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canReturn={has("uniforms.return")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onReturn={(row) => { setSelected(row); setReturnOpen(true); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          {canViewPendingReturns ? <TabsContent value="pending"><PendingUniformReturnsTable rows={pendingQuery.data?.data ?? []} loading={pendingQuery.isLoading} pagination={pendingQuery.data?.pagination} canReturn={has("uniforms.return")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onReturn={(row) => { setSelected(row); setReturnOpen(true); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent> : null}
        </Tabs>
      </div>
      <UniformDetailDrawer uniform={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <UniformIssueDialog open={issueOpen} loading={issueMutation.isPending} error={issueMutation.error ? friendlyHrmError(issueMutation.error, "Uniform could not be issued.") : null} onOpenChange={setIssueOpen} onSubmit={(payload: UniformIssuePayload) => issueMutation.mutate(payload)} />
      <UniformReturnDialog open={returnOpen} loading={returnMutation.isPending} error={returnMutation.error ? friendlyHrmError(returnMutation.error, "Uniform could not be returned.") : null} onOpenChange={setReturnOpen} onSubmit={(payload) => returnMutation.mutate(payload)} />
    </div>
  );
};
