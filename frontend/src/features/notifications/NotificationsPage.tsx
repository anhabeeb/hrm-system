import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Mail, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { PageActionBar } from "@/components/layout/PageActionBar";
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
import { notificationsApi } from "./notifications.api";
import type { NotificationFilters, NotificationPreference, NotificationRecord } from "./notifications.types";
import { emailNotificationsApi } from "./email-notifications.api";
import type { EmailNotificationRecord, EmailPreference, EmailSettings, EmailTemplate } from "./email-notifications.types";

const categories = ["leave", "long_leave", "attendance", "biometric", "roster", "holiday", "payroll", "documents", "contracts", "assets", "uniforms", "approvals", "system", "security", "backup"];
const priorities = ["low", "normal", "high", "urgent"];
const statuses = ["unread", "read", "archived", "dismissed"];

const label = (value?: string | null) => String(value ?? "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const timeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const defaultPreference = (category: string, existing?: NotificationPreference): NotificationPreference => ({
  category,
  enabled: existing?.enabled ?? true,
  minimum_priority: existing?.minimum_priority ?? "low",
  muted_until: existing?.muted_until ?? "",
});

const featureOn = (auth: ReturnType<typeof useAuth>, feature: string) => auth.hasFeature(feature);
const payrollSubFeatureOn = (auth: ReturnType<typeof useAuth>, key: string) => auth.payrollSubFeatures?.[key] !== false;
const attendanceSubFeatureOn = (auth: ReturnType<typeof useAuth>, key: string) => auth.attendanceSubFeatures?.[key] !== false;

const notificationCategoryVisible = (auth: ReturnType<typeof useAuth>, category: string) => {
  if (["system", "security", "backup"].includes(category)) return true;
  if (category === "leave") return featureOn(auth, "leave") || featureOn(auth, "leave_management");
  if (category === "long_leave") return featureOn(auth, "long_leave_management");
  if (category === "documents") return featureOn(auth, "documents") || featureOn(auth, "documents_kyc");
  if (category === "contracts") return featureOn(auth, "contract_tracking");
  if (category === "assets") return featureOn(auth, "asset_tracking");
  if (category === "uniforms") return featureOn(auth, "uniform_tracking");
  if (category === "roster") return featureOn(auth, "roster");
  if (category === "holiday") return featureOn(auth, "leave") || featureOn(auth, "leave_management") || featureOn(auth, "roster");
  if (category === "biometric") return featureOn(auth, "attendance") && (featureOn(auth, "biometric") || featureOn(auth, "biometric_attendance")) && attendanceSubFeatureOn(auth, "attendance.biometric_enabled");
  if (category === "attendance") return featureOn(auth, "attendance");
  if (category === "payroll") return featureOn(auth, "payroll") && payrollSubFeatureOn(auth, "payroll.salary_processing_enabled");
  if (category === "approvals") return featureOn(auth, "approvals");
  return true;
};

