import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { AppDatePicker } from "@/components/forms/AppDatePicker";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { useToast } from "@/components/feedback/useToast";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { ModuleAttentionPanel, ModuleLandingHeader, ModuleLandingShell, ModuleQuickActions, ModuleSummaryGrid, ModuleSummaryTile } from "@/components/module-landing";
import { DepartmentCombobox, EmployeeCombobox, OutletCombobox, PositionCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-errors";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import type { TableColumn } from "@/types/common";
import { RosterWeeklyMatrixPage } from "@/features/roster-matrix/RosterWeeklyMatrixPage";
import { RosterChangeRequestDialog } from "./RosterChangeRequestDialog";
import { conflictBadge, formatTimeRange, label, severityBadge, statusBadge } from "./roster-format";
import { rostersApi, shiftTemplatesApi } from "./rosters.api";
import type { BulkRosterPayload, RosterChangeRequest, RosterConflict, RosterFilters, RosterPayload, RosterShift, ShiftTemplatePayload } from "./rosters.types";

const today = new Date();
const startOfWeek = new Date(today);
startOfWeek.setDate(today.getDate() - today.getDay());
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const blankRoster = (): RosterPayload => ({
  outlet_id: "",
  department_id: "",
  position_id: "",
  employee_id: "",
  shift_template_id: "",
  roster_date: isoDate(today),
  notes: "",
  reason: "",
});

const blankTemplate = (): ShiftTemplatePayload => ({
  name: "",
  code: "",
  outlet_id: "",
  department_id: "",
  start_time: "09:00",
  end_time: "17:00",
  break_minutes: 60,
  notes: "",
});

const blankBulk = (): BulkRosterPayload => ({
  outlet_id: "",
  department_id: "",
  position_id: "",
  employee_ids: [],
  date_from: isoDate(startOfWeek),
  date_to: isoDate(today),
  days_of_week: [1, 2, 3, 4, 5],
  shift_template_id: "",
  notes: "",
  reason: "",
});

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const warningReviewFromError = (error: unknown) => {
  if (!(error instanceof ApiError) || error.code !== "ROSTER_WARNING_REVIEW_REQUIRED") return null;
  const details = error.details as { conflicts?: RosterConflict[]; overridable?: boolean } | undefined;
  return {
    message: error.message,
    conflicts: details?.conflicts ?? [],
    overridable: details?.overridable === true,
  };
};

export const RostersPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "list");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [changeRequestOpen, setChangeRequestOpen] = useState(false);
  const [rosterPayload, setRosterPayload] = useState<RosterPayload>(blankRoster);
  const [bulkPayload, setBulkPayload] = useState<BulkRosterPayload>(blankBulk);
  const [templatePayload, setTemplatePayload] = useState<ShiftTemplatePayload>(blankTemplate);
  const [publishReason, setPublishReason] = useState("");
  const [cancelShift, setCancelShift] = useState<RosterShift | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedChange, setSelectedChange] = useState<RosterChangeRequest | null>(null);
  const [changeAction, setChangeAction] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [conflictAction, setConflictAction] = useState<{ conflict: RosterConflict; action: "resolve" | "override" } | null>(null);
  const [conflictReason, setConflictReason] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  const filters = useMemo<RosterFilters>(() => ({
    outlet_id: searchParams.get("outlet_id") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    position_id: searchParams.get("position_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    date_from: searchParams.get("date_from") || isoDate(startOfWeek),
    date_to: searchParams.get("date_to") || isoDate(today),
    status: searchParams.get("status") || undefined,
    conflict_status: searchParams.get("conflict_status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<RosterFilters>) => {
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

  const rostersQuery = useQuery({ queryKey: ["rosters", filters], queryFn: () => rostersApi.list(filters) });
  const templatesQuery = useQuery({ queryKey: ["shift-templates"], queryFn: () => shiftTemplatesApi.list({ status: "active", page_size: 100 }) });
  const conflictsQuery = useQuery({ queryKey: ["roster-conflicts", filters], queryFn: () => rostersApi.conflicts({ ...filters, status: undefined }) });
  const rosterChangesQuery = useQuery({ queryKey: ["roster-changes", filters], queryFn: () => rostersApi.listChanges({ ...filters, status: undefined }) });
  const changeTimelineQuery = useQuery({
    queryKey: ["roster-change-timeline", selectedChange?.id],
    queryFn: () => rostersApi.changeTimeline(selectedChange!.id),
    enabled: Boolean(selectedChange?.id),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["rosters"] }),
      queryClient.invalidateQueries({ queryKey: ["shift-templates"] }),
      queryClient.invalidateQueries({ queryKey: ["roster-conflicts"] }),
      queryClient.invalidateQueries({ queryKey: ["roster-changes"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: rostersApi.create,
    onSuccess: async () => {
      setSuccess("Roster shift created successfully.");
      setCreateOpen(false);
      setRosterPayload(blankRoster());
      await invalidate();
    },
  });
  const createWarning = warningReviewFromError(createMutation.error);

  const bulkMutation = useMutation({
    mutationFn: rostersApi.bulk,
    onSuccess: async (response) => {
      setSuccess(`Bulk roster saved. Created ${response.data.created}, skipped ${response.data.skipped_existing}.`);
      setBulkOpen(false);
      setBulkPayload(blankBulk());
      await invalidate();
    },
  });
  const bulkWarning = warningReviewFromError(bulkMutation.error);

  const templateMutation = useMutation({
    mutationFn: shiftTemplatesApi.create,
    onSuccess: async () => {
      setSuccess("Shift template created successfully.");
      setTemplateOpen(false);
      setTemplatePayload(blankTemplate());
      await invalidate();
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => rostersApi.publish({
      outlet_id: filters.outlet_id ?? "",
      department_id: filters.department_id,
      date_from: filters.date_from ?? isoDate(startOfWeek),
      date_to: filters.date_to ?? isoDate(today),
      reason: publishReason,
    }),
    onSuccess: async () => {
      setSuccess("Roster published successfully.");
      setPublishReason("");
      await invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => rostersApi.cancel(cancelShift?.id ?? "", { reason: cancelReason }),
    onSuccess: async () => {
      setSuccess("Roster shift cancelled successfully.");
      setCancelShift(null);
      setCancelReason("");
      await invalidate();
    },
  });

  const conflictMutation = useMutation({
    mutationFn: () => {
      if (!conflictAction) throw new Error("Roster conflict is required.");
      const payload = { reason: conflictReason };
      return conflictAction.action === "resolve"
        ? rostersApi.resolveConflict(conflictAction.conflict.id, payload)
        : rostersApi.overrideConflict(conflictAction.conflict.id, payload);
    },
    onSuccess: async () => {
      setSuccess(conflictAction?.action === "override" ? "Roster conflict overridden successfully." : "Roster conflict resolved successfully.");
      setConflictAction(null);
      setConflictReason("");
      await invalidate();
    },
  });

  const changeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChange || !changeAction) throw new Error("Select a roster change request first.");
      if (changeAction === "approve") return rostersApi.approveChange(selectedChange.id, { reason: changeReason || "Approved from roster changes page." });
      if (changeAction === "reject") return rostersApi.rejectChange(selectedChange.id, { reason: changeReason });
      return rostersApi.cancelChange(selectedChange.id, { reason: changeReason });
    },
    onSuccess: async () => {
      toast.success(
        changeAction === "approve" ? "Roster change approved." :
          changeAction === "reject" ? "Roster change rejected." :
            "Roster change cancelled.",
      );
      setChangeAction(null);
      setChangeReason("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Roster change action could not be completed.")),
  });

  const columns: TableColumn<RosterShift>[] = [
    { key: "roster_date", header: "Date", cell: (row) => row.roster_date },
    { key: "employee_name", header: "Employee", cell: (row) => <div><p className="font-medium">{row.employee_name ?? row.employee_id}</p><p className="text-xs text-muted-foreground">{row.employee_code ?? row.position_title ?? "-"}</p></div> },
    { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id },
    { key: "shift_template_name", header: "Shift", cell: (row) => <div><p>{row.shift_template_name ?? "Custom shift"}</p><p className="text-xs text-muted-foreground">{formatTimeRange(row.start_time, row.end_time)} · break {row.break_minutes}m</p></div> },
    { key: "department_name", header: "Department", cell: (row) => row.department_name ?? "-" },
    { key: "status", header: "Status", cell: (row) => statusBadge(row.status) },
    { key: "open_conflict_count", header: "Conflicts", cell: (row) => conflictBadge(row.open_conflict_count, row.blocking_conflict_count) },
  ];

  const conflictColumns: TableColumn<RosterConflict>[] = [
    { key: "detected_at", header: "Detected", cell: (row) => row.detected_at?.slice(0, 16).replace("T", " ") },
    { key: "employee_name", header: "Employee", cell: (row) => row.employee_name ?? row.employee_id ?? "-" },
    { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? row.outlet_id ?? "-" },
    { key: "conflict_type", header: "Type", cell: (row) => label(row.conflict_type) },
    { key: "severity", header: "Severity", cell: (row) => severityBadge(row.severity) },
    { key: "message", header: "Message" },
    { key: "status", header: "Status", cell: (row) => statusBadge(row.status) },
  ];

  const terminalRosterChangeStatuses = ["APPROVED", "APPLIED", "REJECTED", "CANCELLED", "FAILED_TO_APPLY"];
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewWeeklyMatrix = auth.hasFeature("roster") && auth.hasFeature("employee_management") && auth.hasAnyPermission(["rosters.weeklyMatrix.view", "rosters.weeklyMatrix.viewTeam", "rosters.weeklyMatrix.viewAll", "rosters.view", "rosters.manage"]);
  const canCreateRoster = auth.hasAnyPermission(["roster.create", "roster.edit", "rosters.manage"]);
  const canBulkRoster = auth.hasAnyPermission(["rosters.weeklyMatrix.bulkAssign", "rosters.weeklyMatrix.copyWeek", "rosters.manage"]);
  const canCreateShiftTemplate = auth.hasAnyPermission(["shift_templates.manage", "rosters.manage", "roster.create", "roster.edit"]);
  const canRequestRosterChange = auth.hasAnyPermission(["roster.changes.create", "roster.changes.createForOthers", "rosters.manage"]);
  const canViewLeaveConflictOverlay = auth.hasFeature("leave") && auth.hasAnyPermission(["leave.view", "leave.approvals.view"]);
  const canCreateChangeForOthers = has("roster.changes.createForOthers");
  const canApproveChange = (row: RosterChangeRequest) => {
    if (terminalRosterChangeStatuses.includes(row.status)) return false;
    if (has("roster.changes.approve")) return true;
    if ((row.current_step_name ?? row.status).toLowerCase().includes("hr") || row.status === "PENDING_HR_APPROVAL") {
      return has("approvals.hrFinal.approve");
    }
    return has("approvals.department.approve");
  };
  const canRejectChange = (row: RosterChangeRequest) => {
    if (terminalRosterChangeStatuses.includes(row.status)) return false;
    if (has("roster.changes.reject")) return true;
    if ((row.current_step_name ?? row.status).toLowerCase().includes("hr") || row.status === "PENDING_HR_APPROVAL") {
      return has("approvals.hrFinal.reject");
    }
    return has("approvals.department.reject");
  };
  const canCancelChange = (row: RosterChangeRequest) => {
    if (terminalRosterChangeStatuses.includes(row.status)) return false;
    if (has("roster.changes.cancelAny")) return true;
    return has("roster.changes.cancel") && Boolean(auth.user?.employee_id && (row.employee_id === auth.user.employee_id || row.requester_employee_id === auth.user.employee_id));
  };
  const rosterRows = rostersQuery.data?.data ?? [];
  const conflictRows = conflictsQuery.data?.data ?? [];
  const changeRows = rosterChangesQuery.data?.data ?? [];
  const templateRows = templatesQuery.data?.data ?? [];
  const todayKey = isoDate(today);
  const scheduledToday = rosterRows.filter((row) => row.roster_date === todayKey).length;
  const openConflicts = conflictRows.filter((row) => String(row.status ?? "").toLowerCase() !== "resolved").length;
  const pendingChanges = changeRows.filter((row) => !terminalRosterChangeStatuses.includes(String(row.status ?? "").toUpperCase())).length;
  const draftRows = rosterRows.filter((row) => String(row.status ?? "").toLowerCase() === "draft").length;
  const publishedRows = rosterRows.filter((row) => String(row.status ?? "").toLowerCase() === "published").length;
  const visibleTab = tab === "weekly-matrix" && !canViewWeeklyMatrix ? "list" : tab;

  const changeColumns: TableColumn<RosterChangeRequest>[] = [
    { key: "requested_date", header: "Date", cell: (row) => row.requested_date ?? "-" },
    { key: "employee_name", header: "Employee", cell: (row) => <div><p className="font-medium">{row.employee_name ?? row.employee_id}</p><p className="text-xs text-muted-foreground">{row.employee_code ?? row.position_title ?? "-"}</p></div> },
    { key: "change_type", header: "Change", cell: (row) => label(row.change_type) },
    { key: "requested_start_at", header: "Requested", cell: (row) => row.requested_start_at || row.requested_end_at ? formatTimeRange(row.requested_start_at ?? "-", row.requested_end_at ?? "-") : "-" },
    { key: "department_name", header: "Department", cell: (row) => row.department_name ?? "-" },
    { key: "status", header: "Status", cell: (row) => statusBadge(row.status) },
    { key: "current_step_name", header: "Current step", cell: (row) => row.current_step_name ?? label(row.approval_status ?? row.status) },
  ];

  return (
    <div>
      {(canRequestRosterChange || canCreateRoster || canBulkRoster || canCreateShiftTemplate) ? <PageActionBar label="Duty rosters page actions"><div className="flex flex-wrap items-center justify-end gap-2">{canRequestRosterChange ? <Button onClick={() => setChangeRequestOpen(true)} variant="outline">Request change</Button> : null}{canCreateRoster ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Create shift</Button> : null}{canBulkRoster ? <Button variant="outline" onClick={() => setBulkOpen(true)}>Bulk create</Button> : null}{canCreateShiftTemplate ? <Button variant="outline" onClick={() => setTemplateOpen(true)}>New template</Button> : null}</div></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {success ? <InlineAlert variant="success" title={success} /> : null}
        {(rostersQuery.error || templatesQuery.error || conflictsQuery.error || rosterChangesQuery.error) ? (
          <InlineAlert variant="error" title={friendlyHrmError(rostersQuery.error ?? templatesQuery.error ?? conflictsQuery.error ?? rosterChangesQuery.error, "Roster data could not be loaded.")} />
        ) : null}
        <ModuleLandingShell>
          <ModuleLandingHeader
            title="Roster"
            description="Plan weekly schedules, review roster changes, and resolve conflicts."
            status="Roster"
            actions={(
              <ModuleQuickActions>
                {canViewWeeklyMatrix ? <Button variant="outline" onClick={() => setActiveTab("weekly-matrix")}>Open Weekly Matrix</Button> : null}
                {canRequestRosterChange ? <Button variant="outline" onClick={() => setChangeRequestOpen(true)}>View / Request Changes</Button> : null}
                {canCreateRoster ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Create Roster</Button> : null}
                {canBulkRoster ? <Button variant="outline" onClick={() => setBulkOpen(true)}>Copy / Bulk Create</Button> : null}
              </ModuleQuickActions>
            )}
          />
          <ModuleSummaryGrid>
            <ModuleSummaryTile label="Scheduled today" value={scheduledToday} helperText="Visible roster rows" />
            <ModuleSummaryTile label="Published shifts" value={publishedRows} status="success" />
            <ModuleSummaryTile label="Draft shifts" value={draftRows} status={draftRows ? "info" : "neutral"} />
            <ModuleSummaryTile label="Open conflicts" value={openConflicts} status={openConflicts ? "danger" : "success"} />
            <ModuleSummaryTile label="Pending changes" value={pendingChanges} status={pendingChanges ? "warning" : "success"} />
            <ModuleSummaryTile label="Shift templates" value={templateRows.length} />
          </ModuleSummaryGrid>
          <ModuleAttentionPanel
            description="Roster planning issues from your current filter scope."
            items={[
              openConflicts ? `${openConflicts} roster conflict(s) need review.` : null,
              pendingChanges ? `${pendingChanges} roster change request(s) are not terminal.` : null,
              draftRows ? `${draftRows} draft roster shift(s) are visible in this range.` : null,
              canViewLeaveConflictOverlay ? "Leave and sick conflicts are checked by roster validation when available." : null,
            ]}
          />
        </ModuleLandingShell>

        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => updateFilters({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Department<DepartmentCombobox value={filters.department_id} onChange={(value) => updateFilters({ department_id: value, employee_id: undefined, position_id: undefined })} placeholder="All departments" /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Position<PositionCombobox value={filters.position_id} departmentId={filters.department_id} onChange={(value) => updateFilters({ position_id: value, employee_id: undefined })} placeholder="All positions" /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Employee<EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} departmentId={filters.department_id} positionId={filters.position_id} onChange={(value) => updateFilters({ employee_id: value })} placeholder="All employees" /></Label>
          <AppDateRangePicker
            dateFrom={filters.date_from}
            dateTo={filters.date_to}
            onChange={({ dateFrom, dateTo }) => updateFilters({ date_from: dateFrom, date_to: dateTo })}
          />
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Status<Select value={filters.status ?? "all"} onValueChange={(value) => updateFilters({ status: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["all", "draft", "published", "cancelled", "completed"].map((status) => <SelectItem key={status} value={status}>{status === "all" ? "All statuses" : label(status)}</SelectItem>)}</SelectContent></Select></Label>
          <div className="flex items-end gap-2"><Button variant="outline" onClick={() => setSearchParams(new URLSearchParams({ tab, page: "1", page_size: String(filters.page_size ?? 25) }))}>Clear</Button></div>
        </div>

        <Tabs value={visibleTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">Roster List</TabsTrigger>
            <TabsTrigger value="week">Week View</TabsTrigger>
            {canViewWeeklyMatrix ? <TabsTrigger value="weekly-matrix">Weekly Matrix</TabsTrigger> : null}
            <TabsTrigger value="templates">Shift Templates</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
            <TabsTrigger value="changes">Change Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
              <Label className="grid gap-1 text-xs font-medium text-muted-foreground">Publish reason<Input value={publishReason} onChange={(event) => setPublishReason(event.target.value)} placeholder="Weekly roster approved" /></Label>
              <Button disabled={!filters.outlet_id || !publishReason || publishMutation.isPending} onClick={() => publishMutation.mutate()}>Publish filtered range</Button>
              {!filters.outlet_id ? <p className="text-xs text-muted-foreground">Choose an outlet before publishing.</p> : null}
            </div>
            <DataTable
              rows={rostersQuery.data?.data ?? []}
              columns={columns}
              loading={rostersQuery.isLoading}
              pagination={rostersQuery.data?.pagination}
              getRowId={(row) => row.id}
              rowActions={(row) => <RowActions actions={[{ key: "delete", label: "Cancel", disabled: row.status === "cancelled", onSelect: () => setCancelShift(row) }]} />}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
              emptyTitle="No roster shifts found"
              emptyDescription="Create a shift or bulk-create a weekly schedule."
            />
          </TabsContent>
          <TabsContent value="week">
            <DataTable rows={rostersQuery.data?.data ?? []} columns={columns} loading={rostersQuery.isLoading} getRowId={(row) => row.id} compact emptyTitle="No shifts in this range" emptyDescription="Use the filters above to move across weeks or outlets." />
          </TabsContent>
          <TabsContent value="weekly-matrix">
            <RosterWeeklyMatrixPage
              filters={{ week_start: filters.date_from, department_id: filters.department_id, outlet_id: filters.outlet_id }}
              onFiltersChange={(next) => updateFilters({ date_from: next.week_start, department_id: next.department_id, outlet_id: next.outlet_id })}
            />
          </TabsContent>
          <TabsContent value="templates">
            <DataTable
              rows={templatesQuery.data?.data ?? []}
              loading={templatesQuery.isLoading}
              getRowId={(row) => row.id}
              emptyTitle="No shift templates"
              emptyDescription="Create reusable templates for common shifts."
              columns={[
                { key: "name", header: "Name", cell: (row) => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.code ?? "No code"}</p></div> },
                { key: "start_time", header: "Time", cell: (row) => formatTimeRange(row.start_time, row.end_time) },
                { key: "break_minutes", header: "Break", cell: (row) => `${row.break_minutes}m` },
                { key: "crosses_midnight", header: "Crosses midnight", cell: (row) => row.crosses_midnight ? "Yes" : "No" },
                { key: "status", header: "Status", cell: (row) => statusBadge(row.status) },
              ]}
            />
          </TabsContent>
          <TabsContent value="conflicts">
            <DataTable
              rows={conflictsQuery.data?.data ?? []}
              loading={conflictsQuery.isLoading}
              columns={conflictColumns}
              getRowId={(row) => row.id}
              rowActions={(row) => (
                <RowActions
                  actions={[
                    { key: "approve", label: "Resolve", disabled: row.status !== "open", onSelect: () => setConflictAction({ conflict: row, action: "resolve" }) },
                    { key: "edit", label: "Override", disabled: row.status !== "open" || row.severity === "error", onSelect: () => setConflictAction({ conflict: row, action: "override" }) },
                  ]}
                />
              )}
              emptyTitle="No roster conflicts"
              emptyDescription="Conflicts will appear when roster entries need HR review."
            />
          </TabsContent>
          <TabsContent value="changes">
            <DataTable
              rows={rosterChangesQuery.data?.data ?? []}
              loading={rosterChangesQuery.isLoading}
              columns={changeColumns}
              getRowId={(row) => row.id}
              pagination={rosterChangesQuery.data?.pagination}
              rowActions={(row) => (
                <RowActions
                  actions={[
                    { key: "view", label: "View timeline", onSelect: () => setSelectedChange(row) },
                    ...(canApproveChange(row) ? [{ key: "approve" as const, label: "Approve", onSelect: () => { setSelectedChange(row); setChangeAction("approve"); } }] : []),
                    ...(canRejectChange(row) ? [{ key: "reject" as const, label: "Reject", onSelect: () => { setSelectedChange(row); setChangeAction("reject"); } }] : []),
                    ...(canCancelChange(row) ? [{ key: "delete" as const, label: "Cancel", onSelect: () => { setSelectedChange(row); setChangeAction("cancel"); } }] : []),
                  ]}
                />
              )}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
              emptyTitle="No roster change requests"
              emptyDescription="Roster change requests will appear here for department and HR review."
            />
          </TabsContent>
        </Tabs>
      </div>

      <RosterDialog
        open={createOpen}
        payload={rosterPayload}
        templates={templatesQuery.data?.data ?? []}
        loading={createMutation.isPending}
        error={createMutation.error}
        warningReview={createWarning}
        onOpenChange={setCreateOpen}
        onPayloadChange={setRosterPayload}
        onSubmit={() => createMutation.mutate(rosterPayload)}
        onOverrideWarnings={() => createMutation.mutate({ ...rosterPayload, override_warnings: true })}
      />
      <BulkRosterDialog
        open={bulkOpen}
        payload={bulkPayload}
        templates={templatesQuery.data?.data ?? []}
        loading={bulkMutation.isPending}
        error={bulkMutation.error}
        warningReview={bulkWarning}
        onOpenChange={setBulkOpen}
        onPayloadChange={setBulkPayload}
        onSubmit={() => bulkMutation.mutate(bulkPayload)}
        onOverrideWarnings={() => bulkMutation.mutate({ ...bulkPayload, override_warnings: true })}
      />
      <TemplateDialog open={templateOpen} payload={templatePayload} loading={templateMutation.isPending} error={templateMutation.error} onOpenChange={setTemplateOpen} onPayloadChange={setTemplatePayload} onSubmit={() => templateMutation.mutate(templatePayload)} />
      <RosterChangeRequestDialog
        open={changeRequestOpen}
        onOpenChange={setChangeRequestOpen}
        currentEmployeeId={auth.user?.employee_id ?? null}
        canSelectEmployee={canCreateChangeForOthers}
        onSubmitted={invalidate}
      />
      <Dialog open={Boolean(cancelShift)} onOpenChange={(open) => !open && setCancelShift(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel roster shift</DialogTitle><DialogDescription>Cancellation keeps the roster history and removes this shift from active schedules.</DialogDescription></DialogHeader>
          <Label className="grid gap-1 text-sm">Reason<Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></Label>
          {cancelMutation.error ? <InlineAlert variant="error" title={friendlyHrmError(cancelMutation.error, "Roster shift could not be cancelled.")} /> : null}
          <DialogFooter><Button variant="outline" onClick={() => setCancelShift(null)}>Close</Button><Button variant="destructive" disabled={!cancelReason || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>Cancel shift</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(conflictAction)} onOpenChange={(open) => !open && setConflictAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{conflictAction?.action === "override" ? "Override roster conflict" : "Resolve roster conflict"}</DialogTitle>
            <DialogDescription>{conflictAction?.conflict.message ?? "Record the review outcome for this roster conflict."}</DialogDescription>
          </DialogHeader>
          <Label className="grid gap-1 text-sm">Reason<Textarea value={conflictReason} onChange={(event) => setConflictReason(event.target.value)} /></Label>
          {conflictMutation.error ? <InlineAlert variant="error" title={friendlyHrmError(conflictMutation.error, "Roster conflict could not be updated.")} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictAction(null)}>Close</Button>
            <Button disabled={!conflictReason || conflictMutation.isPending} onClick={() => conflictMutation.mutate()}>
              {conflictAction?.action === "override" ? "Override conflict" : "Resolve conflict"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(selectedChange) && !changeAction} onOpenChange={(open) => !open && setSelectedChange(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approval timeline</DialogTitle>
            <DialogDescription>{selectedChange?.employee_name ?? selectedChange?.employee_id} - {selectedChange ? label(selectedChange.change_type) : "Roster change"}</DialogDescription>
          </DialogHeader>
          {changeTimelineQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading timeline...</p> : null}
          {changeTimelineQuery.error ? <p className="text-sm text-destructive">{friendlyHrmError(changeTimelineQuery.error, "Timeline could not be loaded.")}</p> : null}
          <div className="space-y-2">
            {(changeTimelineQuery.data?.data?.steps ?? []).map((step) => (
              <div key={step.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{step.step_name}</p>
                  {step.fallback_applied ? <p className="text-xs text-muted-foreground">Fallback: {label(step.fallback_applied)}</p> : null}
                </div>
                {statusBadge(step.status)}
              </div>
            ))}
            {!changeTimelineQuery.isLoading && (changeTimelineQuery.data?.data?.steps ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No approval steps have been generated yet.</p> : null}
          </div>
          {selectedChange?.apply_error_message ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{selectedChange.apply_error_message}</p> : null}
          <DialogFooter><Button variant="outline" onClick={() => setSelectedChange(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(changeAction)} onOpenChange={(open) => { if (!open) { setChangeAction(null); setChangeReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{changeAction === "approve" ? "Approve roster change" : changeAction === "reject" ? "Reject roster change" : "Cancel roster change"}</DialogTitle>
            <DialogDescription>Record a short reason so the approval timeline stays clear.</DialogDescription>
          </DialogHeader>
          <Label className="grid gap-1 text-sm">Reason<Textarea value={changeReason} onChange={(event) => setChangeReason(event.target.value)} /></Label>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangeAction(null); setChangeReason(""); }}>Close</Button>
            <Button disabled={(changeAction !== "approve" && !changeReason.trim()) || changeMutation.isPending} onClick={() => changeMutation.mutate()}>
              {changeAction === "approve" ? "Approve" : changeAction === "reject" ? "Reject" : "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const TemplateSelect = ({ templates, value, onChange }: { templates: Array<{ id: string; name: string; code?: string | null; start_time: string; end_time: string }>; value?: string | null; onChange: (value: string) => void }) => (
  <Select value={value || ""} onValueChange={onChange}>
    <SelectTrigger><SelectValue placeholder="Select shift template" /></SelectTrigger>
    <SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · {formatTimeRange(template.start_time, template.end_time)}</SelectItem>)}</SelectContent>
  </Select>
);

const WarningReviewPanel = ({
  warningReview,
  onOverride,
  loading,
}: {
  warningReview: ReturnType<typeof warningReviewFromError>;
  onOverride: () => void;
  loading?: boolean;
}) => warningReview ? (
  <InlineAlert
    variant="warning"
    title={warningReview.message}
  >
    <div className="space-y-2">
      <ul className="list-disc space-y-1 pl-4">
        {warningReview.conflicts.map((conflict, index) => <li key={`${conflict.conflict_type}-${index}`}>{conflict.message}</li>)}
      </ul>
      {warningReview.overridable ? <Button size="sm" variant="outline" disabled={loading} onClick={onOverride}>Create with warning override</Button> : null}
    </div>
  </InlineAlert>
) : null;

const RosterDialog = ({ open, payload, templates, loading, error, warningReview, onOpenChange, onPayloadChange, onSubmit, onOverrideWarnings }: {
  open: boolean;
  payload: RosterPayload;
  templates: Array<{ id: string; name: string; code?: string | null; start_time: string; end_time: string }>;
  loading?: boolean;
  error?: unknown;
  warningReview: ReturnType<typeof warningReviewFromError>;
  onOpenChange: (open: boolean) => void;
  onPayloadChange: (payload: RosterPayload) => void;
  onSubmit: () => void;
  onOverrideWarnings: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Create roster shift</DialogTitle><DialogDescription>Use selectors for outlet, department, position, employee, and shift template. No raw IDs needed.</DialogDescription></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <Label className="grid gap-1 text-sm">Outlet<OutletCombobox value={payload.outlet_id} onChange={(value) => onPayloadChange({ ...payload, outlet_id: value ?? "", employee_id: "" })} /></Label>
        <Label className="grid gap-1 text-sm">Department<DepartmentCombobox value={payload.department_id ?? ""} onChange={(value) => onPayloadChange({ ...payload, department_id: value, position_id: "", employee_id: "" })} placeholder="Optional department" /></Label>
        <Label className="grid gap-1 text-sm">Position<PositionCombobox value={payload.position_id ?? ""} departmentId={payload.department_id} onChange={(value) => onPayloadChange({ ...payload, position_id: value, employee_id: "" })} placeholder="Optional position" /></Label>
        <Label className="grid gap-1 text-sm">Employee<EmployeeCombobox value={payload.employee_id} outletId={payload.outlet_id} departmentId={payload.department_id ?? undefined} positionId={payload.position_id ?? undefined} onChange={(value) => onPayloadChange({ ...payload, employee_id: value ?? "" })} /></Label>
        <AppDatePicker label="Date" value={payload.roster_date} onChange={(value) => onPayloadChange({ ...payload, roster_date: value ?? "" })} />
        <Label className="grid gap-1 text-sm">Shift template<TemplateSelect templates={templates} value={payload.shift_template_id} onChange={(value) => onPayloadChange({ ...payload, shift_template_id: value })} /></Label>
        <Label className="grid gap-1 text-sm md:col-span-2">Notes<Textarea value={payload.notes ?? ""} onChange={(event) => onPayloadChange({ ...payload, notes: event.target.value })} /></Label>
        <Label className="grid gap-1 text-sm md:col-span-2">Reason<Textarea value={payload.reason ?? ""} onChange={(event) => onPayloadChange({ ...payload, reason: event.target.value })} /></Label>
      </div>
      {warningReview ? <WarningReviewPanel warningReview={warningReview} onOverride={onOverrideWarnings} loading={loading} /> : error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Roster shift could not be created.")} /> : null}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={loading || !payload.outlet_id || !payload.employee_id || !payload.shift_template_id || !payload.roster_date} onClick={onSubmit}>Create shift</Button></DialogFooter>
    </DialogContent>
  </Dialog>
);

const BulkRosterDialog = ({ open, payload, templates, loading, error, warningReview, onOpenChange, onPayloadChange, onSubmit, onOverrideWarnings }: {
  open: boolean;
  payload: BulkRosterPayload;
  templates: Array<{ id: string; name: string; code?: string | null; start_time: string; end_time: string }>;
  loading?: boolean;
  error?: unknown;
  warningReview: ReturnType<typeof warningReviewFromError>;
  onOpenChange: (open: boolean) => void;
  onPayloadChange: (payload: BulkRosterPayload) => void;
  onSubmit: () => void;
  onOverrideWarnings: () => void;
}) => {
  const [employeeToAdd, setEmployeeToAdd] = useState("");
  const toggleDay = (day: number) => {
    const days = payload.days_of_week.includes(day) ? payload.days_of_week.filter((value) => value !== day) : [...payload.days_of_week, day].sort();
    onPayloadChange({ ...payload, days_of_week: days });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bulk create roster</DialogTitle><DialogDescription>Create draft roster shifts for selected employees and days. Duplicate employee/date/template rows are skipped.</DialogDescription></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Label className="grid gap-1 text-sm">Outlet<OutletCombobox value={payload.outlet_id} onChange={(value) => onPayloadChange({ ...payload, outlet_id: value ?? "", employee_ids: [] })} /></Label>
          <Label className="grid gap-1 text-sm">Department<DepartmentCombobox value={payload.department_id ?? ""} onChange={(value) => onPayloadChange({ ...payload, department_id: value, position_id: "", employee_ids: [] })} placeholder="Optional department" /></Label>
          <Label className="grid gap-1 text-sm">Position<PositionCombobox value={payload.position_id ?? ""} departmentId={payload.department_id} onChange={(value) => onPayloadChange({ ...payload, position_id: value, employee_ids: [] })} placeholder="Optional position" /></Label>
          <Label className="grid gap-1 text-sm">Shift template<TemplateSelect templates={templates} value={payload.shift_template_id} onChange={(value) => onPayloadChange({ ...payload, shift_template_id: value })} /></Label>
          <AppDateRangePicker
            dateFrom={payload.date_from}
            dateTo={payload.date_to}
            onChange={({ dateFrom, dateTo }) => onPayloadChange({ ...payload, date_from: dateFrom ?? "", date_to: dateTo ?? "" })}
          />
          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm">Employees</Label>
            <div className="flex gap-2">
              <div className="flex-1"><EmployeeCombobox value={employeeToAdd} outletId={payload.outlet_id} departmentId={payload.department_id ?? undefined} positionId={payload.position_id ?? undefined} onChange={(value) => setEmployeeToAdd(value ?? "")} /></div>
              <Button type="button" variant="outline" disabled={!employeeToAdd || payload.employee_ids.includes(employeeToAdd)} onClick={() => { onPayloadChange({ ...payload, employee_ids: [...payload.employee_ids, employeeToAdd] }); setEmployeeToAdd(""); }}>Add</Button>
            </div>
            <p className="text-xs text-muted-foreground">{payload.employee_ids.length} employee(s) selected.</p>
            {payload.employee_ids.length > 0 ? <Button variant="ghost" size="sm" onClick={() => onPayloadChange({ ...payload, employee_ids: [] })}>Clear selected employees</Button> : null}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm">Days of week</Label>
            <div className="flex flex-wrap gap-3">{dayLabels.map((day, index) => <Label key={day} className="flex items-center gap-2 text-sm"><Checkbox checked={payload.days_of_week.includes(index)} onCheckedChange={() => toggleDay(index)} />{day}</Label>)}</div>
          </div>
          <Label className="grid gap-1 text-sm md:col-span-2">Reason<Textarea value={payload.reason ?? ""} onChange={(event) => onPayloadChange({ ...payload, reason: event.target.value })} /></Label>
        </div>
        {warningReview ? <WarningReviewPanel warningReview={warningReview} onOverride={onOverrideWarnings} loading={loading} /> : error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Bulk roster could not be created.")} /> : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={loading || !payload.outlet_id || !payload.shift_template_id || payload.employee_ids.length === 0} onClick={onSubmit}>Save draft roster</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const TemplateDialog = ({ open, payload, loading, error, onOpenChange, onPayloadChange, onSubmit }: {
  open: boolean;
  payload: ShiftTemplatePayload;
  loading?: boolean;
  error?: unknown;
  onOpenChange: (open: boolean) => void;
  onPayloadChange: (payload: ShiftTemplatePayload) => void;
  onSubmit: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Create shift template</DialogTitle><DialogDescription>Reusable templates keep weekly roster planning consistent.</DialogDescription></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <Label className="grid gap-1 text-sm">Name<Input value={payload.name} onChange={(event) => onPayloadChange({ ...payload, name: event.target.value })} placeholder="Morning shift" /></Label>
        <Label className="grid gap-1 text-sm">Code<Input value={payload.code ?? ""} onChange={(event) => onPayloadChange({ ...payload, code: event.target.value })} placeholder="MORN" /></Label>
        <Label className="grid gap-1 text-sm">Start time<Input type="time" value={payload.start_time} onChange={(event) => onPayloadChange({ ...payload, start_time: event.target.value })} /></Label>
        <Label className="grid gap-1 text-sm">End time<Input type="time" value={payload.end_time} onChange={(event) => onPayloadChange({ ...payload, end_time: event.target.value })} /></Label>
        <Label className="grid gap-1 text-sm">Break minutes<Input type="number" min={0} value={payload.break_minutes ?? 0} onChange={(event) => onPayloadChange({ ...payload, break_minutes: Number(event.target.value) })} /></Label>
        <Label className="grid gap-1 text-sm">Outlet<OutletCombobox value={payload.outlet_id ?? ""} onChange={(value) => onPayloadChange({ ...payload, outlet_id: value })} placeholder="Optional outlet" /></Label>
        <Label className="grid gap-1 text-sm">Department<DepartmentCombobox value={payload.department_id ?? ""} onChange={(value) => onPayloadChange({ ...payload, department_id: value })} placeholder="Optional department" /></Label>
        <Label className="grid gap-1 text-sm md:col-span-2">Notes<Textarea value={payload.notes ?? ""} onChange={(event) => onPayloadChange({ ...payload, notes: event.target.value })} /></Label>
      </div>
      {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Shift template could not be created.")} /> : null}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={loading || !payload.name || !payload.start_time || !payload.end_time} onClick={onSubmit}>Create template</Button></DialogFooter>
    </DialogContent>
  </Dialog>
);
