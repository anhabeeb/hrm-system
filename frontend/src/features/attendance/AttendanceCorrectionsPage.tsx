import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { useToast } from "@/components/feedback/useToast";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth.store";
import { searchParamNumber } from "@/lib/query-string";
import { friendlyOperationalError, sanitizeForDisplay } from "@/lib/safe-display";
import type { TableColumn } from "@/types/common";
import { attendanceApi } from "./attendance.api";
import { formatDate, humanize } from "./attendance-format";
import { CorrectionRequestDialog } from "./CorrectionRequestDialog";
import type { AttendanceCorrection, AttendanceFilters, CorrectionRequestPayload, ReasonPayload } from "./attendance.types";

const columns: TableColumn<AttendanceCorrection>[] = [
  { key: "created_at", header: "Request Date", cell: (row) => formatDate(row.created_at) },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Unknown employee" },
  { key: "attendance_date", header: "Attendance Date", cell: (row) => formatDate(row.attendance_date) },
  { key: "correction_type", header: "Correction Type", cell: (row) => humanize(row.correction_type) },
  { key: "requested_by", header: "Requested By", cell: (row) => row.requested_by_name ?? row.requested_by ?? "-" },
  { key: "status", header: "Status", cell: (row) => <div className="space-y-1"><StatusBadge status={row.status} />{row.approval_current_step_name ? <p className="text-xs text-muted-foreground">{row.approval_current_step_name}</p> : row.approval_status ? <p className="text-xs text-muted-foreground">{humanize(row.approval_status)}</p> : null}</div> },
  { key: "reason", header: "Reason", cell: (row) => row.reason ?? "-" },
];

