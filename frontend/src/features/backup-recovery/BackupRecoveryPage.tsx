import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, DatabaseBackup, RefreshCw, Settings2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { EmptyState } from "@/components/data/EmptyState";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { MetricTile } from "@/components/widgets/MetricTile";
import { StatusStrip } from "@/components/widgets/StatusStrip";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { sanitizeForDisplay } from "@/lib/safe-display";
import { formatBackupDate, formatBackupType, formatFileSize } from "./backup-recovery-format";
import { backupRecoveryApi } from "./backup-recovery.api";
import type { BackupCreatePayload, BackupFilters, BackupJob, BackupRestoreSettingsPayload, RestoreApplyPayload, RestoreJobPayload, RestoreRequest, RestoreRequestPayload, RetentionPolicyPayload } from "./backup-recovery.types";

const TechnicalDetails = ({ value }: { value: unknown }) => (
  <details className="rounded-lg border bg-muted/30 p-3">
    <summary className="cursor-pointer text-sm font-medium">Technical details</summary>
    <pre className="mt-3 max-h-72 overflow-auto rounded border bg-background p-3 text-xs">{JSON.stringify(sanitizeForDisplay(value ?? {}), null, 2)}</pre>
  </details>
);
const asOptionalString = (value: unknown) => typeof value === "string" ? value : null;
const asCount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : "—";
const asYesNo = (value: unknown) => value === true || value === 1 ? "Yes" : value === false || value === 0 ? "No" : "—";
const field = (source: Record<string, unknown> | undefined, keys: string[], fallback: unknown = "—") => keys.map((key) => source?.[key]).find((value) => value !== undefined && value !== null && value !== "") ?? fallback;

const BackupOverview = ({
  status,
  retention,
  settings,
}: {
  status?: Record<string, unknown>;
  retention?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}) => (
  <div className="grid gap-3 lg:grid-cols-4">
    <WidgetCard title="Backup Status" description="Current backup availability" icon={<DatabaseBackup className="h-4 w-4" />}>
      <div className="grid gap-2">
        <MetricTile label="Enabled" value={asYesNo(field(settings, ["backup_enabled"], field(status, ["backup_enabled"])))} status={field(settings, ["backup_enabled"], true) === false ? "warning" : "success"} />
        <StatusStrip compact items={[
          { label: "Last backup", value: String(field(status, ["last_backup_at", "last_backup_date"], "Not available")), status: "info" },
          { label: "Status", value: String(field(status, ["last_backup_status"], "Unknown")), status: "neutral" },
        ]} />
      </div>
    </WidgetCard>
    <WidgetCard title="Storage / Retention" description="Retention policy controls" icon={<ClipboardList className="h-4 w-4" />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Retention days" value={asCount(field(retention, ["retention_days"]))} />
        <MetricTile label="Monthly copies" value={asCount(field(retention, ["keep_monthly_count"]))} />
        <MetricTile label="Yearly copies" value={asCount(field(retention, ["keep_yearly_count"]))} />
        <MetricTile label="Auto delete" value={asYesNo(field(retention, ["auto_delete_enabled"]))} status="info" />
      </div>
    </WidgetCard>
    <WidgetCard title="Backup Jobs" description="Operational queue" icon={<RefreshCw className="h-4 w-4" />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Completed" value={asCount(field(status, ["completed_jobs", "completed_backups"]))} status="success" />
        <MetricTile label="Running" value={asCount(field(status, ["running_jobs", "processing_jobs"]))} status="info" />
        <MetricTile label="Failed" value={asCount(field(status, ["failed_jobs", "failed_backups"]))} status="danger" />
        <MetricTile label="Pending verification" value={asCount(field(status, ["pending_verification"]))} status="warning" />
      </div>
    </WidgetCard>
    <WidgetCard title="Restore Safety" description="Restore controls" icon={<ShieldCheck className="h-4 w-4" />}>
      <div className="grid gap-2 sm:grid-cols-2">
        <MetricTile label="Pending restores" value={asCount(field(status, ["pending_restore_requests", "pending_restores"]))} status="warning" />
        <MetricTile label="Dry runs" value={asCount(field(status, ["dry_run_jobs"]))} />
        <MetricTile label="Apply allowed" value={asYesNo(field(settings, ["allow_restore_apply"]))} status={field(settings, ["allow_restore_apply"], true) === false ? "danger" : "success"} />
        <MetricTile label="Super Admin required" value={asYesNo(field(settings, ["require_super_admin_for_restore"]))} status="info" />
      </div>
    </WidgetCard>
  </div>
);

const BackupCreateDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: BackupCreatePayload) => void }) => {
  const [backupType, setBackupType] = useState("company_data");
  const [reason, setReason] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create backup</DialogTitle><DialogDescription>Create a company-scoped backup package with manifest, checksum, and secret redaction.</DialogDescription></DialogHeader><Label className="space-y-1 text-sm">Backup type<Select value={backupType} onValueChange={setBackupType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="company_data">Company data</SelectItem><SelectItem value="metadata_only">Metadata only</SelectItem><SelectItem value="configuration">Configuration</SelectItem></SelectContent></Select></Label><Textarea placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />{error ? <InlineAlert title={error} variant="error" /> : null}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit({ backup_type: backupType, include_document_metadata: true, reason })}>Create backup</LoadingButton></DialogFooter></DialogContent></Dialog>;
};

const RestoreRequestDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: RestoreRequestPayload) => void }) => {
  const [payload, setPayload] = useState<RestoreRequestPayload>({ restore_scope: "dry_run", restore_mode: "dry_run", reason: "" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create restore job</DialogTitle><DialogDescription>Restore preview is read-only. Apply requires permission and typed confirmation.</DialogDescription></DialogHeader><Label className="space-y-1 text-sm">Backup ID<Input value={payload.backup_id ?? ""} onChange={(event) => setPayload((p) => ({ ...p, backup_id: event.target.value }))} /></Label><Label className="space-y-1 text-sm">Restore mode<Select value={payload.restore_mode} onValueChange={(value) => setPayload((p) => ({ ...p, restore_mode: value, restore_scope: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="dry_run">Dry run</SelectItem><SelectItem value="insert_missing">Insert missing</SelectItem><SelectItem value="upsert">Upsert</SelectItem><SelectItem value="replace_company_data">Replace company data</SelectItem></SelectContent></Select></Label><Textarea placeholder="Reason" value={payload.reason} onChange={(event) => setPayload((p) => ({ ...p, reason: event.target.value }))} />{error ? <InlineAlert title={error} variant="error" /> : null}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={() => onSubmit(payload)}>Create restore job</LoadingButton></DialogFooter></DialogContent></Dialog>;
};

const RetentionPolicyPanel = ({ data, canManage, loading, error, onSubmit }: { data?: Record<string, unknown>; canManage: boolean; loading?: boolean; error?: string | null; onSubmit: (payload: RetentionPolicyPayload) => void }) => {
  const [payload, setPayload] = useState<RetentionPolicyPayload>({ retention_days: 90, keep_monthly_count: 12, keep_yearly_count: 3, auto_delete_enabled: false, reason: "" });
  if (!canManage) return <EmptyState title="Retention policy is not available for your role." description="Backup retention settings require backup.manage_settings." />;
  return <div className="grid gap-4 lg:grid-cols-[1fr_420px]"><WidgetCard title="Retention Policy" description="Control how long backup packages are retained."><div className="grid gap-3 sm:grid-cols-2"><MetricTile label="Retention days" value={String(field(data, ["retention_days"], payload.retention_days))} /><MetricTile label="Monthly copies" value={String(field(data, ["keep_monthly_count"], payload.keep_monthly_count))} /><MetricTile label="Yearly copies" value={String(field(data, ["keep_yearly_count"], payload.keep_yearly_count))} /><MetricTile label="Auto delete" value={asYesNo(field(data, ["auto_delete_enabled"], payload.auto_delete_enabled))} /></div><div className="mt-3"><TechnicalDetails value={data} /></div></WidgetCard><div className="space-y-3 rounded-lg border bg-card p-4"><Label className="space-y-1 text-sm">Retention days<Input type="number" value={payload.retention_days ?? ""} onChange={(event) => setPayload((p) => ({ ...p, retention_days: Number(event.target.value) }))} /></Label><Label className="space-y-1 text-sm">Monthly copies<Input type="number" value={payload.keep_monthly_count ?? ""} onChange={(event) => setPayload((p) => ({ ...p, keep_monthly_count: Number(event.target.value) }))} /></Label><Label className="space-y-1 text-sm">Yearly copies<Input type="number" value={payload.keep_yearly_count ?? ""} onChange={(event) => setPayload((p) => ({ ...p, keep_yearly_count: Number(event.target.value) }))} /></Label><Label className="flex items-center justify-between rounded border p-2 text-sm">Auto delete enabled<Input className="h-4 w-4" type="checkbox" checked={Boolean(payload.auto_delete_enabled)} onChange={(event) => setPayload((p) => ({ ...p, auto_delete_enabled: event.target.checked }))} /></Label><Textarea placeholder="Reason" value={payload.reason} onChange={(event) => setPayload((p) => ({ ...p, reason: event.target.value }))} />{error ? <InlineAlert title={error} variant="error" /> : null}<LoadingButton loading={loading} onClick={() => onSubmit(payload)}>Save retention policy</LoadingButton></div></div>;
};

const BackupSettingsPanel = ({ data, canManage, loading, error, onSubmit }: { data?: Record<string, unknown>; canManage: boolean; loading?: boolean; error?: string | null; onSubmit: (payload: BackupRestoreSettingsPayload) => void }) => {
  const [payload, setPayload] = useState<BackupRestoreSettingsPayload>({ backup_enabled: true, allow_restore_preview: true, allow_restore_apply: true, require_super_admin_for_restore: true, max_backup_rows: 5000, reason: "" });
  if (!canManage) return <EmptyState title="Backup settings are not available for your role." description="Backup and restore settings require backup_recovery.settings.manage." />;
  return <div className="grid gap-4 lg:grid-cols-[1fr_420px]" data-setup-target="backup-settings"><WidgetCard title="Backup Settings" description="Structured safety and size controls."><div className="grid gap-3 sm:grid-cols-2"><MetricTile label="Backup enabled" value={asYesNo(field(data, ["backup_enabled"], payload.backup_enabled))} status="success" /><MetricTile label="Restore preview" value={asYesNo(field(data, ["allow_restore_preview"], payload.allow_restore_preview))} /><MetricTile label="Restore apply" value={asYesNo(field(data, ["allow_restore_apply"], payload.allow_restore_apply))} status="warning" /><MetricTile label="Super Admin restore" value={asYesNo(field(data, ["require_super_admin_for_restore"], payload.require_super_admin_for_restore))} /></div><div className="mt-3"><TechnicalDetails value={data} /></div></WidgetCard><div className="space-y-3 rounded-lg border bg-card p-4"><InlineAlert title="Restore apply requires typed confirmation." variant="warning">Type RESTORE COMPANY DATA before applying any restore. Destructive restore warning: replace-company mode is Super Admin only.</InlineAlert><Label className="flex items-center justify-between rounded border p-2 text-sm">Backup enabled<Input className="h-4 w-4" type="checkbox" checked={Boolean(payload.backup_enabled)} onChange={(event) => setPayload((p) => ({ ...p, backup_enabled: event.target.checked }))} /></Label><Label className="flex items-center justify-between rounded border p-2 text-sm">Allow restore preview<Input className="h-4 w-4" type="checkbox" checked={Boolean(payload.allow_restore_preview)} onChange={(event) => setPayload((p) => ({ ...p, allow_restore_preview: event.target.checked }))} /></Label><Label className="flex items-center justify-between rounded border p-2 text-sm">Allow restore apply<Input className="h-4 w-4" type="checkbox" checked={Boolean(payload.allow_restore_apply)} onChange={(event) => setPayload((p) => ({ ...p, allow_restore_apply: event.target.checked }))} /></Label><Label className="flex items-center justify-between rounded border p-2 text-sm">Require Super Admin for restore<Input className="h-4 w-4" type="checkbox" checked={Boolean(payload.require_super_admin_for_restore)} onChange={(event) => setPayload((p) => ({ ...p, require_super_admin_for_restore: event.target.checked }))} /></Label><Label className="space-y-1 text-sm">Max backup rows<Input type="number" value={payload.max_backup_rows ?? ""} onChange={(event) => setPayload((p) => ({ ...p, max_backup_rows: Number(event.target.value) }))} /></Label><Label className="space-y-1 text-sm">Backup expiry days<Input type="number" value={payload.backup_expiry_days ?? ""} onChange={(event) => setPayload((p) => ({ ...p, backup_expiry_days: Number(event.target.value) }))} /></Label><Textarea placeholder="Reason" value={payload.reason} onChange={(event) => setPayload((p) => ({ ...p, reason: event.target.value }))} />{error ? <InlineAlert title={error} variant="error" /> : null}<LoadingButton loading={loading} onClick={() => onSubmit(payload)}>Save backup settings</LoadingButton></div></div>;
};

export const BackupRecoveryPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "status");
  const [selected, setSelected] = useState<BackupJob | RestoreRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<"verify" | "delete" | "approveRestore" | "rejectRestore" | "generate" | "cancelBackup" | "validateRestore" | "applyRestore" | "cancelRestore" | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewStatus = has("backup.view");
  const canViewBackups = has("backup.view_history");
  const canManageRetention = has("backup.manage_settings");
  const canManageSettings = has("backup_recovery.settings.manage") || has("backup.manage_settings");
  const canViewRestore = has("backup.restore_request");
  const canViewRestoreJobs = canViewRestore || has("backup_recovery.restore.preview");
  const activeTab = tab === "backups" && canViewBackups ? "backups" : tab === "settings" && canManageSettings ? "settings" : tab === "retention" && canManageRetention ? "retention" : tab === "restore" && canViewRestoreJobs ? "restore" : "status";
  const filters = useMemo<BackupFilters>(() => ({ status: searchParams.get("status") || undefined, type: searchParams.get("type") || undefined, page: searchParamNumber(searchParams, "page", 1), page_size: searchParamNumber(searchParams, "page_size", 25) }), [searchParams]);
  const updateFilters = (next: Partial<BackupFilters>) => { const params = new URLSearchParams(searchParams); Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value))); if (!("page" in next)) params.set("page", "1"); params.set("tab", activeTab); setSearchParams(params); };
  const setActiveTab = (value: string) => { setTab(value); const params = new URLSearchParams(searchParams); params.set("tab", value); params.set("page", "1"); setSearchParams(params); };
  const statusQuery = useQuery({ queryKey: ["backup", "status"], queryFn: backupRecoveryApi.status, enabled: canViewStatus });
  const backupsQuery = useQuery({ queryKey: ["backup", "jobs", filters], queryFn: () => backupRecoveryApi.listBackups(filters), enabled: activeTab === "backups" && canViewBackups });
  const retentionQuery = useQuery({ queryKey: ["backup", "retention"], queryFn: backupRecoveryApi.getRetentionPolicy, enabled: canManageRetention });
  const settingsQuery = useQuery({ queryKey: ["backup", "settings"], queryFn: backupRecoveryApi.getSettings, enabled: canManageSettings });
  const restoreQuery = useQuery({ queryKey: ["backup", "restore", filters], queryFn: () => backupRecoveryApi.listRestoreJobs(filters), enabled: activeTab === "restore" && canViewRestoreJobs });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["backup"] });
  const createBackupMutation = useMutation({
    mutationFn: backupRecoveryApi.createBackup,
    onSuccess: async (response) => {
      const payload = response.data as BackupJob & { backup_job?: BackupJob };
      const job = payload.backup_job ?? payload;
      const completed = job.status === "completed" || job.status === "ready" || job.file_ready === true || job.file_ready === 1;
      setSuccessMessage(completed ? "Backup completed successfully." : "Backup job created successfully.");
      setBackupOpen(false);
      await refresh();
    },
  });
  const createRestoreMutation = useMutation({ mutationFn: backupRecoveryApi.createRestoreJob, onSuccess: async () => { setSuccessMessage("Restore job created successfully."); setRestoreOpen(false); await refresh(); } });
  const retentionMutation = useMutation({ mutationFn: backupRecoveryApi.updateRetentionPolicy, onSuccess: async () => { setSuccessMessage("Backup retention policy updated successfully."); await refresh(); } });
  const settingsMutation = useMutation({ mutationFn: backupRecoveryApi.updateSettings, onSuccess: async () => { setSuccessMessage("Backup settings updated successfully."); await refresh(); } });
  const downloadMutation = useMutation({ mutationFn: async (backup: BackupJob) => ({ backup, blob: await backupRecoveryApi.downloadBackup(backup.id) }), onSuccess: ({ backup, blob }) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = backup.file_name ?? `backup-${backup.id}.backup`; link.click(); URL.revokeObjectURL(url); setSuccessMessage("Backup file downloaded successfully."); } });
  const reasonMutation = useMutation<unknown, unknown, string>({
    mutationFn: (reason: string) => {
      const id = String(selected?.id ?? "");
      if (reasonAction === "verify") return backupRecoveryApi.verifyBackup(id, reason);
      if (reasonAction === "delete") return backupRecoveryApi.deleteBackup(id, reason);
      if (reasonAction === "generate") return backupRecoveryApi.generateBackup(id, reason);
      if (reasonAction === "cancelBackup") return backupRecoveryApi.cancelBackup(id, reason);
      if (reasonAction === "validateRestore") return backupRecoveryApi.validateRestoreJob(id);
      if (reasonAction === "applyRestore") return backupRecoveryApi.applyRestoreJob(id, { confirmation: restoreConfirmation, reason } satisfies RestoreApplyPayload);
      if (reasonAction === "cancelRestore") return backupRecoveryApi.cancelRestoreJob(id, reason);
      if (reasonAction === "approveRestore") return backupRecoveryApi.approveRestoreRequest(id, reason);
      return backupRecoveryApi.rejectRestoreRequest(id, reason);
    },
    onSuccess: async () => { setSuccessMessage(reasonAction === "verify" ? "Backup verified successfully." : reasonAction === "delete" ? "Backup deleted successfully." : reasonAction === "generate" ? "Backup package generated successfully." : reasonAction === "cancelBackup" ? "Backup job cancelled successfully." : reasonAction === "validateRestore" ? "Restore validation and preview completed." : reasonAction === "applyRestore" ? "Restore apply completed." : reasonAction === "cancelRestore" ? "Restore job cancelled successfully." : reasonAction === "approveRestore" ? "Restore request approved." : "Restore request rejected."); setReasonAction(null); setRestoreConfirmation(""); await refresh(); },
  });
  const activeError = activeTab === "backups" ? backupsQuery.error : activeTab === "settings" ? settingsQuery.error : activeTab === "retention" ? retentionQuery.error : activeTab === "restore" ? restoreQuery.error : statusQuery.error;
  const mutationError = createBackupMutation.error ?? createRestoreMutation.error ?? retentionMutation.error ?? settingsMutation.error ?? downloadMutation.error ?? reasonMutation.error;
  return (
    <div>
      <PageActionBar label="Backup and restore page actions"><div className="flex flex-wrap items-center justify-end gap-2">{has("backup.create") || has("backup_recovery.backup.create") ? <Button onClick={() => setBackupOpen(true)}><DatabaseBackup className="h-4 w-4" />Create backup</Button> : null}{canViewStatus ? <Button variant="outline" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />Refresh status</Button> : null}{canManageRetention ? <Button variant="outline" onClick={() => setActiveTab("retention")}><ClipboardList className="h-4 w-4" />View retention policy</Button> : null}{canViewRestoreJobs ? <Button variant="outline" onClick={() => setActiveTab("restore")}><ShieldAlert className="h-4 w-4" />View restore jobs</Button> : null}{canManageSettings ? <Button variant="outline" onClick={() => setActiveTab("settings")}><Settings2 className="h-4 w-4" />Backup settings</Button> : null}</div></PageActionBar>
      <div className="space-y-4 p-4 md:p-6">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Backup & Recovery</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Create backups, verify backup integrity, manage retention, and safely restore company data.</p>
            </div>
            <StatusStrip compact items={[
              { label: "Secrets", value: "Excluded", status: "success" },
              { label: "Dry run", value: "Required", status: "warning" },
              { label: "Audit", value: "Enabled", status: "info" },
            ]} />
          </div>
        </div>
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {(activeError || mutationError) ? <InlineAlert title={friendlyHrmError(activeError ?? mutationError, "Backup data could not be loaded.")} variant="error" /> : null}
        <InlineAlert title="Restore apply is protected." variant="warning">Validate/Preview is read-only. Apply requires permission, reason, and typed confirmation: RESTORE COMPANY DATA.</InlineAlert>
        <BackupOverview status={statusQuery.data?.data} retention={retentionQuery.data?.data} settings={settingsQuery.data?.data} />
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3"><Input placeholder="Type" value={filters.type ?? ""} onChange={(event) => updateFilters({ type: event.target.value })} /><Input placeholder="Status" value={filters.status ?? ""} onChange={(event) => updateFilters({ status: event.target.value })} /><Button variant="outline" onClick={() => updateFilters({ type: undefined, status: undefined })}>Clear filters</Button></div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="status">Status</TabsTrigger>{canViewBackups ? <TabsTrigger value="backups">Backup Jobs</TabsTrigger> : null}{canViewRestoreJobs ? <TabsTrigger value="restore">Restore Jobs</TabsTrigger> : null}{canManageSettings ? <TabsTrigger value="settings">Settings</TabsTrigger> : null}{canManageRetention ? <TabsTrigger value="retention">Retention Policy</TabsTrigger> : null}</TabsList>
          <TabsContent value="status"><WidgetCard title="Operational status" description="Live backup and restore safety status."><BackupOverview status={statusQuery.data?.data} retention={retentionQuery.data?.data} settings={settingsQuery.data?.data} /><div className="mt-3"><TechnicalDetails value={statusQuery.data?.data} /></div></WidgetCard></TabsContent>
          {canViewBackups ? <TabsContent value="backups"><DataTable rows={backupsQuery.data?.data ?? []} loading={backupsQuery.isLoading} pagination={backupsQuery.data?.pagination} columns={[{ key: "created_at", header: "Created date", cell: (row) => formatBackupDate(row.created_at) }, { key: "backup_type", header: "Backup type", cell: (row) => formatBackupType(row.backup_type) }, { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> }, { key: "file_name", header: "File name" }, { key: "file_size", header: "File size", cell: (row) => formatFileSize(row.file_size) }, { key: "checksum_sha256", header: "Checksum / verified", cell: (row) => row.checksum_sha256 ? "Checksum available" : "Pending verification" }, { key: "started_by", header: "Created by" }, { key: "reason", header: "Reason" }]} getRowId={(row) => row.id} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, ...((has("backup.download") || has("backup_recovery.backup.download")) && row.file_ready ? [{ key: "download" as const, label: "Download backup", onSelect: () => downloadMutation.mutate(row) }] : []), ...((has("backup_recovery.backup.generate") || has("backup.create")) ? [{ key: "approve" as const, label: "Generate package", onSelect: () => { setSelected(row); setReasonAction("generate"); } }] : []), ...((has("backup_recovery.backup.verify") || has("backup.view")) ? [{ key: "approve" as const, label: "Verify backup", onSelect: () => { setSelected(row); setReasonAction("verify"); } }] : []), ...((has("backup.manage_settings") || has("backup_recovery.backup.cancel")) ? [{ key: "delete" as const, label: "Cancel running backup", onSelect: () => { setSelected(row); setReasonAction("cancelBackup"); } }] : [])]} />} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} compact /></TabsContent> : null}
          {canManageSettings ? <TabsContent value="settings"><BackupSettingsPanel data={settingsQuery.data?.data} canManage={canManageSettings} loading={settingsMutation.isPending} error={settingsMutation.error ? friendlyHrmError(settingsMutation.error, "Backup settings could not be saved.") : null} onSubmit={(payload) => settingsMutation.mutate(payload)} /></TabsContent> : null}
          {canManageRetention ? <TabsContent value="retention"><RetentionPolicyPanel data={retentionQuery.data?.data} canManage={canManageRetention} loading={retentionMutation.isPending} error={retentionMutation.error ? friendlyHrmError(retentionMutation.error, "Retention policy could not be saved.") : null} onSubmit={(payload) => retentionMutation.mutate(payload)} /></TabsContent> : null}
          {canViewRestoreJobs ? <TabsContent value="restore"><DataTable rows={restoreQuery.data?.data ?? []} loading={restoreQuery.isLoading} pagination={restoreQuery.data?.pagination} columns={[{ key: "backup_job_id", header: "Backup" }, { key: "restore_mode", header: "Restore mode", cell: (row) => formatBackupType(asOptionalString(row.restore_mode) ?? asOptionalString(row.restore_type)) }, { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> }, { key: "dry_run_result", header: "Dry run result", cell: (row) => String(field(row, ["dry_run_result", "validation_status"], "Not run")) }, { key: "requested_by", header: "Requested by" }, { key: "approved_by", header: "Approved by" }, { key: "created_at", header: "Created date", cell: (row) => formatBackupDate(row.created_at) }, { key: "applied_at", header: "Applied date", cell: (row) => formatBackupDate(row.applied_at as string | undefined) }]} getRowId={(row) => row.id} rowActions={(row) => <RowActions actions={[{ key: "view", label: "View preview", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, { key: "approve" as const, label: "Validate restore", onSelect: () => { setSelected(row); setReasonAction("validateRestore"); } }, ...(has("backup_recovery.restore.apply") ? [{ key: "approve" as const, label: "Apply restore", onSelect: () => { setSelected(row); setRestoreConfirmation(""); setReasonAction("applyRestore"); } }] : []), ...(has("backup_recovery.restore.cancel") ? [{ key: "reject" as const, label: "Cancel restore", onSelect: () => { setSelected(row); setReasonAction("cancelRestore"); } }] : [])]} />} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} compact /></TabsContent> : null}
        </Tabs>
      </div>
      <DetailDrawer title={String(selected?.id ?? "Backup detail")} subtitle="Sensitive storage fields are sanitized before display." open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DetailSection title="Operational summary" rows={[
          { label: "Status", value: selected?.status ? <StatusBadge status={selected.status} /> : "Unknown" },
          { label: "Created", value: formatBackupDate(selected?.created_at) },
          { label: "Reason", value: asOptionalString(selected?.reason) ?? "Not provided" },
          { label: "Backup", value: asOptionalString((selected as RestoreRequest | null)?.backup_job_id) ?? asOptionalString((selected as BackupJob | null)?.file_name) ?? "Not available" },
        ]} />
        <DetailSection title="Restore preview" rows={[
          { label: "Tables affected", value: String(field(selected as Record<string, unknown> | undefined, ["tables_affected", "table_count"], "Not available")) },
          { label: "Rows to insert", value: String(field(selected as Record<string, unknown> | undefined, ["rows_to_insert", "insert_rows"], "Not available")) },
          { label: "Rows to update", value: String(field(selected as Record<string, unknown> | undefined, ["rows_to_update", "update_rows"], "Not available")) },
          { label: "Rows to skip", value: String(field(selected as Record<string, unknown> | undefined, ["rows_to_skip", "skipped_rows"], "Not available")) },
          { label: "Warnings", value: String(field(selected as Record<string, unknown> | undefined, ["warning_count", "warnings"], "None reported")) },
          { label: "Blocked actions", value: String(field(selected as Record<string, unknown> | undefined, ["blocked_actions", "blocked_count"], "None reported")) },
        ]} />
        <TechnicalDetails value={selected} />
      </DetailDrawer>
      <BackupCreateDialog open={backupOpen} loading={createBackupMutation.isPending} error={createBackupMutation.error ? friendlyHrmError(createBackupMutation.error, "Backup could not be created.") : null} onOpenChange={setBackupOpen} onSubmit={(payload) => createBackupMutation.mutate(payload)} />
      <RestoreRequestDialog open={restoreOpen} loading={createRestoreMutation.isPending} error={createRestoreMutation.error ? friendlyHrmError(createRestoreMutation.error, "Restore job could not be created.") : null} onOpenChange={setRestoreOpen} onSubmit={(payload) => createRestoreMutation.mutate({ backup_job_id: payload.backup_id, restore_mode: payload.restore_mode ?? "dry_run", reason: payload.reason } satisfies RestoreJobPayload)} />
      <ReasonDialog open={Boolean(reasonAction)} title="Confirm backup action" description="A reason is required for this backup or restore action." confirmDisabled={reasonAction === "applyRestore" && restoreConfirmation !== "RESTORE COMPANY DATA"} loading={reasonMutation.isPending} error={reasonMutation.error ? friendlyHrmError(reasonMutation.error, "Backup action could not be completed.") : null} onOpenChange={(open) => { if (!open) { setReasonAction(null); setRestoreConfirmation(""); } }} onSubmit={(reason) => reasonMutation.mutate(reason)}>
        {reasonAction === "applyRestore" ? <InlineAlert title="Destructive restore warning" variant="warning">Restore apply can modify company data. Type RESTORE COMPANY DATA below before submitting.</InlineAlert> : null}
        {reasonAction === "applyRestore" ? <Label className="space-y-1 text-sm">Typed confirmation<Input placeholder="RESTORE COMPANY DATA" value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} /></Label> : null}
      </ReasonDialog>
    </div>
  );
};
