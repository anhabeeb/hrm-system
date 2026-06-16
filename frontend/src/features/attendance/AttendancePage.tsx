import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ModuleAttentionPanel, ModuleLandingHeader, ModuleLandingShell, ModuleQuickActions, ModuleSummaryGrid, ModuleSummaryTile } from "@/components/module-landing";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { searchParamNumber } from "@/lib/query-string";
import { friendlyOperationalError, sanitizeForDisplay } from "@/lib/safe-display";
import type { TableColumn } from "@/types/common";
import { attendanceApi } from "./attendance.api";
import { formatDateTime, humanize } from "./attendance-format";
import { AttendanceConflictPanel } from "./AttendanceConflictPanel";
import { AttendanceDetailDrawer } from "./AttendanceDetailDrawer";
import { AttendanceFilters } from "./AttendanceFilters";
import { AttendanceSummaryTable } from "./AttendanceSummaryTable";
import { CorrectionRequestDialog } from "./CorrectionRequestDialog";
import { ManualAttendanceBatchDialog } from "./ManualAttendanceBatchDialog";
import { EmployeeAttendanceCalendarWidget } from "@/features/attendance-calendar/EmployeeAttendanceCalendarWidget";
import type {
  AttendanceConflict,
  AttendanceEvent,
  AttendanceFilters as AttendanceFilterValues,
  AttendanceSummary,
  CorrectionRequestPayload,
  ManualAttendanceBatchPayload,
  ManualAttendanceBatchResult,
  ReasonPayload,
} from "./attendance.types";

const today = new Date();
const startOfWeek = new Date(today);
startOfWeek.setDate(today.getDate() - today.getDay());
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const eventColumns: TableColumn<AttendanceEvent>[] = [
  { key: "event_time", header: "Timestamp", cell: (row) => formatDateTime(row.event_time) },
  { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.full_name ?? row.employee_id ?? "Unknown employee" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "-" },
  { key: "event_type", header: "Event Type", cell: (row) => humanize(row.event_type) },
  { key: "source", header: "Source", cell: (row) => humanize(row.source) },
  { key: "device_id", header: "Device", cell: (row) => row.device_id ?? "-" },
  { key: "sync_status", header: "Sync Status", cell: (row) => <StatusBadge status={row.sync_status ?? "neutral"} /> },
];

