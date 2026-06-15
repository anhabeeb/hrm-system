import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Eye, FileClock, Plus, X } from "lucide-react";
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
import { employeeStructureChangeApi } from "./employeeStructureChange.api";
import { EmployeeStructureChangeDetailDrawer } from "./EmployeeStructureChangeDetailDrawer";
import { EmployeeStructureChangeRequestDialog } from "./EmployeeStructureChangeRequestDialog";
import type { EmployeeStructureChangeRequest } from "./employeeStructureChange.types";

type Action = "approve" | "reject" | "cancel" | "apply" | null;

const statusVariant = (status: string) =>
  status === "APPLIED" || status === "APPROVED" ? "success" :
    status === "REJECTED" || status === "FAILED_TO_APPLY" ? "destructive" :
      status === "PENDING_MANUAL_REVIEW" ? "warning" : "secondary";

export const EmployeeStructureChangeRequestsPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<EmployeeStructureChangeRequest | null>(null);
  const [detailRequest, setDetailRequest] = useState<EmployeeStructureChangeRequest | null>(null);
  const [action, setAction] = useState<Action>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canCreate = has("employees.structureRequests.create") || has("employees.structureRequests.createForOthers");
  const canCreateForOthers = has("employees.structureRequests.createForOthers");
  const canApplyRoleTemplate = has("users.edit") || has("roles.edit") || has("employees.structure.manage");
  const canApprove = has("employees.structureRequests.review") || has("employees.structureRequests.finalApprove") || has("approvals.operationOwner.approve") || has("approvals.operationFinal.approve");
  const canReject = has("employees.structureRequests.reject") || has("approvals.operationOwner.reject") || has("approvals.operationFinal.reject");
  const canCancel = has("employees.structureRequests.cancel") || has("employees.structureRequests.cancelAny");
  const canApply = has("employees.structureRequests.apply") || has("approvals.operationExecutor.apply") || has("employees.structure.manage");
  const query = useQuery({ queryKey: ["employee-structure-change-requests"], queryFn: () => employeeStructureChangeApi.list() });
  const timelineQuery = useQuery({
    queryKey: ["employee-structure-change-requests", detailRequest?.id, "timeline"],
    queryFn: () => employeeStructureChangeApi.timeline(detailRequest!.id),
    enabled: Boolean(detailRequest?.id),
  });
  const itemsQuery = useQuery({
    queryKey: ["employee-structure-change-requests", detailRequest?.id, "items"],
    queryFn: () => employeeStructureChangeApi.items(detailRequest!.id),
    enabled: Boolean(detailRequest?.id),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["employee-structure-change-requests"] });
  const createMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof employeeStructureChangeApi.create>[0]) => {
      const created = await employeeStructureChangeApi.create(payload);
      return employeeStructureChangeApi.submit(created.data.employee_structure_change_request.id);
    },
    onSuccess: async () => {
      toastSuccess(toast, "Employee structure change request submitted for approval.");
      setCreateOpen(false);
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Employee structure change request could not be submitted."),
  });
  const actionMutation = useMutation<unknown, unknown, string>({
    mutationFn: (reason) => {
      if (!selected || !action) throw new Error("Select a request first.");
      if (action === "approve") return employeeStructureChangeApi.approve(selected.id, reason || "Approved from Employee Structure page.");
      if (action === "reject") return employeeStructureChangeApi.reject(selected.id, reason);
      if (action === "apply") return employeeStructureChangeApi.apply(selected.id, reason || "Applied from Employee Structure page.");
      return employeeStructureChangeApi.cancel(selected.id, reason);
    },
    onSuccess: async () => {
      toastSuccess(toast, "Employee structure action completed.");
      setAction(null);
      setSelected(null);
      await refresh();
    },
    onError: (error) => toastError(toast, error, "Employee structure action could not be completed."),
  });
  const error = query.error ?? createMutation.error ?? actionMutation.error;

  return (
    <div>
      {canCreate ? <PageActionBar label="Employee structure change actions"><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Request structure change</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Employee structure change action could not be completed.")} /> : null}
        <div>
          <h1 className="text-xl font-semibold">Employee Transfer / Structure Changes</h1>
          <p className="text-sm text-muted-foreground">Approval-backed employee department, position/title, level, outlet, and role-template changes.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Request type</TableHead>
              <TableHead>Current structure</TableHead>
              <TableHead>Requested structure</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(query.data?.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.employee_name ?? row.employee_id}</div>
                  <div className="text-xs text-muted-foreground">{row.employee_code}</div>
                </TableCell>
                <TableCell>{row.request_type.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.current_department_name ?? "Unassigned"} / {row.current_position_title ?? "Unassigned"} / L{row.current_level ?? "-"}</TableCell>
                <TableCell className="text-xs">
                  <span>{row.requested_department_name ?? row.requested_department_id ?? "No department change"}</span>
                  <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                  <span>{row.requested_position_title ?? row.requested_position_id ?? "No position change"} / L{row.requested_level ?? "-"}</span>
                </TableCell>
                <TableCell><Badge variant={statusVariant(row.status)}>{row.status.replace(/_/g, " ")}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="View timeline" onClick={() => setDetailRequest(row)}><Eye className="h-4 w-4" /></Button>
                    {canApprove && row.status.startsWith("PENDING") ? <Button size="icon" variant="ghost" title="Approve" onClick={() => { setSelected(row); setAction("approve"); }}><Check className="h-4 w-4" /></Button> : null}
                    {canReject && row.status.startsWith("PENDING") ? <Button size="icon" variant="ghost" title="Reject" onClick={() => { setSelected(row); setAction("reject"); }}><X className="h-4 w-4" /></Button> : null}
                    {canApply && ["APPROVED", "PENDING_APPLICATION"].includes(row.status) ? <Button size="sm" variant="outline" onClick={() => { setSelected(row); setAction("apply"); }}>Apply</Button> : null}
                    {canCancel && !["APPLIED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"].includes(row.status) ? <Button size="icon" variant="ghost" title="Cancel" onClick={() => { setSelected(row); setAction("cancel"); }}><FileClock className="h-4 w-4" /></Button> : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!query.isLoading && (query.data?.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No employee transfer or structure change requests found.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <EmployeeStructureChangeRequestDialog
        open={createOpen}
        loading={createMutation.isPending}
        error={createMutation.error ? friendlyHrmError(createMutation.error, "Employee structure change request could not be submitted.") : null}
        currentEmployeeId={auth.user?.employee_id ?? null}
        canSelectEmployee={canCreateForOthers}
        canApplyRoleTemplate={canApplyRoleTemplate}
        onOpenChange={setCreateOpen}
        onSubmit={(payload) => createMutation.mutate(payload)}
      />
      <EmployeeStructureChangeDetailDrawer
        request={timelineQuery.data?.data.employee_structure_change_request ?? detailRequest}
        timeline={timelineQuery.data?.data ?? null}
        items={itemsQuery.data?.data.items ?? []}
        open={Boolean(detailRequest)}
        onOpenChange={(open) => !open && setDetailRequest(null)}
      />
      <ReasonDialog
        open={Boolean(action)}
        title="Confirm employee structure action"
        description={action === "apply" && selected?.apply_role_template === 1 && !canApplyRoleTemplate
          ? "This request includes role template application, but your account does not have role-template apply permission. The backend will hold this for manual review unless an authorized executor applies it."
          : "A reason is required for this employee transfer or structure change action."}
        loading={actionMutation.isPending}
        error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Employee structure action could not be completed.") : null}
        onOpenChange={(open) => !open && setAction(null)}
        onSubmit={(reason) => actionMutation.mutate(reason)}
      />
    </div>
  );
};
