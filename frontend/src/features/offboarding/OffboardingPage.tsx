import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, Eye, FileClock, Plus, X } from "lucide-react";
import { useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { humanize } from "@/lib/safe-display";
import { employeeExitApi } from "./employeeExit.api";
import { EmployeeExitDetailDrawer } from "./EmployeeExitDetailDrawer";
import { EmployeeExitRequestDialog } from "./EmployeeExitRequestDialog";
import type { EmployeeExitRequest } from "./employeeExit.types";

type Action = "approve" | "reject" | "cancel" | "apply" | "complete" | null;

const statusVariant = (status: string) =>
  status === "APPLIED" || status === "APPROVED" || status === "COMPLETED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_APPLY" ? "destructive" :
      status === "PENDING_MANUAL_REVIEW" || status.startsWith("PENDING") || status === "OFFBOARDING_IN_PROGRESS" ? "warning" : "secondary";

export const OffboardingPage = () => {
  // Contract coverage: Exit / Offboarding page renders.
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<EmployeeExitRequest | null>(null);
  const [selected, setSelected] = useState<EmployeeExitRequest | null>(null);
  const [action, setAction] = useState<Action>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canCreate = has("employeeLifecycle.resignations.create") || has("employeeLifecycle.offboarding.create") || has("employeeLifecycle.resignations.createForOthers") || has("employeeLifecycle.offboarding.createForOthers");
  const canCreateForOthers = has("employeeLifecycle.resignations.createForOthers") || has("employeeLifecycle.offboarding.createForOthers");
  const canApprove = has("employeeLifecycle.resignations.review") || has("employeeLifecycle.resignations.finalApprove") || has("employeeLifecycle.offboarding.review") || has("employeeLifecycle.offboarding.finalApprove") || has("approvals.operationOwner.approve") || has("approvals.operationFinal.approve");
  const canReject = has("employeeLifecycle.resignations.reject") || has("employeeLifecycle.offboarding.reject") || has("approvals.operationOwner.reject") || has("approvals.operationFinal.reject");
  const canCancel = has("employeeLifecycle.resignations.cancel") || has("employeeLifecycle.resignations.cancelAny") || has("employeeLifecycle.offboarding.cancel") || has("employeeLifecycle.offboarding.cancelAny");
  const canApply = has("employeeLifecycle.resignations.apply") || has("employeeLifecycle.offboarding.apply") || has("approvals.operationExecutor.apply");
  const canComplete = has("employeeLifecycle.offboarding.complete") || has("employeeLifecycle.offboarding.manage") || has("approvals.operationExecutor.apply");
  const query = useQuery({ queryKey: ["employee-exit-requests"], queryFn: () => employeeExitApi.list() });
  const timelineQuery = useQuery({
    queryKey: ["employee-exit-requests", detailRequest?.id, "timeline"],
    queryFn: () => employeeExitApi.timeline(detailRequest!.id),
    enabled: Boolean(detailRequest?.id),
  });
  const tasksQuery = useQuery({
    queryKey: ["employee-exit-requests", detailRequest?.id, "tasks"],
    queryFn: () => employeeExitApi.tasks(detailRequest!.id),
    enabled: Boolean(detailRequest?.id),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["employee-exit-requests"] });
  const createMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof employeeExitApi.create>[0]) => {
      const created = await employeeExitApi.create(payload);
      return employeeExitApi.submit(created.data.employee_exit_request.id);
    },
    onSuccess: async () => {
      toastSuccess(toast, "Resignation/offboarding request submitted for approval.");
      setCreateOpen(false);
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Resignation/offboarding request could not be submitted."),
  });
  const actionMutation = useMutation<unknown, unknown, string>({
    mutationFn: (reason) => {
      if (!selected || !action) throw new Error("Select a request first.");
      if (action === "approve") return employeeExitApi.approve(selected.id, reason || "Approved from Exit / Offboarding page.");
      if (action === "reject") return employeeExitApi.reject(selected.id, reason);
      if (action === "apply") return employeeExitApi.apply(selected.id, reason || "Applied from Exit / Offboarding page.");
      if (action === "complete") return employeeExitApi.complete(selected.id, reason || "Completed from Exit / Offboarding page.");
      return employeeExitApi.cancel(selected.id, reason);
    },
    onSuccess: async () => {
      toastSuccess(toast, "Lifecycle action completed.");
      setAction(null);
      setSelected(null);
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Lifecycle action could not be completed."),
  });
  const error = query.error ?? createMutation.error ?? actionMutation.error;

  return (
    <div>
      {canCreate ? <PageActionBar label="Exit and offboarding actions"><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New exit request</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Exit/offboarding action could not be completed.")} /> : null}
        <div>
          <h1 className="text-xl font-semibold">Resignation / Offboarding</h1>
          <p className="text-sm text-muted-foreground">Operation Ownership driven resignation, offboarding, checklist, and lifecycle execution requests.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Last working date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Checklist</TableHead>
              <TableHead>Settlement / access</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data?.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.employee_name ?? row.employee_id}</div>
                  <div className="text-xs text-muted-foreground">{row.employee_code ?? "No code"} / {row.department_name ?? "Unassigned"}</div>
                </TableCell>
                <TableCell>
                  <div>{humanize(row.request_type)}</div>
                  <div className="text-xs text-muted-foreground">{humanize(row.operation_type)}</div>
                </TableCell>
                <TableCell className="text-xs">{row.approved_last_working_date ?? row.requested_last_working_date ?? "-"}</TableCell>
                <TableCell><Badge variant={statusVariant(row.status) as any}>{humanize(row.status)}</Badge></TableCell>
                <TableCell className="text-xs">{humanize(row.offboarding_checklist_status ?? "not generated")}</TableCell>
                <TableCell className="text-xs">{humanize(row.final_settlement_status ?? "pending")} / {humanize(row.access_disable_status ?? "pending")}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="View timeline" onClick={() => setDetailRequest(row)}><Eye className="h-4 w-4" /></Button>
                    {canApprove && row.status.startsWith("PENDING") ? <Button size="icon" variant="ghost" title="Approve" onClick={() => { setSelected(row); setAction("approve"); }}><Check className="h-4 w-4" /></Button> : null}
                    {canReject && row.status.startsWith("PENDING") ? <Button size="icon" variant="ghost" title="Reject" onClick={() => { setSelected(row); setAction("reject"); }}><X className="h-4 w-4" /></Button> : null}
                    {canApply && ["APPROVED", "PENDING_APPLICATION", "PENDING_CLEARANCE"].includes(row.status) ? <Button size="sm" variant="outline" onClick={() => { setSelected(row); setAction("apply"); }}>Apply</Button> : null}
                    {canComplete && ["OFFBOARDING_IN_PROGRESS", "CLEARED"].includes(row.status) ? <Button size="sm" variant="outline" onClick={() => { setSelected(row); setAction("complete"); }}><ClipboardCheck className="h-4 w-4" />Complete</Button> : null}
                    {canCancel && !["APPLIED", "COMPLETED", "REJECTED", "CANCELLED", "WITHDRAWN", "FAILED_TO_APPLY"].includes(row.status) ? <Button size="icon" variant="ghost" title="Cancel/withdraw" onClick={() => { setSelected(row); setAction("cancel"); }}><FileClock className="h-4 w-4" /></Button> : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!query.isLoading && (query.data?.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No resignation or offboarding requests found.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <EmployeeExitRequestDialog
        open={createOpen}
        loading={createMutation.isPending}
        error={createMutation.error ? friendlyHrmError(createMutation.error, "Resignation/offboarding request could not be submitted.") : null}
        currentEmployeeId={auth.user?.employee_id ?? null}
        canSelectEmployee={canCreateForOthers}
        onOpenChange={setCreateOpen}
        onSubmit={(payload) => createMutation.mutate(payload)}
      />
      <EmployeeExitDetailDrawer
        request={timelineQuery.data?.data.employee_exit_request ?? detailRequest}
        timeline={timelineQuery.data?.data ?? null}
        tasks={tasksQuery.data?.data.tasks ?? timelineQuery.data?.data.tasks ?? []}
        open={Boolean(detailRequest)}
        onOpenChange={(open) => !open && setDetailRequest(null)}
      />
      <ReasonDialog
        open={Boolean(action)}
        title="Confirm lifecycle action"
        description={action === "complete"
          ? "Required offboarding tasks must be complete or waived. Login/session disable happens only through approved completion."
          : "A reason is required for this resignation or offboarding action."}
        loading={actionMutation.isPending}
        error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Lifecycle action could not be completed.") : null}
        onOpenChange={(open) => !open && setAction(null)}
        onSubmit={(reason) => actionMutation.mutate(reason)}
      />
    </div>
  );
};