export const NotificationsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "notifications");
  const [success, setSuccess] = useState<string | null>(null);
  const [emailSettingsReason, setEmailSettingsReason] = useState("");

  const filters = useMemo<NotificationFilters>(() => ({
    status: searchParams.get("status") || undefined,
    category: searchParams.get("category") || undefined,
    priority: searchParams.get("priority") || undefined,
    unread_only: searchParams.get("unread_only") === "true" ? true : undefined,
    include_archived: searchParams.get("include_archived") === "true" ? true : undefined,
    from_date: searchParams.get("from_date") || undefined,
    to_date: searchParams.get("to_date") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<NotificationFilters>) => {
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
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const listQuery = useQuery({ queryKey: ["notifications", "list", filters], queryFn: () => notificationsApi.list(filters) });
  const countQuery = useQuery({ queryKey: ["notifications", "unread-count"], queryFn: notificationsApi.unreadCount });
  const preferencesQuery = useQuery({ queryKey: ["notifications", "preferences"], queryFn: notificationsApi.preferences });
  const emailListQuery = useQuery({ queryKey: ["email-notifications", "list", filters], queryFn: () => emailNotificationsApi.list(filters) });
  const emailPreferencesQuery = useQuery({ queryKey: ["email-notifications", "preferences"], queryFn: emailNotificationsApi.preferences });
  const emailSettingsQuery = useQuery({ queryKey: ["email-notifications", "settings"], queryFn: emailNotificationsApi.settings });
  const emailTemplatesQuery = useQuery({ queryKey: ["email-notifications", "templates"], queryFn: emailNotificationsApi.templates });

  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "read" | "unread" | "archive" | "dismiss" }) => {
      if (action === "read") return notificationsApi.markRead(id);
      if (action === "unread") return notificationsApi.markUnread(id);
      if (action === "dismiss") return notificationsApi.dismiss(id);
      return notificationsApi.archive(id);
    },
    onSuccess: async (_, variables) => {
      setSuccess(variables.action === "archive" ? "Notification archived." : variables.action === "dismiss" ? "Notification dismissed." : "Notification status updated.");
      await refresh();
    },
  });
  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(filters),
    onSuccess: async () => {
      setSuccess("Matching notifications marked as read.");
      await refresh();
    },
  });
  const preferenceMutation = useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onSuccess: async () => {
      setSuccess("Notification preferences saved.");
      await refresh();
    },
  });
  const emailRetryMutation = useMutation({
    mutationFn: emailNotificationsApi.retry,
    onSuccess: async () => {
      setSuccess("Email retry processed.");
      await queryClient.invalidateQueries({ queryKey: ["email-notifications"] });
    },
  });
  const emailPreferenceMutation = useMutation({
    mutationFn: emailNotificationsApi.updatePreferences,
    onSuccess: async () => {
      setSuccess("Email preferences saved.");
      await queryClient.invalidateQueries({ queryKey: ["email-notifications"] });
    },
  });
  const emailSettingsMutation = useMutation({
    mutationFn: emailNotificationsApi.updateSettings,
    onSuccess: async () => {
      setSuccess("Email notification settings saved.");
      setEmailSettingsReason("");
      await queryClient.invalidateQueries({ queryKey: ["email-notifications"] });
    },
  });

  const canManage = auth.hasAnyPermission(["notifications.manage_own", "notifications.preferences.manage"]);
  const canManageEmail = auth.hasAnyPermission(["email_notifications.preferences.manage", "email_notifications.view_own"]);
  const canAdminEmail = auth.hasAnyPermission(["email_notifications.admin.view", "email_notifications.admin.manage"]);
  const canRetryEmail = auth.hasAnyPermission(["email_notifications.retry", "email_notifications.admin.manage"]);
  const canManageEmailSettings = auth.hasAnyPermission(["email_notifications.settings.manage", "email_notifications.admin.manage"]);
  const visibleCategories = useMemo(() => categories.filter((category) => notificationCategoryVisible(auth, category)), [auth]);
  useEffect(() => {
    if (filters.category && !visibleCategories.includes(filters.category)) {
      updateFilters({ category: undefined });
    }
  }, [filters.category, visibleCategories]);
  const rows = listQuery.data?.data ?? [];
  const existingPreferences = preferencesQuery.data?.data.preferences ?? [];
  const preferenceRows = visibleCategories.map((category) => defaultPreference(category, existingPreferences.find((row) => row.category === category)));
  const existingEmailPreferences = emailPreferencesQuery.data?.data.preferences ?? [];
  const emailPreferenceRows = visibleCategories.map((category) => defaultEmailPreference(category, existingEmailPreferences.find((row) => row.category === category)));
  const emailRows = emailListQuery.data?.data ?? [];
  const emailSettings = emailSettingsQuery.data?.data.settings;

  const columns: TableColumn<NotificationRecord>[] = [
    { key: "title", header: "Notification", cell: (row) => <div><p className="font-medium">{row.title}</p><p className="text-xs text-muted-foreground">{row.message}</p></div> },
    { key: "category", header: "Category", cell: (row) => label(row.category) },
    { key: "priority", header: "Priority", cell: (row) => <StatusBadge status={row.priority} /> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "created_at", header: "Created", cell: (row) => timeLabel(row.created_at) },
    { key: "action_url", header: "Action", cell: (row) => row.action_url ? <Button variant="link" size="sm" asChild><Link to={row.action_url}>{row.action_label ?? "Open"}<ExternalLink className="ml-1 h-3 w-3" /></Link></Button> : "-" },
  ];

  return (
    <div>
      <PageActionBar label="Notifications page actions"><Button variant="outline" disabled={markAllMutation.isPending} onClick={() => markAllMutation.mutate()}><Check className="h-4 w-4" />Mark filtered read</Button></PageActionBar>
      <div className="space-y-4 p-4 md:p-6">
        {success ? <InlineAlert variant="success" title={success} /> : null}
        {(listQuery.error || countQuery.error || preferencesQuery.error || emailListQuery.error || emailPreferencesQuery.error || emailSettingsQuery.error || statusMutation.error || markAllMutation.error || preferenceMutation.error || emailRetryMutation.error || emailPreferenceMutation.error || emailSettingsMutation.error) ? (
          <InlineAlert variant="error" title={friendlyHrmError(listQuery.error ?? countQuery.error ?? preferencesQuery.error ?? emailListQuery.error ?? emailPreferencesQuery.error ?? emailSettingsQuery.error ?? statusMutation.error ?? markAllMutation.error ?? preferenceMutation.error ?? emailRetryMutation.error ?? emailPreferenceMutation.error ?? emailSettingsMutation.error, "Notifications could not be updated.")} />
        ) : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-5">
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Status<Select value={filters.status ?? "active"} onValueChange={(value) => updateFilters({ status: value === "active" ? undefined : value, include_archived: value === "archived" || value === "dismissed" ? true : filters.include_archived })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem>{statuses.map((status) => <SelectItem key={status} value={status}>{label(status)}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Category<Select value={filters.category ?? "all"} onValueChange={(value) => updateFilters({ category: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{visibleCategories.map((category) => <SelectItem key={category} value={category}>{label(category)}</SelectItem>)}</SelectContent></Select></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Priority<Select value={filters.priority ?? "all"} onValueChange={(value) => updateFilters({ priority: value === "all" ? undefined : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All priorities</SelectItem>{priorities.map((priority) => <SelectItem key={priority} value={priority}>{label(priority)}</SelectItem>)}</SelectContent></Select></Label>
          <div className="md:col-span-2">
            <AppDateRangePicker
              dateFrom={filters.from_date}
              dateTo={filters.to_date}
              onChange={({ dateFrom, dateTo }) => updateFilters({ from_date: dateFrom, to_date: dateTo })}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
          <Badge>Unread: {countQuery.data?.data.unread_count ?? 0}</Badge>
          <Badge variant="outline">Urgent: {countQuery.data?.data.urgent_count ?? 0}</Badge>
          <Label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Unread only<Switch checked={Boolean(filters.unread_only)} onCheckedChange={(value) => updateFilters({ unread_only: value })} /></Label>
          <Label className="flex items-center gap-2 text-xs text-muted-foreground">Include archived/dismissed<Switch checked={Boolean(filters.include_archived)} onCheckedChange={(value) => updateFilters({ include_archived: value })} /></Label>
        </div>
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="notifications">Notification List</TabsTrigger>
            <TabsTrigger value="preferences">In-App Preferences</TabsTrigger>
            <TabsTrigger value="email-delivery">Email Delivery Log</TabsTrigger>
            <TabsTrigger value="email-preferences">Email Preferences</TabsTrigger>
            <TabsTrigger value="email-settings">Email Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="notifications">
            <DataTable
              rows={rows}
              columns={columns}
              loading={listQuery.isLoading}
              pagination={listQuery.data?.pagination}
              getRowId={(row) => row.id}
              rowActions={(row) => <RowActions actions={[
                row.status === "read" ? { key: "enable", label: "Mark unread", onSelect: () => statusMutation.mutate({ id: row.id, action: "unread" }) } : { key: "approve", label: "Mark read", onSelect: () => statusMutation.mutate({ id: row.id, action: "read" }) },
                { key: "archive", label: "Archive", onSelect: () => statusMutation.mutate({ id: row.id, action: "archive" }) },
                { key: "delete", label: "Dismiss", onSelect: () => statusMutation.mutate({ id: row.id, action: "dismiss" }) },
              ]} />}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
              emptyTitle="No notifications"
              emptyDescription="You are all caught up for the current filters."
            />
          </TabsContent>
          <TabsContent value="preferences">
            <NotificationPreferencesPanel rows={preferenceRows} disabled={!canManage || preferenceMutation.isPending} onSave={(next) => preferenceMutation.mutate(next)} />
          </TabsContent>
          <TabsContent value="email-delivery">
            <EmailDeliveryPanel
              rows={emailRows}
              loading={emailListQuery.isLoading}
              pagination={emailListQuery.data?.pagination}
              canRetry={canRetryEmail}
              canAdmin={canAdminEmail}
              onRetry={(id) => emailRetryMutation.mutate(id)}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="email-preferences">
            <EmailPreferencesPanel rows={emailPreferenceRows} disabled={!canManageEmail || emailPreferenceMutation.isPending} onSave={(next) => emailPreferenceMutation.mutate(next)} />
          </TabsContent>
          <TabsContent value="email-settings">
            <EmailSettingsPanel
              settings={emailSettings}
              templates={(emailTemplatesQuery.data?.data.templates ?? []).filter((template) => visibleCategories.includes(template.category))}
              disabled={!canManageEmailSettings || emailSettingsMutation.isPending}
              reason={emailSettingsReason}
              onReasonChange={setEmailSettingsReason}
              onSave={(next) => emailSettingsMutation.mutate({ ...next, reason: emailSettingsReason })}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const NotificationPreferencesPanel = ({ rows, disabled, onSave }: { rows: NotificationPreference[]; disabled?: boolean; onSave: (rows: NotificationPreference[]) => void }) => {
  const [draft, setDraft] = useState(rows);
  useEffect(() => setDraft(rows), [rows]);
  const update = (category: string, patch: Partial<NotificationPreference>) => setDraft((current) => current.map((row) => row.category === category ? { ...row, ...patch } : row));
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <InlineAlert title="These are in-app preferences only. Email notification settings will come later in Phase 10B." />
      <DataTable
        rows={draft}
        columns={[
          { key: "category", header: "Category", cell: (row) => label(row.category) },
          { key: "enabled", header: "Enabled", cell: (row) => <Switch disabled={disabled || ["security", "system"].includes(row.category)} checked={row.enabled === true || row.enabled === 1} onCheckedChange={(enabled) => update(row.category, { enabled })} /> },
          { key: "minimum_priority", header: "Minimum priority", cell: (row) => <Select disabled={disabled} value={String(row.minimum_priority ?? "low")} onValueChange={(value) => update(row.category, { minimum_priority: value })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{priorities.map((priority) => <SelectItem key={priority} value={priority}>{label(priority)}</SelectItem>)}</SelectContent></Select> },
          { key: "muted_until", header: "Muted until", cell: (row) => <Input disabled={disabled} type="datetime-local" value={(row.muted_until ?? "").slice(0, 16)} onChange={(event) => update(row.category, { muted_until: event.target.value ? new Date(event.target.value).toISOString() : "" })} /> },
        ]}
        getRowId={(row) => row.category}
        compact
      />
      <div className="flex justify-end"><Button disabled={disabled} onClick={() => onSave(draft)}>Save preferences</Button></div>
    </div>
  );
};

const defaultEmailPreference = (category: string, existing?: EmailPreference): EmailPreference => ({
  category,
  email_enabled: existing?.email_enabled ?? true,
  minimum_priority_for_email: existing?.minimum_priority_for_email ?? "normal",
  muted_until: existing?.muted_until ?? "",
  digest_enabled: existing?.digest_enabled ?? false,
});

const EmailPreferencesPanel = ({ rows, disabled, onSave }: { rows: EmailPreference[]; disabled?: boolean; onSave: (rows: EmailPreference[]) => void }) => {
  const [draft, setDraft] = useState(rows);
  useEffect(() => setDraft(rows), [rows]);
  const update = (category: string, patch: Partial<EmailPreference>) => setDraft((current) => current.map((row) => row.category === category ? { ...row, ...patch } : row));
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <InlineAlert title="Email preferences are separate from in-app notifications. Phase 10B creates safe email jobs only." />
      <DataTable
        rows={draft}
        columns={[
          { key: "category", header: "Category", cell: (row) => label(row.category) },
          { key: "email_enabled", header: "Email enabled", cell: (row) => <Switch disabled={disabled || ["security", "system"].includes(row.category)} checked={row.email_enabled === true || row.email_enabled === 1} onCheckedChange={(email_enabled) => update(row.category, { email_enabled })} /> },
          { key: "minimum_priority_for_email", header: "Minimum email priority", cell: (row) => <Select disabled={disabled} value={String(row.minimum_priority_for_email ?? "normal")} onValueChange={(value) => update(row.category, { minimum_priority_for_email: value })}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{priorities.map((priority) => <SelectItem key={priority} value={priority}>{label(priority)}</SelectItem>)}</SelectContent></Select> },
          { key: "muted_until", header: "Muted until", cell: (row) => <Input disabled={disabled} type="datetime-local" value={(row.muted_until ?? "").slice(0, 16)} onChange={(event) => update(row.category, { muted_until: event.target.value ? new Date(event.target.value).toISOString() : "" })} /> },
        ]}
        getRowId={(row) => row.category}
        compact
      />
      <div className="flex justify-end"><Button disabled={disabled} onClick={() => onSave(draft)}>Save email preferences</Button></div>
    </div>
  );
};

const EmailDeliveryPanel = ({
  rows,
  loading,
  pagination,
  canRetry,
  canAdmin,
  onRetry,
  onPageChange,
  onPageSizeChange,
}: {
  rows: EmailNotificationRecord[];
  loading?: boolean;
  pagination?: { page: number; page_size: number; total: number; total_pages: number };
  canRetry: boolean;
  canAdmin: boolean;
  onRetry: (id: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) => (
  <div className="space-y-3">
    <InlineAlert title={canAdmin ? "Admin delivery log shows safe delivery metadata only. Provider secrets and raw responses are never displayed." : "You can view your own email notification delivery records."} />
    <DataTable
      rows={rows}
      columns={[
        { key: "subject", header: "Subject", cell: (row) => <div><p className="font-medium">{row.subject}</p><p className="text-xs text-muted-foreground">{row.recipient_name ?? row.recipient_email ?? "Recipient unavailable"}</p></div> },
        { key: "category", header: "Category", cell: (row) => label(row.category) },
        { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
        { key: "attempt_count", header: "Attempts", cell: (row) => row.attempt_count },
        { key: "last_attempt_at", header: "Last attempt", cell: (row) => row.last_attempt_at ? timeLabel(row.last_attempt_at) : "-" },
        { key: "failure_message", header: "Failure", cell: (row) => <span className="text-xs text-muted-foreground">{row.failure_message ?? "-"}</span> },
      ]}
      loading={loading}
      pagination={pagination}
      getRowId={(row) => row.id}
      rowActions={(row) => <RowActions actions={[
        { key: "rebuild", label: "Retry email", disabled: !canRetry || row.status === "sent" || row.status.startsWith("skipped"), onSelect: () => onRetry(row.id) },
      ]} />}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      emptyTitle="No email delivery records"
      emptyDescription="Email jobs will appear here when HRM events create email notifications."
    />
  </div>
);

const EmailSettingsPanel = ({
  settings,
  templates,
  disabled,
  reason,
  onReasonChange,
  onSave,
}: {
  settings?: EmailSettings;
  templates: EmailTemplate[];
  disabled?: boolean;
  reason: string;
  onReasonChange: (reason: string) => void;
  onSave: (settings: Partial<EmailSettings>) => void;
}) => {
  const [draft, setDraft] = useState<Partial<EmailSettings>>({});
  useEffect(() => setDraft(settings ?? {}), [settings]);
  const provider = settings?.provider_status;
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={provider?.configured ? "default" : "secondary"}><Mail className="mr-1 h-3 w-3" />Provider: {provider?.provider ?? "not configured"}</Badge>
        <Badge variant="outline">Status: {label(provider?.status)}</Badge>
        {provider?.dry_run ? <Badge variant="outline">Dry-run</Badge> : null}
        <span className="text-xs text-muted-foreground">No API keys or provider secrets are shown here.</span>
      </div>
      {provider?.reason ? <InlineAlert title={provider.reason} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Label className="flex items-center gap-2 text-sm">Enabled<Switch disabled={disabled} checked={Boolean(draft.enabled)} onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))} /></Label>
        <Label className="flex items-center gap-2 text-sm">Send immediately<Switch disabled={disabled} checked={Boolean(draft.send_immediately)} onCheckedChange={(send_immediately) => setDraft((current) => ({ ...current, send_immediately }))} /></Label>
        <Label className="flex items-center gap-2 text-sm">Admin failure notices<Switch disabled={disabled} checked={Boolean(draft.admin_failure_notifications)} onCheckedChange={(admin_failure_notifications) => setDraft((current) => ({ ...current, admin_failure_notifications }))} /></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground">Minimum priority<Select disabled={disabled} value={String(draft.minimum_priority ?? "normal")} onValueChange={(minimum_priority) => setDraft((current) => ({ ...current, minimum_priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{priorities.map((priority) => <SelectItem key={priority} value={priority}>{label(priority)}</SelectItem>)}</SelectContent></Select></Label>
        <Label className="space-y-1 text-xs font-medium text-muted-foreground md:col-span-2">Reason required<Input disabled={disabled} value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Reason for changing email notification settings" /></Label>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Code email templates</p>
        <DataTable
          rows={templates}
          columns={[
            { key: "template_key", header: "Template", cell: (row) => row.template_key },
            { key: "template_name", header: "Name", cell: (row) => row.template_name },
            { key: "category", header: "Category", cell: (row) => label(row.category) },
            { key: "version", header: "Version", cell: (row) => row.version },
          ]}
          getRowId={(row) => row.template_key}
          compact
        />
      </div>
      <div className="flex justify-end"><Button disabled={disabled || !reason.trim()} onClick={() => onSave(draft)}><RefreshCw className="h-4 w-4" />Save email settings</Button></div>
    </div>
  );
};