export const AttendanceCorrectionsPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<AttendanceCorrection | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<"approve" | "reject" | "cancel" | null>(null);

  const filters = useMemo<AttendanceFilters>(() => ({
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    status: searchParams.get("status") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<AttendanceFilters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    });
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };

  const correctionsQuery = useQuery({ queryKey: ["attendance", "corrections-page", filters], queryFn: () => attendanceApi.listCorrections(filters) });
  const timelineQuery = useQuery({
    queryKey: ["attendance", "correction-timeline", selected?.id],
    queryFn: () => attendanceApi.getCorrectionTimeline(selected!.id),
    enabled: Boolean(detailOpen && selected?.id),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["attendance"] });

  useEffect(() => {
    if (timelineQuery.error) {
      toast.error(friendlyOperationalError(timelineQuery.error, "Attendance correction timeline could not be loaded."));
    }
  }, [timelineQuery.error, toast]);

  const correctionMutation = useMutation({
    mutationFn: attendanceApi.requestCorrection,
    onSuccess: async () => {
      toast.success("Attendance correction submitted for approval.");
      setRequestOpen(false);
      await refresh();
    },
    onError: (error) => toast.error(friendlyOperationalError(error, "Attendance correction could not be submitted.")),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReasonPayload }) => attendanceApi.approveCorrection(id, payload),
    onSuccess: async () => {
      toast.success("Attendance correction approval updated.");
      setReasonDialog(null);
      await refresh();
    },
    onError: (error) => toast.error(friendlyOperationalError(error, "Attendance correction could not be approved.")),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReasonPayload }) => attendanceApi.rejectCorrection(id, payload),
    onSuccess: async () => {
      toast.success("Attendance correction rejected.");
      setReasonDialog(null);
      await refresh();
    },
    onError: (error) => toast.error(friendlyOperationalError(error, "Attendance correction could not be rejected.")),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReasonPayload }) => attendanceApi.cancelCorrection(id, payload),
    onSuccess: async () => {
      toast.success("Attendance correction cancelled.");
      setReasonDialog(null);
      await refresh();
    },
    onError: (error) => toast.error(friendlyOperationalError(error, "Attendance correction could not be cancelled.")),
  });

  const canCreateForOthers = auth.isSuperAdmin || auth.hasPermission("attendance.corrections.createForOthers");
  const canRequest = auth.hasAnyPermission(["attendance.corrections.create", "attendance.corrections.createForOthers", "attendance.manual_entry", "attendance.edit"]);
  const canApprove = auth.hasAnyPermission(["attendance.corrections.approve", "attendance.approve_correction", "approvals.department.approve", "approvals.hrFinal.approve"]);
  const canReject = auth.hasAnyPermission(["attendance.corrections.reject", "attendance.reject_correction", "approvals.department.reject", "approvals.hrFinal.reject"]);
  const canCancel = auth.hasAnyPermission(["attendance.corrections.cancel", "attendance.corrections.cancelAny", "approvals.requests.cancel", "approvals.requests.cancelAny"]);

  return (
    <div>
      {canRequest ? <PageActionBar label="Time corrections page actions"><Button onClick={() => setRequestOpen(true)}><Plus className="h-4 w-4" />Add correction request</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-5">
          <Label className="space-y-1.5 text-sm">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => updateFilters({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" /></Label>
          <Label className="space-y-1.5 text-sm">Employee<EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => updateFilters({ employee_id: value })} placeholder="All employees" /></Label>
          <Label className="space-y-1.5 text-sm">Status<Select value={filters.status ?? "all"} onValueChange={(value) => updateFilters({ status: value === "all" ? undefined : value })}><SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select></Label>
          <Label className="space-y-1.5 text-sm">From<Input type="date" value={filters.date_from ?? ""} onChange={(event) => updateFilters({ date_from: event.target.value })} /></Label>
          <Label className="space-y-1.5 text-sm">To<Input type="date" value={filters.date_to ?? ""} onChange={(event) => updateFilters({ date_to: event.target.value })} /></Label>
        </div>
        <DataTable
          columns={columns}
          rows={correctionsQuery.data?.data ?? []}
          getRowId={(row) => row.id}
          loading={correctionsQuery.isLoading}
          compact
          pagination={correctionsQuery.data?.pagination}
          onPageChange={(page) => updateFilters({ page })}
          onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
          emptyTitle="No attendance corrections found"
          rowActions={(row) => (
            <RowActions
              actions={[
                { key: "view", onSelect: () => { setSelected(row); setDetailOpen(true); } },
                ...(canApprove ? [{ key: "approve" as const, onSelect: () => { setSelected(row); setReasonDialog("approve"); } }] : []),
                ...(canReject ? [{ key: "reject" as const, onSelect: () => { setSelected(row); setReasonDialog("reject"); } }] : []),
                ...(canCancel ? [{ key: "more" as const, label: "Cancel", onSelect: () => { setSelected(row); setReasonDialog("cancel"); } }] : []),
              ]}
            />
          )}
        />
      </div>
      <DetailDrawer open={detailOpen} onOpenChange={setDetailOpen} title="Correction detail" subtitle={selected?.employee_name ?? selected?.employee_id}>
        {selected ? (
          <div className="space-y-4">
            <DetailSection title="Approval status" rows={[
              { label: "Status", value: selected.status },
              { label: "Approval", value: selected.approval_status ?? "Not linked" },
              { label: "Current step", value: selected.approval_current_step_name ?? selected.approval_current_step ?? "-" },
              { label: "Applied", value: selected.applied_at ? formatDate(selected.applied_at) : "-" },
              { label: "Reason", value: selected.reason ?? "-" },
              { label: "Rejection/cancellation", value: selected.rejection_reason ?? selected.cancellation_reason ?? "-" },
            ]} />
            <DetailSection
              title="Approval timeline"
              rows={(timelineQuery.data?.data?.steps ?? []).map((step: any) => ({
                label: step.step_name ?? step.step_code ?? "Approval step",
                value: `${humanize(step.status ?? "pending")}${step.fallback_applied ? ` (${humanize(step.fallback_applied)})` : ""}`,
              })).concat((timelineQuery.data?.data?.actions ?? []).map((action: any) => ({
                label: action.action ?? "Action",
                value: `${action.actor_name ?? action.actor_user_id ?? "System"}${action.reason ? ` - ${action.reason}` : ""}`,
              })))}
            />
            <DetailSection title="Safe correction detail" rows={[{ label: "Payload", value: <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(selected), null, 2)}</pre> }]} />
          </div>
        ) : null}
      </DetailDrawer>
      <CorrectionRequestDialog
        open={requestOpen}
        loading={correctionMutation.isPending}
        error={correctionMutation.error}
        canSelectEmployee={canCreateForOthers}
        currentEmployeeId={auth.user?.employee_id ?? null}
        onOpenChange={setRequestOpen}
        onSubmit={(payload) => correctionMutation.mutate(payload as CorrectionRequestPayload)}
      />
      <CorrectionRequestDialog
        open={Boolean(reasonDialog)}
        mode="reason"
        title={reasonDialog === "approve" ? "Approve correction" : reasonDialog === "reject" ? "Reject correction" : "Cancel correction"}
        description="A reason is required for this action."
        loading={approveMutation.isPending || rejectMutation.isPending || cancelMutation.isPending}
        error={approveMutation.error ?? rejectMutation.error ?? cancelMutation.error}
        onOpenChange={(open) => !open && setReasonDialog(null)}
        onSubmit={(payload) => {
          const reasonPayload = payload as ReasonPayload;
          if (reasonDialog === "approve" && selected) approveMutation.mutate({ id: selected.id, payload: reasonPayload });
          if (reasonDialog === "reject" && selected) rejectMutation.mutate({ id: selected.id, payload: reasonPayload });
          if (reasonDialog === "cancel" && selected) cancelMutation.mutate({ id: selected.id, payload: reasonPayload });
        }}
      />
    </div>
  );
};
