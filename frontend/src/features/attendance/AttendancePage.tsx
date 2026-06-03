import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyOperationalError, sanitizeForDisplay } from "@/lib/safe-display";
import { searchParamNumber } from "@/lib/query-string";
import type { TableColumn } from "@/types/common";
import { attendanceApi } from "./attendance.api";
import { formatDate, formatDateTime, humanize } from "./attendance-format";
import { AttendanceConflictPanel } from "./AttendanceConflictPanel";
import { AttendanceDetailDrawer } from "./AttendanceDetailDrawer";
import { AttendanceFilters } from "./AttendanceFilters";
import { AttendanceSummaryTable } from "./AttendanceSummaryTable";
import { CorrectionRequestDialog } from "./CorrectionRequestDialog";
import { ManualAttendanceDialog } from "./ManualAttendanceDialog";
import type { AttendanceConflict, AttendanceCorrection, AttendanceEvent, AttendanceFilters as AttendanceFilterValues, AttendanceSummary, CorrectionRequestPayload, ManualAttendancePayload, ReasonPayload } from "./attendance.types";

const today = new Date();
const startOfWeek = new Date(today);
startOfWeek.setDate(today.getDate() - today.getDay());
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const eventColumns: TableColumn<AttendanceEvent>[] = [
  { key: "event_time", header: "Timestamp", cell: (row) => formatDateTime(row.event_time) },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.full_name ?? row.employee_id ?? "Unknown employee" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "—" },
  { key: "event_type", header: "Event Type", cell: (row) => humanize(row.event_type) },
  { key: "source", header: "Source", cell: (row) => humanize(row.source) },
  { key: "device_id", header: "Device", cell: (row) => row.device_id ?? "—" },
  { key: "sync_status", header: "Sync Status", cell: (row) => <StatusBadge status={row.sync_status ?? "neutral"} /> },
];

const correctionColumns: TableColumn<AttendanceCorrection>[] = [
  { key: "created_at", header: "Request Date", cell: (row) => formatDate(row.created_at) },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "Unknown employee" },
  { key: "attendance_date", header: "Attendance Date", cell: (row) => formatDate(row.attendance_date) },
  { key: "correction_type", header: "Correction Type", cell: (row) => humanize(row.correction_type) },
  { key: "requested_by", header: "Requested By", cell: (row) => row.requested_by_name ?? row.requested_by ?? "—" },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  { key: "reason", header: "Reason", cell: (row) => row.reason ?? "—" },
];

