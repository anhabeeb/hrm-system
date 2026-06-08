import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarPlus } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import type { TableColumn } from "@/types/common";
import { holidaysApi } from "./holidays.api";
import type { HolidayFilters, HolidayPayload, HolidayRecord, HolidaySettings, HolidaySettingsPayload } from "./holidays.types";

const boolValue = (value: unknown) => value === true || value === 1;
const label = (value?: string | null) => String(value ?? "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const today = new Date().toISOString().slice(0, 10);

const blankHoliday = (): HolidayPayload => ({
  name: "",
  code: "",
  holiday_type: "company_holiday",
  date: today,
  end_date: "",
  outlet_id: "",
  applies_to_all_outlets: true,
  applies_to_local_employees: true,
  applies_to_foreign_employees: true,
  is_recurring: false,
  paid_holiday: true,
  affects_leave_duration: true,
  affects_attendance_absence: true,
  affects_overtime: true,
  affects_long_leave_payroll: true,
  notes: "",
  reason: "",
});

export const HolidayCalendarPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "calendar");
  const [formOpen, setFormOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<HolidayRecord | null>(null);
  const [payload, setPayload] = useState<HolidayPayload>(blankHoliday);
  const [reasonAction, setReasonAction] = useState<"archive" | "restore" | null>(null);
  const [reason, setReason] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<HolidaySettingsPayload>({ reason: "" });
  const [success, setSuccess] = useState<string | null>(null);

  const filters = useMemo<HolidayFilters>(() => ({
    year: searchParamNumber(searchParams, "year", new Date().getFullYear()),
    month: searchParams.get("month") ? searchParamNumber(searchParams, "month", new Date().getMonth() + 1) : undefined,
    from_date: searchParams.get("from_date") || undefined,
    to_date: searchParams.get("to_date") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    holiday_type: searchParams.get("holiday_type") || undefined,
    status: searchParams.get("status") || "active",
    employee_type: searchParams.get("employee_type") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<HolidayFilters>) => {
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
    setSearchParams(params);
  };
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["holidays"] });

  const listQuery = useQuery({ queryKey: ["holidays", "list", filters], queryFn: () => holidaysApi.list(filters) });
  const calendarQuery = useQuery({ queryKey: ["holidays", "calendar", filters], queryFn: () => holidaysApi.calendar(filters) });
  const settingsQuery = useQuery({ queryKey: ["holidays", "settings"], queryFn: holidaysApi.settings });

  const saveMutation = useMutation({
    mutationFn: () => selected ? holidaysApi.update(selected.id, payload) : holidaysApi.create(payload),
    onSuccess: async () => {
      setSuccess(selected ? "Holiday updated successfully." : "Holiday created successfully.");
      setFormOpen(false);
      setSelected(null);
      setPayload(blankHoliday());
      await refresh();
    },
  });
  const statusMutation = useMutation({
    mutationFn: () => {
      if (!selected || !reasonAction) throw new Error("Select a holiday first.");
      return reasonAction === "archive" ? holidaysApi.archive(selected.id, reason) : holidaysApi.restore(selected.id, reason);
    },
    onSuccess: async () => {
      setSuccess(reasonAction === "archive" ? "Holiday archived successfully." : "Holiday restored successfully.");
      setReasonAction(null);
      setReason("");
      await refresh();
    },
  });
  const settingsMutation = useMutation({
    mutationFn: holidaysApi.updateSettings,
    onSuccess: async () => {
      setSuccess("Holiday settings updated.");
      setSettingsOpen(false);
      setSettingsDraft({ reason: "" });
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["holidays", "settings"] });
    },
  });

  const canCreate = auth.hasPermission("holidays.create");
  const canEdit = auth.hasPermission("holidays.edit");
  const canArchive = auth.hasPermission("holidays.archive") || auth.hasPermission("holidays.delete");
  const canRestore = auth.hasPermission("holidays.restore");
  const canManageSettings = auth.hasPermission("holidays.settings.manage") || auth.hasPermission("holiday_settings.manage");
  const canOverride = auth.hasPermission("holidays.override");
  const canViewAudit = auth.hasPermission("holidays.audit.view");
  const columns: TableColumn<HolidayRecord>[] = [
    { key: "date", header: "Date", cell: (row) => row.event_date ?? row.date ?? row.start_date },
    { key: "name", header: "Holiday", cell: (row) => <div><p className="font-medium">{row.name ?? row.holiday_name}</p><p className="text-xs text-muted-foreground">{row.code || label(row.holiday_type)}</p></div> },
    { key: "holiday_type", header: "Type", cell: (row) => label(row.holiday_type) },
    { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? (row.outlet_id ? "Outlet-specific" : "All outlets") },
    { key: "paid_holiday", header: "Paid", cell: (row) => boolValue(row.paid_holiday) ? "Yes" : "No" },
    { key: "affects_leave_duration", header: "Affects Leave", cell: (row) => boolValue(row.affects_leave_duration) ? "Yes" : "No" },
    { key: "affects_attendance_absence", header: "Affects Attendance", cell: (row) => boolValue(row.affects_attendance_absence) ? "Yes" : "No" },
    { key: "is_recurring", header: "Recurring", cell: (row) => boolValue(row.is_recurring) ? "Yes" : "No" },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "active"} /> },
  ];

  const openEdit = (row: HolidayRecord) => {
    setSelected(row);
    setPayload({
      name: row.name ?? row.holiday_name ?? "",
      code: row.code ?? "",
      holiday_type: row.holiday_type ?? "company_holiday",
      date: row.date ?? row.start_date ?? today,
      end_date: row.end_date ?? "",
      outlet_id: row.outlet_id ?? "",
      applies_to_all_outlets: !row.outlet_id,
      applies_to_local_employees: boolValue(row.applies_to_local_employees),
      applies_to_foreign_employees: boolValue(row.applies_to_foreign_employees),
      is_recurring: boolValue(row.is_recurring),
      paid_holiday: boolValue(row.paid_holiday),
      affects_leave_duration: boolValue(row.affects_leave_duration),
      affects_attendance_absence: boolValue(row.affects_attendance_absence),
      affects_overtime: boolValue(row.affects_overtime),
      affects_long_leave_payroll: boolValue(row.affects_long_leave_payroll),
      notes: row.notes ?? "",
      reason: "",
    });
    setFormOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Holiday Calendar"
        description="Manage public, company, outlet-specific, recurring, and payroll-aware holiday rules."
        actions={<div className="flex gap-2">{canManageSettings ? <Button variant="outline" onClick={() => { setSettingsDraft({ ...(settingsQuery.data?.data.settings ?? {}), reason: "" }); setSettingsOpen(true); }}>Settings</Button> : null}{canCreate ? <Button onClick={() => { setSelected(null); setPayload(blankHoliday()); setFormOpen(true); }}><CalendarPlus className="h-4 w-4" />New holiday</Button> : null}</div>}
      />
      <div className="space-y-4 p-4 md:p-6">
        {success ? <InlineAlert variant="success" title={success} /> : null}
        {(listQuery.error || calendarQuery.error || settingsQuery.error) ? <InlineAlert variant="error" title={friendlyHrmError(listQuery.error ?? calendarQuery.error ?? settingsQuery.error, "Holiday calendar could not be loaded.", "leave")} /> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Year<Input type="number" value={filters.year ?? ""} onChange={(event) => updateFilters({ year: Number(event.target.value) })} /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Month<Select value={filters.month ? String(filters.month) : "all"} onValueChange={(value) => updateFilters({ month: value === "all" ? undefined : Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Full year</SelectItem>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{new Date(Date.UTC(2026, index, 1)).toLocaleString(undefined, { month: "long" })}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => updateFilters({ outlet_id: value })} placeholder="All outlets" /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Type<Select value={filters.holiday_type ?? "all"} onValueChange={(value) => updateFilters({ holiday_type: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["all", "public_holiday", "company_holiday", "outlet_holiday", "optional_holiday", "religious_holiday", "national_holiday", "replacement_holiday", "other"].map((type) => <SelectItem key={type} value={type}>{type === "all" ? "All types" : label(type)}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Status<Select value={filters.status ?? "all"} onValueChange={(value) => updateFilters({ status: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["all", "active", "inactive", "archived"].map((status) => <SelectItem key={status} value={status}>{status === "all" ? "All statuses" : label(status)}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Employee type<Select value={filters.employee_type ?? "all"} onValueChange={(value) => updateFilters({ employee_type: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All employees</SelectItem><SelectItem value="local">Local only</SelectItem><SelectItem value="foreign">Foreign only</SelectItem></SelectContent></Select></Label>
          <div className="flex items-end"><Button variant="outline" onClick={() => setSearchParams(new URLSearchParams({ tab, page: "1", page_size: String(filters.page_size ?? 25) }))}>Clear</Button></div>
        </div>
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="calendar">Calendar Events</TabsTrigger><TabsTrigger value="list">Holiday List</TabsTrigger><TabsTrigger value="settings">Settings Snapshot</TabsTrigger></TabsList>
          <TabsContent value="calendar">
            <DataTable rows={calendarQuery.data?.data.events ?? []} columns={columns} loading={calendarQuery.isLoading} getRowId={(row) => `${row.id}-${row.event_date ?? row.date}`} compact emptyTitle="No holiday events" emptyDescription="Create holidays or adjust the date filters." />
          </TabsContent>
          <TabsContent value="list">
            <DataTable
              rows={listQuery.data?.data ?? []}
              columns={columns}
              loading={listQuery.isLoading}
              pagination={listQuery.data?.pagination}
              getRowId={(row) => row.id}
              rowActions={(row) => <RowActions actions={[
                ...(canEdit ? [{ key: "edit" as const, onSelect: () => openEdit(row) }] : []),
                ...(canArchive ? [{ key: "delete" as const, label: "Archive", disabled: row.status === "archived", onSelect: () => { setSelected(row); setReasonAction("archive"); } }] : []),
                ...(canRestore ? [{ key: "enable" as const, label: "Restore", disabled: row.status !== "archived", onSelect: () => { setSelected(row); setReasonAction("restore"); } }] : []),
              ]} />}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
              emptyTitle="No holiday records"
            />
          </TabsContent>
          <TabsContent value="settings">
            <HolidaySettingsSnapshot settings={settingsQuery.data?.data.settings} canOverride={canOverride} canViewAudit={canViewAudit} onEdit={canManageSettings ? () => { setSettingsDraft({ ...(settingsQuery.data?.data.settings ?? {}), reason: "" }); setSettingsOpen(true); } : undefined} />
          </TabsContent>
        </Tabs>
      </div>
      <HolidayFormDialog open={formOpen} payload={payload} editing={Boolean(selected)} loading={saveMutation.isPending} error={saveMutation.error} onOpenChange={setFormOpen} onChange={setPayload} onSubmit={() => saveMutation.mutate()} />
      <ReasonDialog open={Boolean(reasonAction)} title={reasonAction === "restore" ? "Restore holiday" : "Archive holiday"} loading={statusMutation.isPending} error={statusMutation.error} reason={reason} onReason={setReason} onOpenChange={(open) => !open && setReasonAction(null)} onSubmit={() => statusMutation.mutate()} />
      <HolidaySettingsDialog open={settingsOpen} draft={settingsDraft} canManage={canManageSettings} loading={settingsMutation.isPending} error={settingsMutation.error} onOpenChange={setSettingsOpen} onChange={setSettingsDraft} onSubmit={() => settingsMutation.mutate(settingsDraft)} />
    </div>
  );
};

const Toggle = ({ label: title, checked, disabled, onChange }: { label: string; checked?: boolean; disabled?: boolean; onChange: (value: boolean) => void }) => (
  <Label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">{title}<Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></Label>
);

const HolidayFormDialog = ({ open, payload, editing, loading, error, onOpenChange, onChange, onSubmit }: {
  open: boolean;
  payload: HolidayPayload;
  editing: boolean;
  loading?: boolean;
  error?: unknown;
  onOpenChange: (open: boolean) => void;
  onChange: (payload: HolidayPayload) => void;
  onSubmit: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{editing ? "Edit holiday" : "Create holiday"}</DialogTitle><DialogDescription>Holiday rules affect leave deductions, attendance absence handling, rosters, and long-leave payroll context.</DialogDescription></DialogHeader>
      <div className="grid gap-3 md:grid-cols-2">
        <Label className="grid gap-1 text-sm">Name<Input value={payload.name} onChange={(event) => onChange({ ...payload, name: event.target.value })} /></Label>
        <Label className="grid gap-1 text-sm">Code<Input value={payload.code ?? ""} onChange={(event) => onChange({ ...payload, code: event.target.value })} /></Label>
        <Label className="grid gap-1 text-sm">Type<Select value={payload.holiday_type} onValueChange={(value) => onChange({ ...payload, holiday_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["public_holiday", "company_holiday", "outlet_holiday", "optional_holiday", "religious_holiday", "national_holiday", "replacement_holiday", "other"].map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent></Select></Label>
        <Label className="grid gap-1 text-sm">Outlet<OutletCombobox value={payload.outlet_id} onChange={(value) => onChange({ ...payload, outlet_id: value ?? "", applies_to_all_outlets: !value })} placeholder="All outlets" /></Label>
        <Label className="grid gap-1 text-sm">Date<Input type="date" value={payload.date} onChange={(event) => onChange({ ...payload, date: event.target.value })} /></Label>
        <Label className="grid gap-1 text-sm">End date<Input type="date" value={payload.end_date ?? ""} onChange={(event) => onChange({ ...payload, end_date: event.target.value })} /></Label>
        <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
          <Toggle label="Recurring yearly" checked={payload.is_recurring} onChange={(value) => onChange({ ...payload, is_recurring: value })} />
          <Toggle label="Paid holiday" checked={payload.paid_holiday} onChange={(value) => onChange({ ...payload, paid_holiday: value })} />
          <Toggle label="Affects leave duration" checked={payload.affects_leave_duration} onChange={(value) => onChange({ ...payload, affects_leave_duration: value })} />
          <Toggle label="Affects attendance absence" checked={payload.affects_attendance_absence} onChange={(value) => onChange({ ...payload, affects_attendance_absence: value })} />
          <Toggle label="Affects overtime" checked={payload.affects_overtime} onChange={(value) => onChange({ ...payload, affects_overtime: value })} />
          <Toggle label="Affects long-leave payroll" checked={payload.affects_long_leave_payroll} onChange={(value) => onChange({ ...payload, affects_long_leave_payroll: value })} />
          <Toggle label="Applies to local employees" checked={payload.applies_to_local_employees} onChange={(value) => onChange({ ...payload, applies_to_local_employees: value })} />
          <Toggle label="Applies to foreign employees" checked={payload.applies_to_foreign_employees} onChange={(value) => onChange({ ...payload, applies_to_foreign_employees: value })} />
        </div>
        <Label className="grid gap-1 text-sm md:col-span-2">Notes<Textarea value={payload.notes ?? ""} onChange={(event) => onChange({ ...payload, notes: event.target.value })} /></Label>
        <Label className="grid gap-1 text-sm md:col-span-2">Reason<Textarea value={payload.reason} onChange={(event) => onChange({ ...payload, reason: event.target.value })} /></Label>
      </div>
      {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Holiday could not be saved.", "leave")} /> : null}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={loading || !payload.name || !payload.date || !payload.reason} onClick={onSubmit}>{editing ? "Save changes" : "Create holiday"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
);

const ReasonDialog = ({ open, title, reason, loading, error, onOpenChange, onReason, onSubmit }: {
  open: boolean;
  title: string;
  reason: string;
  loading?: boolean;
  error?: unknown;
  onOpenChange: (open: boolean) => void;
  onReason: (value: string) => void;
  onSubmit: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>A reason is required because holiday changes affect leave, attendance, roster, and payroll calculations.</DialogDescription></DialogHeader>
      <Label className="grid gap-1 text-sm">Reason<Textarea value={reason} onChange={(event) => onReason(event.target.value)} /></Label>
      {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Holiday status could not be updated.", "leave")} /> : null}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={loading || !reason} onClick={onSubmit}>{title}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
);

const HolidaySettingsSnapshot = ({ settings, canOverride, canViewAudit, onEdit }: { settings?: HolidaySettings; canOverride?: boolean; canViewAudit?: boolean; onEdit?: () => void }) => (
  <div className="rounded-lg border bg-card p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold">Holiday settings</h2><p className="text-sm text-muted-foreground">Backend-enforced settings currently used by leave, attendance, roster, and long leave calculations.</p></div>
      {onEdit ? <Button variant="outline" onClick={onEdit}>Edit settings</Button> : null}
    </div>
    <DataTable
      rows={[
        { key: "Calendar enabled", value: boolValue(settings?.holiday_module_enabled) ? "Yes" : "No" },
        { key: "Exclude from paid leave", value: boolValue(settings?.holidays_exclude_from_paid_leave) ? "Yes" : "No" },
        { key: "Exclude from unpaid leave", value: boolValue(settings?.holidays_exclude_from_unpaid_leave) ? "Yes" : "No" },
        { key: "Attendance excused", value: boolValue(settings?.holidays_count_as_attendance_excused) ? "Yes" : "No" },
        { key: "Long leave pays holidays", value: boolValue(settings?.pay_holidays_during_long_leave) ? "Yes" : "No" },
        { key: "Holiday work overtime", value: boolValue(settings?.holiday_work_overtime_enabled) ? "Yes" : "No" },
        { key: "Holiday override permission", value: canOverride ? "Available" : "Not granted" },
        { key: "Holiday audit view", value: canViewAudit ? "Available" : "Not granted" },
      ]}
      columns={[{ key: "key", header: "Rule" }, { key: "value", header: "Value" }]}
      getRowId={(row) => row.key}
      compact
    />
  </div>
);

const HolidaySettingsDialog = ({ open, draft, canManage, loading, error, onOpenChange, onChange, onSubmit }: {
  open: boolean;
  draft: HolidaySettingsPayload;
  canManage: boolean;
  loading?: boolean;
  error?: unknown;
  onOpenChange: (open: boolean) => void;
  onChange: (payload: HolidaySettingsPayload) => void;
  onSubmit: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>Holiday Calendar Settings</DialogTitle><DialogDescription>These settings are enforced by backend calculations; frontend validation is only a convenience.</DialogDescription></DialogHeader>
      <div className="grid gap-2 md:grid-cols-2">
        <Toggle label="Holiday calendar enabled" disabled={!canManage} checked={boolValue(draft.holiday_module_enabled)} onChange={(value) => onChange({ ...draft, holiday_module_enabled: value })} />
        <Toggle label="Public holidays enabled" disabled={!canManage} checked={boolValue(draft.public_holidays_enabled)} onChange={(value) => onChange({ ...draft, public_holidays_enabled: value })} />
        <Toggle label="Company holidays enabled" disabled={!canManage} checked={boolValue(draft.company_holidays_enabled)} onChange={(value) => onChange({ ...draft, company_holidays_enabled: value })} />
        <Toggle label="Outlet holidays enabled" disabled={!canManage} checked={boolValue(draft.outlet_specific_holidays_enabled)} onChange={(value) => onChange({ ...draft, outlet_specific_holidays_enabled: value })} />
        <Toggle label="Optional holidays enabled" disabled={!canManage} checked={boolValue(draft.optional_holidays_enabled)} onChange={(value) => onChange({ ...draft, optional_holidays_enabled: value })} />
        <Toggle label="Exclude holidays from paid leave" disabled={!canManage} checked={boolValue(draft.holidays_exclude_from_paid_leave)} onChange={(value) => onChange({ ...draft, holidays_exclude_from_paid_leave: value })} />
        <Toggle label="Exclude holidays from unpaid leave" disabled={!canManage} checked={boolValue(draft.holidays_exclude_from_unpaid_leave)} onChange={(value) => onChange({ ...draft, holidays_exclude_from_unpaid_leave: value })} />
        <Toggle label="Attendance absence excused on holidays" disabled={!canManage} checked={boolValue(draft.holidays_count_as_attendance_excused)} onChange={(value) => onChange({ ...draft, holidays_count_as_attendance_excused: value })} />
        <Toggle label="Work on holiday creates overtime flag" disabled={!canManage} checked={boolValue(draft.holiday_work_overtime_enabled)} onChange={(value) => onChange({ ...draft, holiday_work_overtime_enabled: value })} />
        <Toggle label="Pay holidays during long leave" disabled={!canManage} checked={boolValue(draft.pay_holidays_during_long_leave)} onChange={(value) => onChange({ ...draft, pay_holidays_during_long_leave: value })} />
        <Toggle label="Replacement holidays enabled" disabled={!canManage} checked={boolValue(draft.replacement_holidays_enabled)} onChange={(value) => onChange({ ...draft, replacement_holidays_enabled: value })} />
        <Toggle label="Holiday import enabled" disabled={!canManage} checked={boolValue(draft.holiday_import_enabled)} onChange={(value) => onChange({ ...draft, holiday_import_enabled: value })} />
        <Label className="grid gap-1 text-sm">Default holiday pay multiplier<Input disabled={!canManage} type="number" min={0} step="0.1" value={draft.default_holiday_pay_multiplier ?? 1.5} onChange={(event) => onChange({ ...draft, default_holiday_pay_multiplier: Number(event.target.value) })} /></Label>
        <Label className="grid gap-1 text-sm md:col-span-2">Reason<Textarea disabled={!canManage} value={draft.reason ?? ""} onChange={(event) => onChange({ ...draft, reason: event.target.value })} /></Label>
      </div>
      {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Holiday settings could not be saved.", "leave")} /> : null}
      {!canManage ? <InlineAlert title="You can view holiday settings, but your role cannot edit them." /> : null}
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button><Button disabled={!canManage || loading || !draft.reason} onClick={onSubmit}>Save settings</Button></DialogFooter>
    </DialogContent>
  </Dialog>
);