export const AttendancePage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "summary");
  const [selectedSummary, setSelectedSummary] = useState<AttendanceSummary | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AttendanceEvent | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<AttendanceConflict | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<"resolve" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [manualBatchResult, setManualBatchResult] = useState<ManualAttendanceBatchResult | undefined>();

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
  const conflictsQuery = useQuery({ queryKey: ["attendance", "conflicts", filters], queryFn: () => attendanceApi.listConflicts(filters) });

  const invalidateAttendance = async () => queryClient.invalidateQueries({ queryKey: ["attendance"] });

  const manualMutation = useMutation({
    mutationFn: attendanceApi.manualBatch,
    onSuccess: async (response) => {
      setManualBatchResult(response.data);
      const rowErrors = response.data.row_errors?.length ?? 0;
      setSuccessMessage(rowErrors > 0 ? "Some manual attendance rows need review." : "Manual attendance batch submitted successfully.");
      if (rowErrors === 0) setManualOpen(false);
      if (response.data.accepted.length > 0) await invalidateAttendance();
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
  const canResolveConflict = auth.hasPermission("attendance.resolve_conflicts");
  const canViewCalendar = auth.hasFeature("attendance") && auth.hasAnyPermission(["attendance.calendar.view", "attendance.calendar.viewTeam", "attendance.calendar.viewAll", "attendance.view", "attendance.reports.view"]);
  const canViewReports = auth.hasFeature("attendance") && auth.hasAnyPermission(["attendance.reports.view", "attendance.view"]);
  const canViewCorrections = auth.hasFeature("attendance") && auth.hasAnyPermission(["attendance.corrections.view", "attendance.view", "approvals.requests.view"]);
  const visibleTab = tab === "calendar" && !canViewCalendar ? "summary" : tab;

  const selectedEvents = selectedSummary
    ? (eventsQuery.data?.data ?? []).filter((event) => event.employee_id === selectedSummary.employee_id || !selectedSummary.employee_id)
    : [];

  const actionError = resolveMutation.error;
  const summaryRows = summaryQuery.data?.data ?? [];
  const conflictRows = conflictsQuery.data?.data ?? [];
  const todayRows = summaryRows.filter((row) => (row.attendance_date ?? row.date) === isoDate(today));
  const todayStatusCount = (tokens: string[]) => todayRows.filter((row) => tokens.includes(String(row.status ?? "").toLowerCase())).length;
  const todayMissingPunches = todayRows.filter((row) => ["missing_clock_in", "missing_clock_out", "missing_check_in", "missing_checkout", "conflict"].includes(String(row.status ?? "").toLowerCase())).length;
  const leaveEnabled = auth.hasFeature("leave") && auth.hasAnyPermission(["leave.view", "leave.approvals.view"]);

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {(summaryQuery.isError || eventsQuery.isError || conflictsQuery.isError) ? (
          <InlineAlert title="Attendance records could not be loaded." variant="error">Please adjust filters or try again.</InlineAlert>
        ) : null}
        <ModuleLandingShell>
          <ModuleLandingHeader
            title="Attendance"
            description="Track daily attendance, corrections, missing punches, and employee calendars."
            status="Attendance"
            actions={(
              <ModuleQuickActions>
                {canViewCalendar ? <Button variant="outline" onClick={() => setActiveTab("calendar")}>View Attendance Calendar</Button> : null}
                {canViewReports ? <Button variant="outline" asChild><Link to="/attendance/reports">Open Reports</Link></Button> : null}
                {canViewCorrections ? <Button variant="outline" asChild><Link to="/attendance/corrections">Open Corrections</Link></Button> : null}
                {canManualEntry ? <Button onClick={() => { setSelectedSummary(null); setManualOpen(true); }}><Plus className="h-4 w-4" />Manual attendance</Button> : null}
              </ModuleQuickActions>
            )}
          />
          <ModuleSummaryGrid>
            <ModuleSummaryTile label="Present today" value={todayStatusCount(["present", "checked_in", "checked_out"])} helperText="Today only" status="success" />
            <ModuleSummaryTile label="Late today" value={todayRows.filter((row) => Number(row.late_minutes ?? 0) > 0 || String(row.status ?? "").toLowerCase() === "late").length} helperText="Today only" status="warning" />
            <ModuleSummaryTile label="Absent today" value={todayStatusCount(["absent"])} helperText="Today only" status={todayStatusCount(["absent"]) ? "danger" : "neutral"} />
            <ModuleSummaryTile label="Missing punches today" value={todayMissingPunches} helperText="Today only" status={todayMissingPunches ? "warning" : "success"} />
            <ModuleSummaryTile label="Open conflicts" value={conflictRows.filter((row) => String(row.status ?? "").toLowerCase() === "open").length} helperText="Current filter range" status={conflictRows.length ? "warning" : "success"} />
            {leaveEnabled ? <ModuleSummaryTile label="Leave/sick today" value={todayRows.filter((row) => ["leave", "sick", "sick_leave"].includes(String(row.status ?? "").toLowerCase())).length} helperText="Today only" /> : null}
          </ModuleSummaryGrid>
          <ModuleAttentionPanel
            description="Attendance review items from the current filtered view."
            items={[
              todayMissingPunches ? `${todayMissingPunches} missing punch summary row(s) need review today.` : null,
              conflictRows.length ? `${conflictRows.length} attendance conflict row(s) are loaded.` : null,
              !summaryQuery.isLoading && summaryRows.length === 0 ? "No attendance records found for the current filter." : null,
            ]}
          />
        </ModuleLandingShell>
        <AttendanceFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab }))} />
        <Tabs value={visibleTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="summary">Daily Summary</TabsTrigger>
            {canViewCalendar ? <TabsTrigger value="calendar">Calendar</TabsTrigger> : null}
            <TabsTrigger value="events">Events</TabsTrigger>
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
          {canViewCalendar ? (
            <TabsContent value="calendar">
              <EmployeeAttendanceCalendarWidget source="attendance" />
            </TabsContent>
          ) : null}
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
      <ManualAttendanceBatchDialog
        open={manualOpen}
        initial={{ outlet_id: selectedSummary?.outlet_id, employee_id: selectedSummary?.employee_id, attendance_date: selectedSummary?.attendance_date ?? selectedSummary?.date }}
        loading={manualMutation.isPending}
        error={manualMutation.error}
        result={manualBatchResult}
        onOpenChange={(open) => {
          setManualOpen(open);
          if (!open) setManualBatchResult(undefined);
        }}
        onSubmit={(payload: ManualAttendanceBatchPayload) => manualMutation.mutate(payload)}
      />
      <CorrectionRequestDialog
        open={correctionOpen}
        initial={{ outlet_id: selectedSummary?.outlet_id, employee_id: selectedSummary?.employee_id, attendance_date: selectedSummary?.attendance_date ?? selectedSummary?.date }}
        loading={correctionMutation.isPending}
        error={correctionMutation.error}
        onOpenChange={setCorrectionOpen}
        onSubmit={(payload) => correctionMutation.mutate(payload as CorrectionRequestPayload)}
      />
      <CorrectionRequestDialog
        open={Boolean(reasonDialog)}
        mode="reason"
        title="Resolve attendance conflict"
        description="A reason is required for this action."
        loading={resolveMutation.isPending}
        error={actionError}
        onOpenChange={(open) => !open && setReasonDialog(null)}
        onSubmit={(payload) => {
          const reasonPayload = payload as ReasonPayload;
          if (selectedConflict) resolveMutation.mutate({ id: selectedConflict.id, payload: { ...reasonPayload, resolution: "accept" } });
        }}
      />
    </div>
  );
};
