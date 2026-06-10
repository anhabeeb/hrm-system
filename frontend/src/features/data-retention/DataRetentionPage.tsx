import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { dataRetentionApi } from "./data-retention.api";
import type { ArchiveJob, ArchiveJobItem, ArchiveSourceType, RetentionSettings } from "./data-retention.types";

const sourceOptions: Array<{ value: ArchiveSourceType; label: string }> = [
  { value: "employees", label: "Offboarded employees" },
  { value: "employee_documents", label: "Employee documents" },
  { value: "attendance", label: "Attendance events" },
  { value: "biometric_logs", label: "Biometric logs" },
  { value: "leave", label: "Leave requests" },
  { value: "long_leave", label: "Long leave" },
  { value: "payroll", label: "Payroll runs" },
  { value: "payslips", label: "Payslips" },
  { value: "notifications", label: "Notifications" },
  { value: "email_notifications", label: "Email jobs" },
  { value: "expiry_alerts", label: "Expiry alerts" },
  { value: "imports", label: "Import jobs" },
  { value: "exports", label: "Export jobs" },
  { value: "backup_restore", label: "Backup jobs" },
  { value: "audit_logs", label: "Audit logs (view only)" },
];

const statusBadge = (status?: string | null) => {
  const tone = status === "completed" || status === "archived" || status === "restored" ? "default" : status === "blocked" || status === "failed" ? "destructive" : "secondary";
  return <Badge variant={tone}>{status ?? "unknown"}</Badge>;
};

