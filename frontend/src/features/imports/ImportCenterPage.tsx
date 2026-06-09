import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileCheck2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { importsApi } from "./imports.api";
import type { ImportJob, ImportMode, ImportPreviewResult, ImportRow, ImportTemplate } from "./imports.types";

const formatLabel = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const json = (value: unknown) => <pre className="max-h-64 overflow-auto rounded border bg-muted p-3 text-xs">{JSON.stringify(value ?? {}, null, 2)}</pre>;

export const ImportCenterPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selectedTemplate, setSelectedTemplate] = useState<ImportTemplate | null>(null);
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);
  const [csvContent, setCsvContent] = useState("");
  const [mode, setMode] = useState<ImportMode>("validate_only");
  const [fileName, setFileName] = useState("import.csv");
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [drawerRows, setDrawerRows] = useState<ImportRow[]>([]);
  const toast = useToast();
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const filters = useMemo(() => ({
    import_type: params.get("import_type") || undefined,
    status: params.get("status") || undefined,
    page: searchParamNumber(params, "page", 1),
    page_size: searchParamNumber(params, "page_size", 25),
  }), [params]);
  const updateFilters = (next: Record<string, string | number | undefined>) => {
    const nextParams = new URLSearchParams(params);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? nextParams.delete(key) : nextParams.set(key, String(value)));
    if (!("page" in next)) nextParams.set("page", "1");
    setParams(nextParams);
  };
  const downloadTemplate = async (template: ImportTemplate | null) => {
    if (!template) return;
    const blob = await importsApi.downloadTemplateCsv(template.import_type);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${template.import_type}-template.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const templates = useQuery({ queryKey: ["imports", "templates"], queryFn: importsApi.templates, enabled: has("imports.templates.view") });
  const jobs = useQuery({ queryKey: ["imports", "jobs", filters], queryFn: () => importsApi.jobs(filters), enabled: has("imports.view") });
  const availableTemplates = templates.data?.data?.data ?? [];
  const activeTemplate = selectedTemplate ?? availableTemplates[0] ?? null;
  const modes = activeTemplate?.supported_modes ?? ["validate_only"];

  const previewMutation = useMutation({
    mutationFn: importsApi.preview,
    onSuccess: (response) => {
      setPreview(response.data);
      toastSuccess(toast, "Preview completed.", "No business records were changed.");
    },
    onError: (error) => toastError(toast, error, "Import preview could not be generated."),
  });
  const createMutation = useMutation({
    mutationFn: importsApi.createJob,
    onSuccess: async (response) => {
      setPreview({ job: response.data.job, summary: response.data.summary, sample_rows: response.data.sample_rows.map((row) => row.normalized_data), errors: response.data.errors });
      toastSuccess(toast, "Import job created and validated.", "Review errors before applying.");
      await queryClient.invalidateQueries({ queryKey: ["imports", "jobs"] });
    },
    onError: (error) => toastError(toast, error, "Import job could not be created."),
  });
  const applyMutation = useMutation({
    mutationFn: importsApi.applyJob,
    onSuccess: async () => {
      toastSuccess(toast, "Import apply completed.", "Review the job detail for row outcomes.");
      await queryClient.invalidateQueries({ queryKey: ["imports", "jobs"] });
    },
    onError: (error) => toastError(toast, error, "Import job could not be applied."),
  });
  const cancelMutation = useMutation({
    mutationFn: importsApi.cancelJob,
    onSuccess: async () => {
      toastSuccess(toast, "Import job cancelled.");
      await queryClient.invalidateQueries({ queryKey: ["imports", "jobs"] });
    },
    onError: (error) => toastError(toast, error, "Import job could not be cancelled."),
  });
  const loadRows = async (job: ImportJob, status?: string) => {
    const response = await importsApi.rows(job.id, { status, page: 1, page_size: 100 });
    setSelectedJob(job);
    setDrawerRows(response.data.data);
  };
  const error = templates.error ?? jobs.error;
  const blockingErrors = (preview?.summary.invalid_rows ?? 0) + (preview?.summary.duplicate_rows ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Import Center"
        description="Validate, preview, and safely apply structured HRM CSV imports with row-level errors."
        actions={<Button variant="outline" onClick={() => void downloadTemplate(activeTemplate)} disabled={!activeTemplate || !has("imports.templates.view")}><Download className="h-4 w-4" />Template CSV</Button>}
      />
      <div className="space-y-4 p-4 md:p-6">
        {error ? <InlineAlert title={friendlyHrmError(error, "Import action could not be completed.")} variant="error" /> : null}
        <Tabs defaultValue="center">
          <TabsList><TabsTrigger value="center">Import Center</TabsTrigger><TabsTrigger value="history">Import History</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger></TabsList>
          <TabsContent value="center" className="space-y-4">
            <div className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                <Label className="space-y-1 text-sm">Import type<Select value={activeTemplate?.import_type ?? ""} onValueChange={(value) => { setSelectedTemplate(availableTemplates.find((item) => item.import_type === value) ?? null); setPreview(null); }}><SelectTrigger><SelectValue placeholder="Select import type" /></SelectTrigger><SelectContent>{availableTemplates.map((template) => <SelectItem key={template.import_type} value={template.import_type}>{template.name}</SelectItem>)}</SelectContent></Select></Label>
                <Label className="space-y-1 text-sm">Mode<Select value={mode} onValueChange={(value: ImportMode) => setMode(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{modes.map((item) => <SelectItem key={item} value={item}>{formatLabel(item)}</SelectItem>)}</SelectContent></Select></Label>
                <Label className="space-y-1 text-sm">File name<Input value={fileName} onChange={(event) => setFileName(event.target.value)} /></Label>
                <Label className="space-y-1 text-sm">CSV file<Input type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setFileName(file.name); setCsvContent(await file.text()); }} /></Label>
                {activeTemplate?.sensitive ? <InlineAlert title={has("imports.sensitive.manage") ? "Sensitive import: fields are masked in row history unless your role allows sensitive imports." : "Sensitive import: imports.sensitive.manage is required before this file can be previewed or applied."} variant="warning" /> : null}
              </div>
              <Label className="space-y-1 text-sm">CSV content<Textarea className="min-h-72 font-mono text-xs" value={csvContent} onChange={(event) => setCsvContent(event.target.value)} placeholder={activeTemplate ? activeTemplate.columns.map((column) => column.key).join(",") : "Paste CSV with headers"} /></Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <LoadingButton loading={previewMutation.isPending} disabled={!activeTemplate || !has("imports.preview")} onClick={() => activeTemplate && previewMutation.mutate({ import_type: activeTemplate.import_type, mode, csv_content: csvContent, file_name: fileName })}><FileCheck2 className="h-4 w-4" />Preview only</LoadingButton>
              <LoadingButton loading={createMutation.isPending} disabled={!activeTemplate || !has("imports.upload")} variant="outline" onClick={() => activeTemplate && createMutation.mutate({ import_type: activeTemplate.import_type, mode, csv_content: csvContent, file_name: fileName })}><Upload className="h-4 w-4" />Create job</LoadingButton>
              <LoadingButton loading={applyMutation.isPending} disabled={!preview?.job?.id || preview.job.id === "preview_only" || blockingErrors || !has("imports.apply")} variant="secondary" onClick={() => preview?.job?.id && applyMutation.mutate(preview.job.id)}>Apply valid rows</LoadingButton>
              {blockingErrors ? <span className="text-sm text-destructive">Apply is disabled until blocking row errors are fixed.</span> : null}
            </div>
            {preview ? (
              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="rounded-lg border bg-card p-4 text-sm">
                  <div className="font-semibold">Validation summary</div>
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    <dt>Total</dt><dd>{preview.summary.total_rows}</dd>
                    <dt>Valid</dt><dd>{preview.summary.valid_rows}</dd>
                    <dt>Invalid</dt><dd>{preview.summary.invalid_rows}</dd>
                    <dt>Duplicates</dt><dd>{preview.summary.duplicate_rows}</dd>
                  </dl>
                </div>
                <DataTable rows={preview.errors} getRowId={(row) => `${row.row_number}-${row.error_code}`} compact emptyTitle="No row errors" columns={[{ key: "row_number", header: "Row" }, { key: "error_code", header: "Code" }, { key: "error_message", header: "Message" }]} />
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="history" className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3"><Input placeholder="Import type" value={filters.import_type ?? ""} onChange={(event) => updateFilters({ import_type: event.target.value })} /><Input placeholder="Status" value={filters.status ?? ""} onChange={(event) => updateFilters({ status: event.target.value })} /><Button variant="outline" onClick={() => updateFilters({ import_type: undefined, status: undefined })}>Clear filters</Button></div>
            <DataTable rows={jobs.data?.data.data ?? []} loading={jobs.isLoading} pagination={jobs.data?.data.pagination} compact getRowId={(row) => row.id} columns={[{ key: "id", header: "Job" }, { key: "import_type", header: "Type", cell: (row) => formatLabel(row.import_type) }, { key: "mode", header: "Mode", cell: (row) => formatLabel(row.mode) }, { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> }, { key: "total_rows", header: "Rows" }, { key: "valid_rows", header: "Valid" }, { key: "invalid_rows", header: "Invalid" }, { key: "requested_at", header: "Requested" }]} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => loadRows(row) }, { key: "more", label: "Errors", onSelect: () => loadRows(row, "invalid") }, ...(has("imports.apply") && row.status === "preview_ready" ? [{ key: "approve" as const, label: "Apply", onSelect: () => applyMutation.mutate(row.id) }] : []), ...(has("imports.cancel") ? [{ key: "reject" as const, label: "Cancel", onSelect: () => cancelMutation.mutate(row.id) }] : [])]} />} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
          </TabsContent>
          <TabsContent value="templates">
            <DataTable rows={availableTemplates} loading={templates.isLoading} compact getRowId={(row) => row.import_type} columns={[{ key: "name", header: "Template" }, { key: "category", header: "Category" }, { key: "sensitive", header: "Sensitive", cell: (row) => row.sensitive ? "Yes" : "No" }, { key: "max_rows", header: "Max Rows" }, { key: "description", header: "Description" }]} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelectedTemplate(row); setSelectedJob(null); setDrawerRows([]); } }, { key: "download", label: "Template", onSelect: () => void downloadTemplate(row) }]} />} />
          </TabsContent>
        </Tabs>
      </div>
      <DetailDrawer title={selectedJob ? `Import job ${selectedJob.id}` : activeTemplate?.name ?? "Import detail"} subtitle="Raw sensitive metadata is not shown." open={Boolean(selectedJob || (selectedTemplate && drawerRows.length === 0))} onOpenChange={(open) => { if (!open) { setSelectedJob(null); setDrawerRows([]); } }}>
        {selectedJob ? <DetailSection title="Job" rows={[{ label: "Status", value: selectedJob.status }, { label: "Counts", value: `${selectedJob.valid_rows} valid / ${selectedJob.invalid_rows} invalid / ${selectedJob.duplicate_rows} duplicate` }]} /> : null}
        {selectedTemplate ? <DetailSection title="Template Columns" rows={[{ label: "Columns", value: json(selectedTemplate.columns) }]} /> : null}
        {drawerRows.length > 0 ? <DetailSection title="Rows" rows={[{ label: "Preview", value: json(drawerRows.slice(0, 25)) }]} /> : null}
      </DetailDrawer>
    </div>
  );
};
