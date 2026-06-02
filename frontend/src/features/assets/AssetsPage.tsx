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
import { AssetAssignmentDialog } from "./AssetAssignmentDialog";
import { AssetDeductionDialog } from "./AssetDeductionDialog";
import { AssetDeductionsTable } from "./AssetDeductionsTable";
import { AssetDetailDrawer } from "./AssetDetailDrawer";
import { AssetFilters } from "./AssetFilters";
import { AssetForm } from "./AssetForm";
import { AssetLostDamagedDialog } from "./AssetLostDamagedDialog";
import { AssetReturnDialog } from "./AssetReturnDialog";
import { assetsApi } from "./assets.api";
import { AssetsTable } from "./AssetsTable";
import { PendingAssetReturnsTable } from "./PendingAssetReturnsTable";
import type { AssetDeduction, AssetFilters as AssetFilterValues, AssetPayload, AssetRecord } from "./assets.types";

type AssetAction = "assign" | "return" | "lost" | "damaged" | "deduction" | "approveDeduction" | "rejectDeduction" | null;

export const AssetsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "assets");
  const [selected, setSelected] = useState<AssetRecord | null>(null);
  const [selectedDeduction, setSelectedDeduction] = useState<AssetDeduction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssetRecord | null>(null);
  const [action, setAction] = useState<AssetAction>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewDeductions = has("assets.approve_deduction");
  const activeTab = tab === "pending" ? "pending" : tab === "deductions" && canViewDeductions ? "deductions" : "assets";

  const filters = useMemo<AssetFilterValues>(() => ({
    search: searchParams.get("search") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    assigned_to: searchParams.get("assigned_to") || undefined,
    asset_type: searchParams.get("asset_type") || undefined,
    status: searchParams.get("status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<AssetFilterValues>) => {
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

  const assetsQuery = useQuery({ queryKey: ["assets", "list", filters], queryFn: () => assetsApi.list(filters), enabled: activeTab === "assets" });
  const pendingQuery = useQuery({ queryKey: ["assets", "pending", filters], queryFn: () => assetsApi.pendingReturn(filters), enabled: activeTab === "pending" });
  const deductionsQuery = useQuery({ queryKey: ["assets", "deductions", filters], queryFn: () => assetsApi.deductions(filters), enabled: activeTab === "deductions" && canViewDeductions });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["assets"] });
  const formMutation = useMutation({
    mutationFn: (payload: AssetPayload) => editing ? assetsApi.update(editing.id, payload) : assetsApi.create(payload),
    onSuccess: async () => { setSuccessMessage(editing ? "Asset updated successfully." : "Asset created successfully."); setFormOpen(false); setEditing(null); await refresh(); },
  });
  const actionMutation = useMutation<unknown, unknown, unknown>({
    mutationFn: (payload) => {
      if (!selected && !selectedDeduction) throw new Error("Please select an asset first.");
      if (action === "assign") return assetsApi.assign(selected!.id, payload as never);
      if (action === "return") return assetsApi.returnAsset(selected!.id, payload as never);
      if (action === "lost") return assetsApi.markLost(selected!.id, payload as never);
      if (action === "damaged") return assetsApi.markDamaged(selected!.id, payload as never);
      if (action === "deduction") return assetsApi.requestDeduction(selected!.id, payload as never);
      if (action === "approveDeduction") return assetsApi.approveDeduction(selectedDeduction!.id, payload as string);
      return assetsApi.rejectDeduction(selectedDeduction!.id, payload as string);
    },
    onSuccess: async () => {
      const messages: Record<Exclude<AssetAction, null>, string> = {
        assign: "Asset assigned successfully.",
        return: "Asset returned successfully.",
        lost: "Asset marked as lost.",
        damaged: "Asset marked as damaged.",
        deduction: "Asset deduction request submitted successfully.",
        approveDeduction: "Asset deduction approved.",
        rejectDeduction: "Asset deduction rejected.",
      };
      setSuccessMessage(action ? messages[action] : "Asset action completed successfully.");
      setAction(null);
      await refresh();
    },
  });
  const activeQueryError = activeTab === "assets" ? assetsQuery.error : activeTab === "pending" ? pendingQuery.error : deductionsQuery.error;
  const error = activeQueryError ?? formMutation.error ?? actionMutation.error;

  return (
    <div>
      <PageHeader title="Assets" description="Manage employee assets, assignments, returns, and deductions." actions={has("assets.create") ? <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />Create asset</Button> : null} />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Asset action could not be completed.", "deduction")} variant="error" /> : null}
        <AssetFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab: activeTab }))} />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="assets">Assets</TabsTrigger><TabsTrigger value="pending">Assignments / Pending Returns</TabsTrigger>{canViewDeductions ? <TabsTrigger value="deductions">Deductions</TabsTrigger> : null}</TabsList>
          <TabsContent value="assets"><AssetsTable rows={assetsQuery.data?.data ?? []} loading={assetsQuery.isLoading} pagination={assetsQuery.data?.pagination} canEdit={has("assets.edit")} canAssign={has("assets.assign")} canReturn={has("assets.return")} canMarkLost={has("assets.mark_lost")} canMarkDamaged={has("assets.mark_damaged")} canRequestDeduction={has("assets.request_deduction")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onEdit={(row) => { setEditing(row); setFormOpen(true); }} onAssign={(row) => { setSelected(row); setAction("assign"); }} onReturn={(row) => { setSelected(row); setAction("return"); }} onMarkLost={(row) => { setSelected(row); setAction("lost"); }} onMarkDamaged={(row) => { setSelected(row); setAction("damaged"); }} onRequestDeduction={(row) => { setSelected(row); setAction("deduction"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          <TabsContent value="pending"><PendingAssetReturnsTable rows={pendingQuery.data?.data ?? []} loading={pendingQuery.isLoading} pagination={pendingQuery.data?.pagination} canReturn={has("assets.return")} canMarkLost={has("assets.mark_lost")} canMarkDamaged={has("assets.mark_damaged")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onReturn={(row) => { setSelected(row); setAction("return"); }} onMarkLost={(row) => { setSelected(row); setAction("lost"); }} onMarkDamaged={(row) => { setSelected(row); setAction("damaged"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent>
          {canViewDeductions ? <TabsContent value="deductions"><AssetDeductionsTable rows={deductionsQuery.data?.data ?? []} loading={deductionsQuery.isLoading} pagination={deductionsQuery.data?.pagination} canApprove={canViewDeductions} onApprove={(row) => { setSelectedDeduction(row); setAction("approveDeduction"); }} onReject={(row) => { setSelectedDeduction(row); setAction("rejectDeduction"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /></TabsContent> : null}
        </Tabs>
      </div>
      <AssetDetailDrawer asset={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <AssetForm asset={editing} open={formOpen} loading={formMutation.isPending} error={formMutation.error ? friendlyHrmError(formMutation.error, "Asset could not be saved.") : null} onOpenChange={setFormOpen} onSubmit={(payload) => formMutation.mutate(payload)} />
      <AssetAssignmentDialog open={action === "assign"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Asset could not be assigned.") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(payload) => actionMutation.mutate(payload)} />
      <AssetReturnDialog open={action === "return"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Asset could not be returned.") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(payload) => actionMutation.mutate(payload)} />
      <AssetLostDamagedDialog mode={action === "damaged" ? "damaged" : "lost"} open={action === "lost" || action === "damaged"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Asset status could not be updated.", "deduction") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(payload) => actionMutation.mutate(payload)} />
      <AssetDeductionDialog open={action === "deduction"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Asset deduction could not be requested.", "deduction") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(payload) => actionMutation.mutate(payload)} />
      <ReasonDialog open={action === "approveDeduction" || action === "rejectDeduction"} title={action === "approveDeduction" ? "Approve deduction" : "Reject deduction"} description="A reason is required for this asset deduction action." confirmLabel={action === "approveDeduction" ? "Approve" : "Reject"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Asset deduction action could not be completed.", "deduction") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => actionMutation.mutate(reason)} />
    </div>
  );
};
