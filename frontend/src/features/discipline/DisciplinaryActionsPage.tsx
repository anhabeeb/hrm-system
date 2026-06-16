import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { useToast } from "@/components/feedback/useToast";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { ModuleAttentionPanel, ModuleLandingHeader, ModuleLandingShell, ModuleQuickActions, ModuleSummaryGrid, ModuleSummaryTile } from "@/components/module-landing";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { disciplineApi } from "./discipline.api";
import { DisciplinaryActionDetailDrawer } from "./DisciplinaryActionDetailDrawer";
import { DisciplinaryActionDialog } from "./DisciplinaryActionDialog";
import { DisciplinaryActionsTable } from "./DisciplinaryActionsTable";
import type { DisciplinaryAction } from "./discipline.types";

type Action = "approve" | "reject" | "cancel" | "apply" | "acknowledge" | "close" | null;

export const DisciplinaryActionsPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<DisciplinaryAction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const filters = useMemo(() => ({
    status: searchParams.get("status") || undefined,
    severity: searchParams.get("severity") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const listQuery = useQuery({ queryKey: ["disciplinary-actions", filters], queryFn: () => disciplineApi.list(filters) });
  const timelineQuery = useQuery({ queryKey: ["disciplinary-actions", selected?.id, "timeline"], queryFn: () => disciplineApi.timeline(selected!.id), enabled: Boolean(selected?.id && drawerOpen) });
  const tasksQuery = useQuery({ queryKey: ["disciplinary-actions", selected?.id, "tasks"], queryFn: () => disciplineApi.tasks(selected!.id), enabled: Boolean(selected?.id && drawerOpen) });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["disciplinary-actions"] });

  const actionMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!selected || !action) throw new Error("Select a disciplinary action first.");
      if (action === "approve") return disciplineApi.approve(selected.id, reason);
      if (action === "reject") return disciplineApi.reject(selected.id, reason);
      if (action === "cancel") return disciplineApi.cancel(selected.id, reason);
      if (action === "apply") return disciplineApi.apply(selected.id, reason);
      if (action === "acknowledge") return disciplineApi.acknowledge(selected.id, reason);
      return disciplineApi.close(selected.id, reason);
    },
    onSuccess: async () => {
      toast.success("Disciplinary action updated successfully.");
      setAction(null);
      setSelected(null);
      await refresh();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Disciplinary action could not be updated.")),
  });

  const canCreate = has("employeeDiscipline.actions.create") || has("employeeDiscipline.actions.createForOthers");
  const canSelectEmployee = has("employeeDiscipline.actions.createForOthers");
  const canApprove = has("employeeDiscipline.actions.review") || has("employeeDiscipline.actions.investigate") || has("employeeDiscipline.actions.finalApprove") || has("approvals.operationOwner.approve") || has("approvals.operationFinal.approve") || has("approvals.department.approve");
  const canReject = has("employeeDiscipline.actions.reject") || has("approvals.operationOwner.reject") || has("approvals.operationFinal.reject") || has("approvals.department.reject");
  const canCancel = has("employeeDiscipline.actions.cancel") || has("employeeDiscipline.actions.cancelAny");
  const canApply = has("employeeDiscipline.actions.apply") || has("employeeDiscipline.actions.manage") || has("approvals.operationExecutor.apply");
  const canAcknowledge = has("employeeDiscipline.acknowledge") || has("employeeDiscipline.actions.manage");
  const canClose = has("employeeDiscipline.actions.close") || has("employeeDiscipline.actions.manage");
  const currentEmployeeId = auth.user?.employee_id ?? null;
  const error = listQuery.error ?? timelineQuery.error ?? tasksQuery.error;
  const disciplineRows = listQuery.data?.data ?? [];
  const pendingReviews = disciplineRows.filter((row) => ["PENDING_DEPARTMENT_REVIEW", "PENDING_OWNER_REVIEW", "PENDING_INVESTIGATION"].includes(row.status)).length;
  const pendingFinalApprovals = disciplineRows.filter((row) => row.status === "PENDING_FINAL_APPROVAL").length;
  const pendingAcknowledgements = disciplineRows.filter((row) => row.status === "PENDING_ACKNOWLEDGEMENT" || (!row.acknowledged_at && row.acknowledgement_required)).length;
  const highSeverityCases = disciplineRows.filter((row) => ["high", "critical"].includes(String(row.severity ?? "").toLowerCase())).length;
  const closedThisMonth = disciplineRows.filter((row) => {
    const actionRow = row as DisciplinaryAction & { closed_at?: string | null };
    return String(actionRow.status ?? "").toLowerCase() === "closed" && (actionRow.closed_at ?? actionRow.updated_at)?.slice(0, 7) === new Date().toISOString().slice(0, 7);
  }).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {error ? <InlineAlert title={friendlyHrmError(error, "Disciplinary actions could not be loaded.")} variant="error" /> : null}
      <ModuleLandingShell>
        <ModuleLandingHeader
          title="Disciplinary Actions"
          description="Review disciplinary cases, follow-ups, acknowledgements, and official records."
          status="Sensitive employee relations"
          actions={(
            <ModuleQuickActions>
              {canCreate ? <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" />Create Disciplinary Action</Button> : null}
            </ModuleQuickActions>
          )}
        />
        <ModuleSummaryGrid>
          <ModuleSummaryTile label="Pending reviews" value={pendingReviews} status={pendingReviews ? "warning" : "success"} />
          <ModuleSummaryTile label="Final approvals" value={pendingFinalApprovals} status={pendingFinalApprovals ? "warning" : "success"} />
          <ModuleSummaryTile label="Acknowledgements" value={pendingAcknowledgements} status={pendingAcknowledgements ? "warning" : "success"} />
          <ModuleSummaryTile label="Visible cases" value={listQuery.data?.pagination?.total ?? disciplineRows.length} />
          <ModuleSummaryTile label="High severity" value={highSeverityCases} status={highSeverityCases ? "danger" : "neutral"} />
          <ModuleSummaryTile label="Closed this month" value={closedThisMonth} status="success" />
        </ModuleSummaryGrid>
        <ModuleAttentionPanel
          description="Sensitive counts are scoped to disciplinary rows the backend permits you to load."
          items={[
            pendingAcknowledgements ? `${pendingAcknowledgements} acknowledgement(s) are pending receipt confirmation.` : null,
            highSeverityCases ? `${highSeverityCases} high or critical case(s) are visible in this view.` : null,
            pendingFinalApprovals ? `${pendingFinalApprovals} case(s) are pending final approval.` : null,
            "Investigation notes remain inside authorized detail views only.",
          ]}
        />
      </ModuleLandingShell>
      <DisciplinaryActionsTable
        rows={listQuery.data?.data ?? []}
        loading={listQuery.isLoading}
        pagination={listQuery.data?.pagination}
        canApprove={canApprove}
        canReject={canReject}
        canCancel={canCancel}
        canApply={canApply}
        canAcknowledge={canAcknowledge}
        canClose={canClose}
        onView={(row) => { setSelected(row); setDrawerOpen(true); }}
        onApprove={(row) => { setSelected(row); setAction("approve"); }}
        onReject={(row) => { setSelected(row); setAction("reject"); }}
        onCancel={(row) => { setSelected(row); setAction("cancel"); }}
        onApply={(row) => { setSelected(row); setAction("apply"); }}
        onAcknowledge={(row) => { setSelected(row); setAction("acknowledge"); }}
        onClose={(row) => { setSelected(row); setAction("close"); }}
        onPageChange={(page) => setSearchParams(new URLSearchParams({ ...Object.fromEntries(searchParams), page: String(page) }))}
        onPageSizeChange={(pageSize) => setSearchParams(new URLSearchParams({ ...Object.fromEntries(searchParams), page: "1", page_size: String(pageSize) }))}
      />
      <DisciplinaryActionDialog open={dialogOpen} onOpenChange={setDialogOpen} currentEmployeeId={currentEmployeeId} canSelectEmployee={canSelectEmployee} onSubmitted={refresh} />
      <DisciplinaryActionDetailDrawer request={selected} timeline={timelineQuery.data?.data} tasks={tasksQuery.data?.data?.tasks} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <ReasonDialog
        open={Boolean(action)}
        title={`${action ? action.charAt(0).toUpperCase() + action.slice(1) : "Update"} disciplinary action`}
        description="A reason is required for disciplinary action changes."
        loading={actionMutation.isPending}
        error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Disciplinary action could not be updated.") : null}
        onOpenChange={(open) => !open && setAction(null)}
        onSubmit={(reason) => actionMutation.mutate(reason)}
      />
    </div>
  );
};