export const AttendancePage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "summary");
  const [selectedSummary, setSelectedSummary] = useState<AttendanceSummary | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AttendanceEvent | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<AttendanceConflict | null>(null);
  const [selectedCorrection, setSelectedCorrection] = useState<AttendanceCorrection | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<"approve" | "reject" | "resolve" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<AttendanceFilterValues>(() => ({
    date_from: searchParams.get("date_from") || isoDate(startOfWeek),
    date_to: searchParams.get("date_to") || isoDate(today),
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    status: searchParams.get("status") || undefined,
    issue_type: searchParams.get("issue_type") || undefined,
    source: searchParams.get("source") || undefined,
    event_type: searchParams.get("event_type") || undefined,
    device_id: searchParams.get("device_id") || undefined,
    sync_status: searchParams.get("sync_status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<AttendanceFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    });
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

  const summaryQuery = useQuery({ queryKey: ["attendance", "summary", filters], queryFn: () => attendanceApi.listSummary(filters) });
  const eventsQuery = useQuery({ queryKey: ["attendance", "events", filters], queryFn: () => attendanceApi.listEvents(filters) });
  const correctionsQuery = useQuery({ queryKey: ["attendance", "corrections", filters], queryFn: () => attendanceApi.listCorrections(filters) });
  const conflictsQuery = useQuery({ queryKey: ["attendance", "conflicts", filters], queryFn: () => attendanceApi.listConflicts(filters) });

  const invalidateAttendance = async () => queryClient.invalidateQueries({ queryKey: ["attendance"] });

  const manualMutation = useMutation({
    mutationFn: attendanceApi.manualEntry,
    onSuccess: async () => {
      setSuccessMessage("Manual attendance entry submitted successfully.");
      setManualOpen(false);
      await invalidateAttendance();
    },
  });

  const correctionMutation = useMutation({
    mutationFn: attendanceApi.requestCorrection,
    onSuccess: async () => {
      setSuccessMessage("Attendance correction submitted successfully.");
      setCorrectionOpen(false);
      await invalidateAttendance();
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReasonPayload }) => attendanceApi.approveCorrection(id, payload),
    onSuccess: async () => {
      setSuccessMessage("Attendance correction approved.");
      setReasonDialog(null);
      await invalidateAttendance();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReasonPayload }) => attendanceApi.rejectCorrection(id, payload),
    onSuccess: async () => {
      setSuccessMessage("Attendance correction rejected.");
      setReasonDialog(null);
      await invalidateAttendance();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReasonPayload }) => attendanceApi.resolveConflict(id, payload),
    onSuccess: async () => {
      setSuccessMessage("Attendance conflict resolved.");
      setReasonDialog(null);
      await invalidateAttendance();
    },
  });

  const canManualEntry = auth.hasAnyPermission(["attendance.manual_entry", "attendance.edit"]);
  const canRequestCorrection = auth.hasAnyPermission(["attendance.manual_entry", "attendance.edit"]);
  const canApproveCorrection = auth.hasPermission("attendance.approve_correction");
  const canRejectCorrection = auth.hasPermission("attendance.reject_correction");
  const canResolveConflict = auth.hasPermission("attendance.resolve_conflicts");

  const selectedEvents = selectedSummary
    ? (eventsQuery.data?.data ?? []).filter((event) => event.employee_id === selectedSummary.employee_id || !selectedSummary.employee_id)
    : [];

  const actionError = approveMutation.error ?? rejectMutation.error ?? resolveMutation.error;

  return (
    <div>
      <PageHeader title="Attendance" description="Review daily attendance, missing punches, conflicts, and corrections." />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {(summaryQuery.isError || eventsQuery.isError || correctionsQuery.isError || conflictsQuery.isError) ? (
          <InlineAlert title="Attendance records could not be loaded." variant="error">Please adjust filters or try again.</InlineAlert>
        ) : null}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Attendance operations</h2>
            <p className="text-sm text-muted-foreground">Daily summaries are payroll-facing; raw events are for audit and review.</p>
          </div>
          {canManualEntry ? (
            <Button onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" />
              Manual entry
            </Button>
          ) : null}
        </div>
        <AttendanceFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab }))} />
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="summary">Daily Summary</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="corrections">Corrections</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          </TabsList>
          <TabsContent value="summary">
            <AttendanceSummaryTable
              rows={summaryQuery.data?.data ?? []}
              loading={summaryQuery.isLoading}
              pagination={summaryQuery.data?.pagination}
              canManualEntry={canManualEntry}
              canRequestCorrection={canRequestCorrection}
              onView={(row) => {
                setSelectedSummary(row);
                setDrawerOpen(true);
              }}
              onCorrection={(row) => {
                setSelectedSummary(row);
                setCorrectionOpen(true);
              }}
              onManualEntry={(row) => {
                setSelectedSummary(row);
                setManualOpen(true);
              }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="events">
            <DataTable
              columns={eventColumns}
              rows={eventsQuery.data?.data ?? []}
              getRowId={(row) => row.id}
              loading={eventsQuery.isLoading}
              compact
              pagination={eventsQuery.data?.pagination}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
              emptyTitle="No attendance events found"
              rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => setSelectedEvent(row) }]} />}
            />
          </TabsContent>
          <TabsContent value="corrections">
            <DataTable
              columns={correctionColumns}
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
                    { key: "view", onSelect: () => setSelectedCorrection(row) },
                    ...(canApproveCorrection ? [{ key: "approve" as const, onSelect: () => { setSelectedCorrection(row); setReasonDialog("approve"); } }] : []),
                    ...(canRejectCorrection ? [{ key: "reject" as const, onSelect: () => { setSelectedCorrection(row); setReasonDialog("reject"); } }] : []),
                  ]}
                />
              )}
            />
          </TabsContent>
          <TabsContent value="conflicts">
            <AttendanceConflictPanel
              rows={conflictsQuery.data?.data ?? []}
              loading={conflictsQuery.isLoading}
              pagination={conflictsQuery.data?.pagination}
              canResolve={canResolveConflict}
              onView={setSelectedConflict}
              onResolve={(row) => {
                setSelectedConflict(row);
                setReasonDialog("resolve");
              }}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
        </Tabs>
        {actionError ? <InlineAlert title={friendlyOperationalError(actionError, "This action could not be completed.")} variant="error" /> : null}
      </div>
      <AttendanceDetailDrawer summary={selectedSummary} events={selectedEvents} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <DetailDrawer open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)} title="Attendance event detail" subtitle={selectedEvent?.id}>
        {selectedEvent ? (
          <DetailSection
            title="Safe event detail"
            rows={[{ label: "Payload", value: <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(selectedEvent), null, 2)}</pre> }]}
          />
        ) : null}
      </DetailDrawer>
      <ManualAttendanceDialog
        open={manualOpen}
        initial={{ employee_id: selectedSummary?.employee_id, attendance_date: selectedSummary?.attendance_date ?? selectedSummary?.date }}
        loading={manualMutation.isPending}
        error={manualMutation.error}
        onOpenChange={setManualOpen}
        onSubmit={(payload: ManualAttendancePayload) => manualMutation.mutate(payload)}
      />
      <CorrectionRequestDialog
        open={correctionOpen}
        initial={{ employee_id: selectedSummary?.employee_id, attendance_date: selectedSummary?.attendance_date ?? selectedSummary?.date }}
        loading={correctionMutation.isPending}
        error={correctionMutation.error}
        onOpenChange={setCorrectionOpen}
        onSubmit={(payload) => correctionMutation.mutate(payload as CorrectionRequestPayload)}
      />
      <CorrectionRequestDialog
        open={Boolean(reasonDialog)}
        mode="reason"
        title={reasonDialog === "approve" ? "Approve correction" : reasonDialog === "reject" ? "Reject correction" : "Resolve attendance conflict"}
        description="A reason is required for this action."
        loading={approveMutation.isPending || rejectMutation.isPending || resolveMutation.isPending}
        error={actionError}
        onOpenChange={(open) => !open && setReasonDialog(null)}
        onSubmit={(payload) => {
          const reasonPayload = payload as ReasonPayload;
          if (reasonDialog === "approve" && selectedCorrection) approveMutation.mutate({ id: selectedCorrection.id, payload: reasonPayload });
          if (reasonDialog === "reject" && selectedCorrection) rejectMutation.mutate({ id: selectedCorrection.id, payload: reasonPayload });
          if (reasonDialog === "resolve" && selectedConflict) resolveMutation.mutate({ id: selectedConflict.id, payload: { ...reasonPayload, resolution: "accept" } });
        }}
      />
    </div>
  );
};