const MiniTable = ({ items, onSelect, selectedId }: { items: ArchiveJob[]; selectedId?: string | null; onSelect: (job: ArchiveJob) => void }) => (
  <div className="overflow-hidden rounded-md border bg-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Eligible</TableHead>
          <TableHead>Blocked</TableHead>
          <TableHead>Archived</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead className="w-24 text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No archive jobs yet.</TableCell></TableRow> : items.map((job) => (
          <TableRow key={job.id} className={job.id === selectedId ? "bg-muted/60" : ""}>
            <TableCell className="font-medium">{job.source_type}</TableCell>
            <TableCell>{statusBadge(job.status)}</TableCell>
            <TableCell>{job.eligible_count ?? 0}</TableCell>
            <TableCell>{job.blocked_count ?? 0}</TableCell>
            <TableCell>{job.archived_count ?? 0}</TableCell>
            <TableCell>{job.requested_at ? new Date(job.requested_at).toLocaleString() : "Not recorded"}</TableCell>
            <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => onSelect(job)}>Open</Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const ItemTable = ({ items, canRestore, restoreReason, onRestore }: { items: ArchiveJobItem[]; canRestore: boolean; restoreReason: string; onRestore: (item: ArchiveJobItem) => void }) => (
  <div className="overflow-hidden rounded-md border bg-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Table</TableHead>
          <TableHead>Source ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Previous</TableHead>
          <TableHead>Blocked reason</TableHead>
          <TableHead className="w-28 text-right">Restore</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No item rows to show.</TableCell></TableRow> : items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item.source_table}</TableCell>
            <TableCell className="font-mono text-xs">{item.source_id}</TableCell>
            <TableCell>{statusBadge(item.status)}</TableCell>
            <TableCell>{item.previous_status ?? "n/a"}</TableCell>
            <TableCell className="max-w-md truncate">{item.blocked_reason ?? item.warning_message ?? "None"}</TableCell>
            <TableCell className="text-right"><Button size="sm" variant="outline" disabled={!canRestore || item.status !== "archived" || !restoreReason.trim()} onClick={() => onRestore(item)}>Restore</Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const DataRetentionPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState<ArchiveSourceType>("expiry_alerts");
  const [retentionMonths, setRetentionMonths] = useState(24);
  const [previewReason, setPreviewReason] = useState("");
  const [settingsReason, setSettingsReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [applyReason, setApplyReason] = useState("");
  const [restoreReason, setRestoreReason] = useState("");
  const [selectedJob, setSelectedJob] = useState<ArchiveJob | null>(null);
  const can = (permission: string) => auth.isSuperAdmin || auth.isAdmin || auth.hasPermission(permission);
  const canManageSettings = can("data_retention.settings.manage");
  const canPreview = can("data_retention.preview");
  const canArchive = can("data_retention.archive");
  const canRestore = can("data_retention.restore");

  const settingsQuery = useQuery({ queryKey: ["data-retention", "settings"], queryFn: dataRetentionApi.settings });
  const jobsQuery = useQuery({ queryKey: ["data-retention", "jobs"], queryFn: () => dataRetentionApi.jobs({ page: 1, page_size: 25 }) });
  const itemsQuery = useQuery({ queryKey: ["data-retention", "items", selectedJob?.id], queryFn: () => dataRetentionApi.items(selectedJob!.id, { page: 1, page_size: 100 }), enabled: Boolean(selectedJob?.id) });
  const settings = settingsQuery.data?.data as RetentionSettings | undefined;
  const jobs = useMemo(() => jobsQuery.data?.data.data ?? [], [jobsQuery.data]);
  const items = itemsQuery.data?.data.data ?? [];

  const previewMutation = useMutation({
    mutationFn: () => dataRetentionApi.preview({ source_type: sourceType, retention_months: retentionMonths, page_size: 100, reason: previewReason, idempotency_key: `${sourceType}:${retentionMonths}:${previewReason}` }),
    onSuccess: (response) => { setSelectedJob(response.data.job); void queryClient.invalidateQueries({ queryKey: ["data-retention", "jobs"] }); },
  });
  const applyMutation = useMutation({
    mutationFn: () => dataRetentionApi.apply(selectedJob!.id, { confirmation, reason: applyReason }),
    onSuccess: () => { setConfirmation(""); void queryClient.invalidateQueries({ queryKey: ["data-retention"] }); },
  });
  const settingsMutation = useMutation({
    mutationFn: () => dataRetentionApi.updateSettings({ enabled: settings?.enabled ?? true, default_retention_months: settings?.default_retention_months ?? 36, archive_only_mode: true, purge_enabled: false, reason: settingsReason }),
    onSuccess: () => { setSettingsReason(""); void queryClient.invalidateQueries({ queryKey: ["data-retention", "settings"] }); },
  });
  const restoreMutation = useMutation({
    mutationFn: (item: ArchiveJobItem) => dataRetentionApi.restoreItem(item.source_type, item.source_id, { reason: restoreReason }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["data-retention"] }); },
  });

  return (
    <div className="space-y-5">
      <InlineAlert title="Archive-only mode is active." variant="warning">
        Purge is disabled by default in Phase 12C. Preview is read-only, apply requires typed confirmation, and archived records remain available for historical review where allowed.
      </InlineAlert>
      <Tabs defaultValue="preview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="preview">Archive Preview</TabsTrigger>
          <TabsTrigger value="jobs">Archive Jobs</TabsTrigger>
          <TabsTrigger value="settings">Retention Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <Label className="space-y-1 text-sm">Source type<Select value={sourceType} onValueChange={(value) => setSourceType(value as ArchiveSourceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sourceOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Label>
            <Label className="space-y-1 text-sm">Retention months<Input type="number" value={retentionMonths} onChange={(event) => setRetentionMonths(Number(event.target.value))} /></Label>
            <Textarea placeholder="Reason for preview" value={previewReason} onChange={(event) => setPreviewReason(event.target.value)} />
            {previewMutation.error ? <InlineAlert title={friendlyHrmError(previewMutation.error, "Archive preview could not be generated.")} variant="error" /> : null}
            <LoadingButton loading={previewMutation.isPending} disabled={!canPreview} onClick={() => previewMutation.mutate()}>Preview archive</LoadingButton>
          </div>
          <div className="space-y-4">
            {previewMutation.data ? <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-card p-3"><div className="text-xs uppercase text-muted-foreground">Candidates</div><div className="text-2xl font-semibold">{previewMutation.data.data.summary.total_candidates}</div></div>
              <div className="rounded-md border bg-card p-3"><div className="text-xs uppercase text-muted-foreground">Eligible</div><div className="text-2xl font-semibold">{previewMutation.data.data.summary.eligible_count}</div></div>
              <div className="rounded-md border bg-card p-3"><div className="text-xs uppercase text-muted-foreground">Blocked</div><div className="text-2xl font-semibold">{previewMutation.data.data.summary.blocked_count}</div></div>
            </div> : <InlineAlert title="Run preview before applying archive." />}
            <MiniTable items={jobs} selectedId={selectedJob?.id} onSelect={setSelectedJob} />
          </div>
        </TabsContent>
        <TabsContent value="jobs" className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <MiniTable items={jobs} selectedId={selectedJob?.id} onSelect={setSelectedJob} />
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2"><ArchiveRestore className="h-4 w-4" /><h3 className="font-semibold">Job detail</h3></div>
            {selectedJob ? <>
              <div className="grid grid-cols-2 gap-2 text-sm"><span className="text-muted-foreground">Job</span><span className="font-mono text-xs">{selectedJob.id}</span><span className="text-muted-foreground">Status</span><span>{statusBadge(selectedJob.status)}</span><span className="text-muted-foreground">Eligible</span><span>{selectedJob.eligible_count}</span><span className="text-muted-foreground">Blocked</span><span>{selectedJob.blocked_count}</span></div>
              <Label className="space-y-1 text-sm">Type confirmation<Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="ARCHIVE DATA" /></Label>
              <Textarea placeholder="Reason required for archive apply" value={applyReason} onChange={(event) => setApplyReason(event.target.value)} />
              {applyMutation.error ? <InlineAlert title={friendlyHrmError(applyMutation.error, "Archive job could not be applied.")} variant="error" /> : null}
              <LoadingButton loading={applyMutation.isPending} disabled={!canArchive || selectedJob.status !== "preview_ready" || confirmation !== "ARCHIVE DATA" || !applyReason.trim()} onClick={() => applyMutation.mutate()}>Apply archive</LoadingButton>
              <Label className="space-y-1 text-sm">Restore reason<Input value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} placeholder="Reason required before restore" /></Label>
              {restoreMutation.error ? <InlineAlert title={friendlyHrmError(restoreMutation.error, "Archived item could not be restored.")} variant="error" /> : null}
            </> : <p className="text-sm text-muted-foreground">Choose a job to inspect items and apply archive.</p>}
          </div>
          <div className="lg:col-span-2"><ItemTable items={items} canRestore={canRestore} restoreReason={restoreReason} onRestore={(item) => restoreMutation.mutate(item)} /></div>
        </TabsContent>
        <TabsContent value="settings" className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-md border bg-card">
            <Table><TableHeader><TableRow><TableHead>Setting</TableHead><TableHead>Value</TableHead></TableRow></TableHeader><TableBody>
              <TableRow><TableCell>Enabled</TableCell><TableCell>{String(settings?.enabled ?? true)}</TableCell></TableRow>
              <TableRow><TableCell>Default retention months</TableCell><TableCell>{settings?.default_retention_months ?? 36}</TableCell></TableRow>
              <TableRow><TableCell>Archive-only mode</TableCell><TableCell>{String(settings?.archive_only_mode ?? true)}</TableCell></TableRow>
              <TableRow><TableCell>Purge enabled</TableCell><TableCell><Badge variant="destructive">Disabled</Badge></TableCell></TableRow>
              <TableRow><TableCell>Restore from archive</TableCell><TableCell>{String(settings?.allow_restore_from_archive ?? true)}</TableCell></TableRow>
            </TableBody></Table>
          </div>
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /><h3 className="font-semibold">Policy change</h3></div>
            <InlineAlert title="Purge is disabled/not available." />
            <Textarea placeholder="Reason required for settings changes" value={settingsReason} onChange={(event) => setSettingsReason(event.target.value)} />
            {settingsMutation.error ? <InlineAlert title={friendlyHrmError(settingsMutation.error, "Data retention settings could not be saved.")} variant="error" /> : null}
            <LoadingButton loading={settingsMutation.isPending} disabled={!canManageSettings || !settingsReason.trim()} onClick={() => settingsMutation.mutate()}>Save archive-only policy</LoadingButton>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
