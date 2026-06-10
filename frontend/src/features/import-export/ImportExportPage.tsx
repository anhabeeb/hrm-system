import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { ReasonDialog } from "@/components/forms/ReasonDialog";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { OutletCombobox } from "@/components/selectors";
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
import { formatJobDate, formatJobType } from "./import-export-format";
import { importExportApi } from "./import-export.api";
import type { ExportCreatePayload, ExportJob, ImportExportFilters, ImportJob, ImportTemplate, ImportUploadPayload } from "./import-export.types";

const exportTypes = ["employees", "attendance", "leave", "payroll", "assets", "uniforms", "documents_metadata", "audit_activity", "approvals"];
const importTypes = ["employees", "attendance_manual", "leave_balances", "assets", "uniforms", "documents_metadata"];
const dangerousTypes = new Set(["text/html", "image/svg+xml", "application/x-msdownload", "application/x-msdos-program"]);
const sensitiveExportTypes = new Set(["employees", "payroll", "documents_metadata", "audit_activity", "approvals"]);

const JsonPanel = ({ value }: { value: unknown }) => <pre className="max-h-72 overflow-auto rounded border bg-muted p-3 text-xs">{JSON.stringify(sanitizeForDisplay(value ?? {}), null, 2)}</pre>;

const ExportCreateDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: ExportCreatePayload) => void }) => {
  const [payload, setPayload] = useState<ExportCreatePayload>({ export_type: "employees", format: "json", filters: {} });
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setPayload({ export_type: "employees", format: "json", filters: {} });
      setLocalError(null);
    }
  }, [open]);
  const submit = () => {
    if (sensitiveExportTypes.has(payload.export_type) && !payload.reason?.trim()) {
      setLocalError("A reason is required for this action.");
      return;
    }
    setLocalError(null);
    onSubmit({ ...payload, reason: payload.reason?.trim() || undefined });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create export job</DialogTitle><DialogDescription>Create a backend export job. Sensitive exports require a reason.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><Label className="space-y-1 text-sm">Export type<Select value={payload.export_type} onValueChange={(value) => setPayload((p) => ({ ...p, export_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{exportTypes.map((type) => <SelectItem key={type} value={type}>{formatJobType(type)}</SelectItem>)}</SelectContent></Select></Label><Label className="space-y-1 text-sm">Format<Select value={payload.format} onValueChange={(value: "json" | "csv") => setPayload((p) => ({ ...p, format: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="json">JSON</SelectItem><SelectItem value="csv">CSV</SelectItem></SelectContent></Select></Label><Label className="space-y-1 text-sm">Outlet<OutletCombobox value={typeof payload.filters?.outlet_id === "string" ? payload.filters.outlet_id : undefined} onChange={(value) => setPayload((p) => ({ ...p, filters: { ...p.filters, outlet_id: value } }))} placeholder="All accessible outlets" /></Label><Label className="space-y-1 text-sm">Payroll month<Input placeholder="YYYY-MM" onChange={(event) => setPayload((p) => ({ ...p, filters: { ...p.filters, payroll_month: event.target.value } }))} /></Label></div><Textarea placeholder={sensitiveExportTypes.has(payload.export_type) ? "Reason required for this sensitive export" : "Reason (optional)"} value={payload.reason ?? ""} onChange={(event) => setPayload((p) => ({ ...p, reason: event.target.value }))} />{localError || error ? <InlineAlert title={localError ?? error ?? ""} variant="error" /> : null}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>Create export</LoadingButton></DialogFooter></DialogContent></Dialog>;
};

const ImportUploadDialog = ({ open, loading, error, onOpenChange, onSubmit }: { open: boolean; loading?: boolean; error?: string | null; onOpenChange: (open: boolean) => void; onSubmit: (payload: ImportUploadPayload) => void }) => {
  const [importType, setImportType] = useState("employees");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  useEffect(() => {
    if (!open) {
      setImportType("employees");
      setReason("");
      setFile(null);
      setLocalError(null);
      setFileInputKey((key) => key + 1);
    }
  }, [open]);
  const submit = () => {
    if (!reason.trim()) return setLocalError("A reason is required for this action.");
    if (!file) return setLocalError("Please attach an import file before uploading.");
    if (!["text/csv", "application/json"].includes(file.type) || dangerousTypes.has(file.type)) return setLocalError("Please upload a CSV or JSON import file.");
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      onSubmit({ import_type: importType, file_name: file.name, mime_type: file.type, content_base64: result.split(",")[1] ?? "", reason: reason.trim() });
      setFile(null);
      setReason("");
      setLocalError(null);
      setFileInputKey((key) => key + 1);
    };
    reader.readAsDataURL(file);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Upload import file</DialogTitle><DialogDescription>Upload CSV or JSON for validation. Applying imports remains backend-controlled.</DialogDescription></DialogHeader><Label className="space-y-1 text-sm">Import type<Select value={importType} onValueChange={setImportType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{importTypes.map((type) => <SelectItem key={type} value={type}>{formatJobType(type)}</SelectItem>)}</SelectContent></Select></Label><Label className="space-y-1 text-sm">Import file<Input key={fileInputKey} type="file" accept=".csv,application/json,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Label><Textarea placeholder="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />{localError || error ? <InlineAlert title={localError ?? error ?? ""} variant="error" /> : null}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><LoadingButton loading={loading} onClick={submit}>Upload import</LoadingButton></DialogFooter></DialogContent></Dialog>;
};

export const ImportExportPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "exports");
  const [selected, setSelected] = useState<ExportJob | ImportJob | ImportTemplate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<"cancelExport" | "retryExport" | "validateImport" | "applyImport" | "cancelImport" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canViewExports = has("export.view");
  const canViewImports = has("import.view");
  const canViewTemplates = has("import.download_template");
  const activeTab = tab === "imports" && canViewImports ? "imports" : tab === "templates" && canViewTemplates ? "templates" : canViewExports ? "exports" : canViewImports ? "imports" : "templates";
  const filters = useMemo<ImportExportFilters>(() => ({ status: searchParams.get("status") || undefined, type: searchParams.get("type") || undefined, page: searchParamNumber(searchParams, "page", 1), page_size: searchParamNumber(searchParams, "page_size", 25) }), [searchParams]);
  const updateFilters = (next: Partial<ImportExportFilters>) => { const params = new URLSearchParams(searchParams); Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value))); if (!("page" in next)) params.set("page", "1"); params.set("tab", activeTab); setSearchParams(params); };
  const setActiveTab = (value: string) => { setTab(value); const params = new URLSearchParams(searchParams); params.set("tab", value); params.set("page", "1"); setSearchParams(params); };
  const exportsQuery = useQuery({ queryKey: ["import-export", "exports", filters], queryFn: () => importExportApi.listExports(filters), enabled: activeTab === "exports" && canViewExports });
  const importsQuery = useQuery({ queryKey: ["import-export", "imports", filters], queryFn: () => importExportApi.listImports(filters), enabled: activeTab === "imports" && canViewImports });
  const templatesQuery = useQuery({ queryKey: ["import-export", "templates"], queryFn: importExportApi.templates, enabled: activeTab === "templates" && canViewTemplates });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["import-export"] });
  const createExportMutation = useMutation({ mutationFn: importExportApi.createExport, onSuccess: async () => { setSuccessMessage("Export job created successfully."); setExportOpen(false); await refresh(); } });
  const uploadMutation = useMutation({ mutationFn: importExportApi.uploadImport, onSuccess: async () => { setSuccessMessage("Import file uploaded successfully."); setImportOpen(false); await refresh(); } });
  const downloadMutation = useMutation({ mutationFn: async (job: ExportJob) => ({ job, blob: await importExportApi.downloadExport(job.id) }), onSuccess: ({ job, blob }) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `export-${job.id}.${job.file_type ?? "json"}`; link.click(); URL.revokeObjectURL(url); setSuccessMessage("Export file downloaded successfully."); } });
  const reasonMutation = useMutation({
    mutationFn: (reason: string) => {
      const id = String(selected?.id ?? "");
      if (reasonAction === "cancelExport") return importExportApi.cancelExport(id, reason);
      if (reasonAction === "retryExport") return importExportApi.retryExport(id, reason);
      if (reasonAction === "validateImport") return importExportApi.validateImport(id);
      if (reasonAction === "applyImport") return importExportApi.applyImport(id, reason);
      return importExportApi.cancelImport(id, reason);
    },
    onSuccess: async (response) => {
      const data = "data" in response ? response.data as { applied?: boolean } : {};
      setSuccessMessage(reasonAction === "applyImport" && !data.applied ? "Import validation completed. Applying imports will be implemented in a later step." : reasonAction === "validateImport" ? "Import validation completed successfully." : reasonAction === "cancelImport" ? "Import job cancelled successfully." : reasonAction === "retryExport" ? "Export job retry requested successfully." : "Export job cancelled successfully.");
      setReasonAction(null);
      await refresh();
    },
  });
  const activeError = activeTab === "imports" ? importsQuery.error : activeTab === "templates" ? templatesQuery.error : exportsQuery.error;
  const mutationError = createExportMutation.error ?? uploadMutation.error ?? downloadMutation.error ?? reasonMutation.error;
  return (
    <div>
      <PageActionBar label="Import and export page actions"><div className="flex flex-wrap items-center justify-end gap-2">{canViewExports && has("export.create") ? <Button onClick={() => setExportOpen(true)}><Plus className="h-4 w-4" />Create export</Button> : null}{canViewImports && has("import.create") ? <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" />Upload import</Button> : null}</div></PageActionBar>
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {(activeError || mutationError) ? <InlineAlert title={friendlyHrmError(activeError ?? mutationError, "Import/export data could not be loaded.")} variant="error" /> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3"><Input placeholder="Type" value={filters.type ?? ""} onChange={(event) => updateFilters({ type: event.target.value })} /><Input placeholder="Status" value={filters.status ?? ""} onChange={(event) => updateFilters({ status: event.target.value })} /><Button variant="outline" onClick={() => updateFilters({ type: undefined, status: undefined })}>Clear filters</Button></div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>{canViewExports ? <TabsTrigger value="exports">Exports</TabsTrigger> : null}{canViewImports ? <TabsTrigger value="imports">Imports</TabsTrigger> : null}{canViewTemplates ? <TabsTrigger value="templates">Templates</TabsTrigger> : null}</TabsList>
          {canViewExports ? <TabsContent value="exports"><DataTable rows={exportsQuery.data?.data ?? []} loading={exportsQuery.isLoading} pagination={exportsQuery.data?.pagination} columns={[{ key: "id", header: "Job" }, { key: "export_type", header: "Export Type", cell: (row) => formatJobType(row.export_type) }, { key: "file_type", header: "Format" }, { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> }, { key: "row_count", header: "Rows" }, { key: "created_at", header: "Created", cell: (row) => formatJobDate(row.created_at) }, { key: "file_ready", header: "File Ready", cell: (row) => row.file_ready ? "Yes" : "No" }]} getRowId={(row) => row.id} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, ...(has("export.download") && row.file_ready ? [{ key: "download" as const, onSelect: () => downloadMutation.mutate(row) }] : []), ...(has("export.create") ? [{ key: "disable" as const, label: "Cancel", onSelect: () => { setSelected(row); setReasonAction("cancelExport"); } }, { key: "more" as const, label: "Retry", onSelect: () => { setSelected(row); setReasonAction("retryExport"); } }] : [])]} />} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} compact /></TabsContent> : null}
          {canViewImports ? <TabsContent value="imports"><DataTable rows={importsQuery.data?.data ?? []} loading={importsQuery.isLoading} pagination={importsQuery.data?.pagination} columns={[{ key: "id", header: "Job" }, { key: "import_type", header: "Import Type", cell: (row) => formatJobType(row.import_type) }, { key: "file_name", header: "File" }, { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "pending"} /> }, { key: "total_rows", header: "Total" }, { key: "success_rows", header: "Valid" }, { key: "failed_rows", header: "Invalid" }, { key: "created_at", header: "Created", cell: (row) => formatJobDate(row.created_at) }]} getRowId={(row) => row.id} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, ...(has("import.create") ? [{ key: "approve" as const, label: "Validate", onSelect: () => { setSelected(row); setReasonAction("validateImport"); } }] : []), ...(has("import.confirm") ? [{ key: "more" as const, label: "Apply", onSelect: () => { setSelected(row); setReasonAction("applyImport"); } }] : []), ...(has("import.rollback") ? [{ key: "reject" as const, label: "Cancel", onSelect: () => { setSelected(row); setReasonAction("cancelImport"); } }] : [])]} />} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} compact /></TabsContent> : null}
          {canViewTemplates ? <TabsContent value="templates"><DataTable rows={templatesQuery.data?.data ?? []} loading={templatesQuery.isLoading} columns={[{ key: "template_name", header: "Template Name" }, { key: "template_type", header: "Type", cell: (row) => formatJobType(String(row.template_type ?? "")) }, { key: "description", header: "Description" }]} getRowId={(row) => String(row.template_key ?? row.template_name)} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, ...(has("import.download_template") ? [{ key: "download" as const, label: "View template", onSelect: () => { setSelected(row); setDrawerOpen(true); } }] : [])]} />} compact /></TabsContent> : null}
        </Tabs>
      </div>
      <DetailDrawer title={String(selected?.id ?? selected?.template_name ?? "Detail")} subtitle="Sensitive keys are sanitized before display." open={drawerOpen} onOpenChange={setDrawerOpen}><DetailSection title="Metadata" rows={[{ label: "Detail", value: <JsonPanel value={selected} /> }]} /></DetailDrawer>
      <ExportCreateDialog open={exportOpen} loading={createExportMutation.isPending} error={createExportMutation.error ? friendlyHrmError(createExportMutation.error, "Export job could not be created.") : null} onOpenChange={setExportOpen} onSubmit={(payload) => createExportMutation.mutate(payload)} />
      <ImportUploadDialog open={importOpen} loading={uploadMutation.isPending} error={uploadMutation.error ? friendlyHrmError(uploadMutation.error, "Import file could not be uploaded.") : null} onOpenChange={setImportOpen} onSubmit={(payload) => uploadMutation.mutate(payload)} />
      <ReasonDialog open={Boolean(reasonAction)} title="Confirm import/export action" description="A reason is required for this action where backend policy requires it." loading={reasonMutation.isPending} error={reasonMutation.error ? friendlyHrmError(reasonMutation.error, "Import/export action could not be completed.") : null} onOpenChange={(open) => !open && setReasonAction(null)} onSubmit={(reason) => reasonMutation.mutate(reason)} />
    </div>
  );
};
