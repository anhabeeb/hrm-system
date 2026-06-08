import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, RefreshCw, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import type { TableColumn } from "@/types/common";
import { expiryAlertsApi } from "./expiry-alerts.api";
import type { ExpiryAlert, ExpiryAlertFilters, ExpiryAlertSettings, ExpiryScanInput } from "./expiry-alerts.types";

const sourceTypes = ["employee_document", "employee_passport", "employee_work_permit", "contract", "probation", "long_leave_return"];
const severities = ["info", "warning", "high", "critical"];
const statuses = ["open", "acknowledged", "snoozed", "resolved", "dismissed"];
const defaultScanDate = () => new Date().toISOString().slice(0, 10);
const label = (value?: string | null) => String(value ?? "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const dateLabel = (value?: string | null) => value ? value.slice(0, 10) : "-";

const reasonPrompt = (message: string) => window.prompt(message)?.trim() ?? "";

export const ExpiryAlertsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "alerts");
  const [success, setSuccess] = useState<string | null>(null);
  const [scan, setScan] = useState<ExpiryScanInput>({ as_of_date: defaultScanDate(), warning_days: [90, 60, 30, 14, 7, 1] });

  const filters = useMemo<ExpiryAlertFilters>(() => ({
    status: searchParams.get("status") || undefined,
    severity: searchParams.get("severity") || undefined,
    source_type: searchParams.get("source_type") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    alert_type: searchParams.get("alert_type") || undefined,
    from_date: searchParams.get("from_date") || undefined,
    to_date: searchParams.get("to_date") || undefined,
    include_closed: searchParams.get("include_closed") === "true" ? true : undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<ExpiryAlertFilters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" || value === false ? params.delete(key) : params.set(key, String(value)));
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

  const listQuery = useQuery({ queryKey: ["expiry-alerts", "list", filters], queryFn: () => expiryAlertsApi.list(filters) });
  const summaryQuery = useQuery({ queryKey: ["expiry-alerts", "summary"], queryFn: expiryAlertsApi.summary });
  const settingsQuery = useQuery({ queryKey: ["expiry-alerts", "settings"], queryFn: expiryAlertsApi.settings });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["expiry-alerts"] });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, reason, snoozed_until }: { id: string; action: "acknowledge" | "resolve" | "dismiss" | "snooze"; reason?: string; snoozed_until?: string }) => {
      if (action === "resolve") return expiryAlertsApi.resolve(id, reason ?? "");
      if (action === "dismiss") return expiryAlertsApi.dismiss(id, reason ?? "");
      if (action === "snooze") return expiryAlertsApi.snooze(id, reason ?? "", snoozed_until ?? "");
      return expiryAlertsApi.acknowledge(id, reason);
    },
    onSuccess: async (_, variables) => {
      setSuccess(`Expiry alert ${variables.action === "snooze" ? "snoozed" : `${variables.action}d`}.`);
      await refresh();
    },
  });
  const previewMutation = useMutation({ mutationFn: expiryAlertsApi.previewScan });
  const runMutation = useMutation({
    mutationFn: expiryAlertsApi.runScan,
    onSuccess: async (response) => {
      setSuccess(`Expiry scan complete. ${response.data.created} created, ${response.data.refreshed} refreshed, ${response.data.notified} notification(s) queued.`);
      await refresh();
    },
  });
  const settingsMutation = useMutation({
    mutationFn: expiryAlertsApi.updateSettings,
    onSuccess: async () => {
      setSuccess("Expiry alert settings saved.");
      await refresh();
    },
  });

  const rows = listQuery.data?.data ?? [];
  const summary = summaryQuery.data?.data.summary;
  const canScan = auth.hasAnyPermission(["expiry_alerts.scan", "expiry_alerts.manage"]);
  const canManage = auth.hasAnyPermission(["expiry_alerts.manage"]);
  const canManageSettings = auth.hasAnyPermission(["expiry_alerts.settings.manage"]);
  const errors = listQuery.error ?? summaryQuery.error ?? settingsQuery.error ?? actionMutation.error ?? previewMutation.error ?? runMutation.error ?? settingsMutation.error;

  const columns: TableColumn<ExpiryAlert>[] = [
    { key: "title", header: "Alert", cell: (row) => <div><p className="font-medium">{row.title}</p><p className="text-xs text-muted-foreground">{row.message}</p></div> },
    { key: "source_type", header: "Source", cell: (row) => <div><p>{label(row.source_type)}</p><p className="text-xs text-muted-foreground">{row.source_label}</p></div> },
    { key: "expiry_date", header: "Expiry", cell: (row) => <div><p>{dateLabel(row.expiry_date)}</p><p className="text-xs text-muted-foreground">{row.days_until_expiry < 0 ? `${Math.abs(row.days_until_expiry)} overdue` : `${row.days_until_expiry} days`}</p></div> },
    { key: "severity", header: "Severity", cell: (row) => <StatusBadge status={row.severity} /> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "last_detected_at", header: "Detected", cell: (row) => dateLabel(row.last_detected_at) },
    { key: "action_url", header: "Link", cell: (row) => row.action_url ? <Button variant="link" size="sm" asChild><Link to={row.action_url}>Open record</Link></Button> : "-" },
  ];

  return (
    <div>
      <PageHeader
        title="Expiry Alerts"
        description="Scan, review, and resolve expiring employee documents, identity dates, contracts, probation dates, and long-leave return dates."
        actions={<Button disabled={!canScan || runMutation.isPending} onClick={() => runMutation.mutate(scan)}><RefreshCw className="h-4 w-4" />Run scan</Button>}
      />
      <div className="space-y-4 p-4 md:p-6">
        {success ? <InlineAlert variant="success" title={success} /> : null}
        {errors ? <InlineAlert variant="error" title={friendlyHrmError(errors, "Expiry alerts could not be updated.")} /> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm md:grid-cols-8">
          <Badge variant="outline"><BellRing className="mr-1 h-3 w-3" />Active: {summary?.active_count ?? 0}</Badge>
          <Badge>Open: {summary?.open_count ?? 0}</Badge>
          <Badge variant="destructive">Critical: {summary?.critical_count ?? 0}</Badge>
          <Badge variant="outline">High: {summary?.high_count ?? 0}</Badge>
          <Badge variant="outline">Warning: {summary?.warning_count ?? 0}</Badge>
          <Badge variant="outline">Overdue: {summary?.overdue_count ?? 0}</Badge>
          <Badge variant="outline">Due 7d: {summary?.due_7_days_count ?? 0}</Badge>
          <Badge variant="outline">Due 30d: {summary?.due_30_days_count ?? 0}</Badge>
        </div>
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-6">
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Status<Select value={filters.status ?? "active"} onValueChange={(value) => updateFilters({ status: value === "active" ? undefined : value, include_closed: value === "resolved" || value === "dismissed" ? true : filters.include_closed })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem>{statuses.map((status) => <SelectItem key={status} value={status}>{label(status)}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Severity<Select value={filters.severity ?? "all"} onValueChange={(value) => updateFilters({ severity: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{severities.map((severity) => <SelectItem key={severity} value={severity}>{label(severity)}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Source<Select value={filters.source_type ?? "all"} onValueChange={(value) => updateFilters({ source_type: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{sourceTypes.map((source) => <SelectItem key={source} value={source}>{label(source)}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">From<Input type="date" value={filters.from_date ?? ""} onChange={(event) => updateFilters({ from_date: event.target.value })} /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">To<Input type="date" value={filters.to_date ?? ""} onChange={(event) => updateFilters({ to_date: event.target.value })} /></Label>
          <Label className="flex items-end gap-2 text-xs text-muted-foreground">Include closed<Switch checked={Boolean(filters.include_closed)} onCheckedChange={(include_closed) => updateFilters({ include_closed })} /></Label>
        </div>
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="alerts">Alert List</TabsTrigger>
            <TabsTrigger value="scan">Scan</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="alerts">
            <DataTable
              rows={rows}
              columns={columns}
              loading={listQuery.isLoading}
              pagination={listQuery.data?.pagination}
              getRowId={(row) => row.id}
              compact
              rowActions={(row) => <RowActions actions={[
                { key: "approve", label: "Acknowledge", disabled: !canManage || row.status === "acknowledged", onSelect: () => actionMutation.mutate({ id: row.id, action: "acknowledge" }) },
                { key: "rebuild", label: "Snooze", disabled: !canManage, onSelect: () => {
                  const reason = reasonPrompt("Reason for snoozing this alert");
                  if (!reason) return;
                  const snoozed_until = window.prompt("Snooze until (YYYY-MM-DD)", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))?.trim();
                  if (snoozed_until) actionMutation.mutate({ id: row.id, action: "snooze", reason, snoozed_until });
                } },
                { key: "enable", label: "Resolve", disabled: !canManage, onSelect: () => {
                  const reason = reasonPrompt("Reason for resolving this alert");
                  if (reason) actionMutation.mutate({ id: row.id, action: "resolve", reason });
                } },
                { key: "archive", label: "Dismiss", disabled: !canManage, onSelect: () => {
                  const reason = reasonPrompt("Reason for dismissing this alert");
                  if (reason) actionMutation.mutate({ id: row.id, action: "dismiss", reason });
                } },
              ]} />}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
              emptyTitle="No expiry alerts"
              emptyDescription="Run a scan or adjust filters to review upcoming expiry items."
            />
          </TabsContent>
          <TabsContent value="scan">
            <ScanPanel scan={scan} setScan={setScan} canScan={canScan} previewMutation={previewMutation} runMutation={runMutation} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsPanel settings={settingsQuery.data?.data.settings} disabled={!canManageSettings || settingsMutation.isPending} onSave={(next) => settingsMutation.mutate(next)} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const ScanPanel = ({
  scan,
  setScan,
  canScan,
  previewMutation,
  runMutation,
}: {
  scan: ExpiryScanInput;
  setScan: (input: ExpiryScanInput) => void;
  canScan: boolean;
  previewMutation: any;
  runMutation: any;
}) => {
  const previewRows = (previewMutation.data?.data.candidates ?? []) as ExpiryAlert[];
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <InlineAlert title="Preview does not write alert records or send notifications. Run scan applies idempotently and uses the in-app/email notification bridge." />
      <div className="grid gap-3 md:grid-cols-5">
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">As-of date<Input type="date" value={scan.as_of_date} onChange={(event) => setScan({ ...scan, as_of_date: event.target.value })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Through date<Input type="date" value={scan.through_date ?? ""} onChange={(event) => setScan({ ...scan, through_date: event.target.value || undefined })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Warning days<Input value={(scan.warning_days ?? []).join(",")} onChange={(event) => setScan({ ...scan, warning_days: event.target.value.split(",").map((value) => Number(value.trim())).filter(Number.isFinite) })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Source<Select value={scan.source_type ?? "all"} onValueChange={(value) => setScan({ ...scan, source_type: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{sourceTypes.map((source) => <SelectItem key={source} value={source}>{label(source)}</SelectItem>)}</SelectContent></Select></Label>
        <div className="flex items-end gap-2">
          <Button variant="outline" disabled={!canScan || previewMutation.isPending} onClick={() => previewMutation.mutate(scan)}><Search className="h-4 w-4" />Preview</Button>
          <Button disabled={!canScan || runMutation.isPending} onClick={() => runMutation.mutate(scan)}><RefreshCw className="h-4 w-4" />Run</Button>
        </div>
      </div>
      <DataTable<ExpiryAlert>
        rows={previewRows}
        columns={[
          { key: "title", header: "Candidate", cell: (row) => <div><p className="font-medium">{row.title}</p><p className="text-xs text-muted-foreground">{row.message}</p></div> },
          { key: "source_type", header: "Source", cell: (row) => label(row.source_type) },
          { key: "expiry_date", header: "Expiry", cell: (row) => dateLabel(row.expiry_date) },
          { key: "severity", header: "Severity", cell: (row) => <StatusBadge status={row.severity} /> },
        ]}
        getRowId={(row) => row.id ?? row.idempotency_key ?? `${row.source_type}-${row.source_label}-${row.expiry_date}`}
        compact
        emptyTitle="No preview results"
        emptyDescription="Preview a scan to see candidate expiry alerts before writing records."
      />
    </div>
  );
};

const SettingsPanel = ({ settings, disabled, onSave }: { settings?: ExpiryAlertSettings; disabled?: boolean; onSave: (settings: Partial<ExpiryAlertSettings> & { reason: string }) => void }) => {
  const [draft, setDraft] = useState<ExpiryAlertSettings | undefined>(settings);
  const [reason, setReason] = useState("");
  useEffect(() => setDraft(settings), [settings]);
  if (!draft) return <InlineAlert title="Expiry alert settings are loading." />;
  const updateToggle = (key: string, value: boolean) => setDraft({ ...draft, source_toggles: { ...draft.source_toggles, [key]: value } });
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <InlineAlert title="Settings are company-scoped and backend-enforced. Email jobs are created through the Phase 10B notification bridge when email is enabled." />
      <div className="grid gap-3 md:grid-cols-4">
        <Label className="flex items-center gap-2 text-sm">Enabled<Switch disabled={disabled} checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /></Label>
        <Label className="flex items-center gap-2 text-sm">Overdue alerts<Switch disabled={disabled} checked={draft.overdue_enabled} onCheckedChange={(overdue_enabled) => setDraft({ ...draft, overdue_enabled })} /></Label>
        <Label className="flex items-center gap-2 text-sm">In-app notifications<Switch disabled={disabled} checked={draft.in_app_enabled} onCheckedChange={(in_app_enabled) => setDraft({ ...draft, in_app_enabled })} /></Label>
        <Label className="flex items-center gap-2 text-sm">Email notifications<Switch disabled={disabled} checked={draft.email_enabled} onCheckedChange={(email_enabled) => setDraft({ ...draft, email_enabled })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Warning days<Input disabled={disabled} value={draft.warning_days.join(",")} onChange={(event) => setDraft({ ...draft, warning_days: event.target.value.split(",").map((value) => Number(value.trim())).filter(Number.isFinite) })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Repeat<Select disabled={disabled} value={draft.repeat_frequency} onValueChange={(repeat_frequency) => setDraft({ ...draft, repeat_frequency: repeat_frequency as ExpiryAlertSettings["repeat_frequency"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["daily", "weekly", "monthly", "none"].map((value) => <SelectItem key={value} value={value}>{label(value)}</SelectItem>)}</SelectContent></Select></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Quiet days<Input disabled={disabled} type="number" value={draft.quiet_days} onChange={(event) => setDraft({ ...draft, quiet_days: Number(event.target.value) })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Email severity<Select disabled={disabled} value={draft.minimum_email_severity} onValueChange={(minimum_email_severity) => setDraft({ ...draft, minimum_email_severity: minimum_email_severity as ExpiryAlertSettings["minimum_email_severity"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{severities.map((value) => <SelectItem key={value} value={value}>{label(value)}</SelectItem>)}</SelectContent></Select></Label>
      </div>
      <DataTable
        rows={Object.entries(draft.source_toggles).map(([key, enabled]) => ({ key, enabled }))}
        columns={[
          { key: "key", header: "Source", cell: (row) => label(row.key) },
          { key: "enabled", header: "Enabled", cell: (row) => <Switch disabled={disabled || ["assets", "uniforms"].includes(row.key)} checked={Boolean(row.enabled)} onCheckedChange={(enabled) => updateToggle(row.key, enabled)} /> },
          { key: "note", header: "Note", cell: (row) => ["assets", "uniforms"].includes(row.key) ? <span className="text-xs text-muted-foreground">No due-date field exists yet.</span> : "Scanned from real expiry fields." },
        ]}
        getRowId={(row) => row.key}
        compact
      />
      <div className="grid gap-3 md:grid-cols-3">
        <Label className="flex items-center gap-2 text-sm">Notify employee self<Switch disabled={disabled} checked={draft.notify_employee_self} onCheckedChange={(notify_employee_self) => setDraft({ ...draft, notify_employee_self })} /></Label>
        <Label className="flex items-center gap-2 text-sm">Include archived employees<Switch disabled={disabled} checked={draft.include_archived_employees} onCheckedChange={(include_archived_employees) => setDraft({ ...draft, include_archived_employees })} /></Label>
        <Label className="flex items-center gap-2 text-sm">Include inactive employees<Switch disabled={disabled} checked={draft.include_inactive_employees} onCheckedChange={(include_inactive_employees) => setDraft({ ...draft, include_inactive_employees })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Notify roles<Input disabled={disabled} value={draft.notify_roles.join(",")} onChange={(event) => setDraft({ ...draft, notify_roles: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Notify permissions<Input disabled={disabled} value={draft.notify_permissions.join(",")} onChange={(event) => setDraft({ ...draft, notify_permissions: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Reason<Input disabled={disabled} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for changing expiry alert settings" /></Label>
      </div>
      <div className="flex justify-end"><Button disabled={disabled || !reason.trim()} onClick={() => onSave({ ...draft, reason })}><CheckCircle2 className="h-4 w-4" />Save settings</Button></div>
    </div>
  );
};
