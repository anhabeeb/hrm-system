import { useMutation, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { DetailDrawer } from "@/components/data/DetailDrawer";
import { DetailSection } from "@/components/data/DetailSection";
import { EmptyState } from "@/components/data/EmptyState";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { toastError, toastSuccess } from "@/components/feedback/toast-helpers";
import { useToast } from "@/components/feedback/useToast";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { AppMonthPicker } from "@/components/forms/AppMonthPicker";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { notificationTemplatePlaceholders, templatePlaceholders } from "@/features/templates/templates.api";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { sanitizeForDisplay } from "@/lib/safe-display";
import type { TableColumn } from "@/types/common";
import { ReportExportActions } from "@/features/report-exports/ReportExportActions";
import { formatReportValue, reportColumnLabel } from "./report-format";
import { reportsApi } from "./reports.api";
import type { ReportDefinition, ReportFilters, ReportResult } from "./reports.types";

const reportPaths = {
  employees: "/reports/employees/summary",
  attendance: "/reports/attendance/summary",
  leave: "/reports/leave/summary",
  payroll: "/reports/payroll/summary",
  assets: "/reports/assets/summary",
  documents: "/reports/documents/summary",
  expiring: "/reports/compliance/expiring-documents",
  missing: "/reports/compliance/missing-documents",
  audit: "/reports/audit/activity",
  devices: "/reports/devices/health",
  sync: "/reports/sync/status",
} as const;

const resultRows = (result?: ReportResult) => Array.isArray(result?.rows) ? result.rows : [];
const dynamicColumns = (rows: Record<string, unknown>[]): TableColumn<Record<string, unknown>>[] =>
  Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8).map((key) => ({
    key,
    header: reportColumnLabel(key),
    cell: (row) => <span className="max-w-xs truncate">{formatReportValue(row[key])}</span>,
  }));

const SummaryPanel = ({ value }: { value?: Record<string, unknown> }) => {
  const entries = Object.entries(sanitizeForDisplay(value ?? {}) as Record<string, unknown>).slice(0, 12);
  if (entries.length === 0) return null;
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
      {entries.map(([key, item]) => (
        <div key={key} className="rounded-md border bg-muted/30 p-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{reportColumnLabel(key)}</div>
          <div className="mt-1 truncate text-sm font-semibold">{formatReportValue(item)}</div>
        </div>
      ))}
    </div>
  );
};

const ReportResultPanel = ({ result, loading }: { result?: ReportResult; loading?: boolean }) => {
  const rows = resultRows(result);
  const columns = dynamicColumns(rows);
  return (
    <div className="space-y-3">
      {result?.summary ? <SummaryPanel value={result.summary} /> : null}
      <DataTable
        rows={rows}
        columns={columns.length ? columns : [{ key: "message", header: "Result", cell: () => "No row data returned" }]}
        getRowId={(row) => String(row.id ?? row.employee_id ?? row.device_id ?? JSON.stringify(row).slice(0, 80))}
        loading={loading}
        pagination={result?.pagination}
        emptyTitle="No report data found"
        emptyDescription="No report data found for the selected filters."
        compact
      />
    </div>
  );
};

const PermissionPlaceholder = ({ title }: { title: string }) => (
  <EmptyState title={title} description="You do not have permission to view this report." />
);

export const ReportsPage = () => {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "catalog");
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [generateFormat, setGenerateFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generated, setGenerated] = useState<ReportResult | null>(null);
  const toast = useToast();
  const has = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canPayroll = has("payroll.view");
  const canAudit = has("audit_logs.view");
  const canDevices = has("devices.view_health") || has("sync.view_device_health");
  const canSync = has("sync.view");
  const canViewEmployeeReport = has("employees.view");
  const canViewAssetReport = has("assets.view");
  const canViewAttendanceReport = has("attendance.view");
  const canViewLeaveReport = has("leave.view");
  const canViewDocumentSummaryReport = has("documents.view");
  // The backend currently requires documents.view, while the UI also honors the seeded granular permissions.
  const canViewExpiringDocumentsReport = has("documents.view") && has("documents.view_expiring");
  const canViewMissingDocumentsReport = has("documents.view") && has("documents.view_missing");
  const canViewCompliance = canViewDocumentSummaryReport || canViewExpiringDocumentsReport || canViewMissingDocumentsReport;
  const activeTab = tab === "payroll" && !canPayroll ? "catalog" : tab === "audit" && !canAudit ? "catalog" : tab === "devices" && (!canDevices && !canSync) ? "catalog" : tab === "compliance" && !canViewCompliance ? "catalog" : tab;
  const filters = useMemo<ReportFilters>(() => ({
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    status: searchParams.get("status") || undefined,
    payroll_month: searchParams.get("payroll_month") || undefined,
    module: searchParams.get("module") || undefined,
    action: searchParams.get("action") || undefined,
    device_id: searchParams.get("device_id") || undefined,
    days: searchParamNumber(searchParams, "days", 30),
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<ReportFilters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", activeTab);
    setSearchParams(params);
  };
  const setActiveTab = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    params.set("page", "1");
    setSearchParams(params);
  };
  const catalogQuery = useQuery({ queryKey: ["reports", "catalog"], queryFn: reportsApi.catalog, enabled: activeTab === "catalog" || activeTab === "generate" });
  const employeeReportQuery = useQuery({ queryKey: ["reports", "employees", filters], queryFn: () => reportsApi.byPath(reportPaths.employees, filters), enabled: activeTab === "hr" && canViewEmployeeReport });
  const assetReportQuery = useQuery({ queryKey: ["reports", "assets", filters], queryFn: () => reportsApi.byPath(reportPaths.assets, filters), enabled: activeTab === "hr" && canViewAssetReport });
  const attendanceReportQuery = useQuery({ queryKey: ["reports", "attendance", filters], queryFn: () => reportsApi.byPath(reportPaths.attendance, filters), enabled: activeTab === "attendance" && canViewAttendanceReport });
  const leaveReportQuery = useQuery({ queryKey: ["reports", "leave", filters], queryFn: () => reportsApi.byPath(reportPaths.leave, filters), enabled: activeTab === "attendance" && canViewLeaveReport });
  const payrollQuery = useQuery({ queryKey: ["reports", "payroll", filters], queryFn: () => reportsApi.byPath(reportPaths.payroll, filters), enabled: activeTab === "payroll" && canPayroll });
  const documentSummaryQuery = useQuery({ queryKey: ["reports", "document-summary", filters], queryFn: () => reportsApi.byPath(reportPaths.documents, filters), enabled: activeTab === "compliance" && canViewDocumentSummaryReport });
  const expiringDocumentsQuery = useQuery({ queryKey: ["reports", "expiring-documents", filters], queryFn: () => reportsApi.byPath(reportPaths.expiring, filters), enabled: activeTab === "compliance" && canViewExpiringDocumentsReport });
  const missingDocumentsQuery = useQuery({ queryKey: ["reports", "missing-documents", filters], queryFn: () => reportsApi.byPath(reportPaths.missing, filters), enabled: activeTab === "compliance" && canViewMissingDocumentsReport });
  const auditQuery = useQuery({ queryKey: ["reports", "audit", filters], queryFn: () => reportsApi.byPath(reportPaths.audit, filters), enabled: activeTab === "audit" && canAudit });
  const devicesQuery = useQuery({ queryKey: ["reports", "devices", filters], queryFn: () => Promise.all([canDevices ? reportsApi.byPath(reportPaths.devices, filters) : Promise.resolve(null), canSync ? reportsApi.byPath(reportPaths.sync, filters) : Promise.resolve(null)]), enabled: activeTab === "devices" && (canDevices || canSync) });
  const generateMutation = useMutation({
    mutationFn: reportsApi.generate,
    onSuccess: (response) => {
      setGenerated(response.data);
      toastSuccess(toast, "Report generated successfully.");
    },
    onError: (error) => toastError(toast, error, "Report could not be generated."),
  });
  const activeError = activeTab === "payroll" ? payrollQuery.error : activeTab === "audit" ? auditQuery.error : activeTab === "devices" ? devicesQuery.error : activeTab === "compliance" ? documentSummaryQuery.error ?? expiringDocumentsQuery.error ?? missingDocumentsQuery.error : activeTab === "attendance" ? attendanceReportQuery.error ?? leaveReportQuery.error : activeTab === "hr" ? employeeReportQuery.error ?? assetReportQuery.error : activeTab === "catalog" ? catalogQuery.error : null;
  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {activeError ? <InlineAlert title={friendlyHrmError(activeError, "Report data could not be loaded.")} variant="error" /> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1fr_1fr_2fr_1fr_1fr]">
          <OutletCombobox value={filters.outlet_id} onChange={(value) => updateFilters({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" />
          <EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => updateFilters({ employee_id: value })} placeholder="All employees" />
          <AppDateRangePicker dateFrom={filters.date_from} dateTo={filters.date_to} fromLabel="Date from" toLabel="Date to" onChange={({ dateFrom, dateTo }) => updateFilters({ date_from: dateFrom, date_to: dateTo })} />
          <AppMonthPicker label="Payroll month" value={filters.payroll_month} onChange={(value) => updateFilters({ payroll_month: value })} />
          <Input placeholder="Status" value={filters.status ?? ""} onChange={(event) => updateFilters({ status: event.target.value })} />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="hr">HR Reports</TabsTrigger>
            <TabsTrigger value="attendance">Attendance & Leave</TabsTrigger>
            {canPayroll ? <TabsTrigger value="payroll">Payroll</TabsTrigger> : null}
            {canViewCompliance ? <TabsTrigger value="compliance">Compliance</TabsTrigger> : null}
            {canAudit ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
            {(canDevices || canSync) ? <TabsTrigger value="devices">Devices & Sync</TabsTrigger> : null}
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          <TabsContent value="catalog">
            <DataTable
              rows={catalogQuery.data?.data.reports ?? []}
              loading={catalogQuery.isLoading}
              columns={[
                { key: "report_name", header: "Report Name" },
                { key: "category", header: "Category", cell: (row) => <StatusBadge status={row.category ?? "neutral"} /> },
                { key: "description", header: "Description" },
                { key: "sensitive", header: "Sensitive", cell: (row) => row.sensitive ? "Yes" : "No" },
                { key: "supports_export", header: "Export", cell: (row) => row.supports_export ? "Supported" : "No" },
                { key: "required_permission", header: "Required Permission" },
              ]}
              getRowId={(row) => row.report_key}
              rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelectedReport(row); setDrawerOpen(true); } }]} />}
              compact
            />
          </TabsContent>
          <TabsContent value="generate">
            <div className="grid gap-4 rounded-lg border bg-card p-4 lg:grid-cols-[320px_1fr]">
              <div className="space-y-3">
                <Label className="space-y-1 text-sm">Report<Select value={selectedReport?.report_key ?? ""} onValueChange={(value) => setSelectedReport((catalogQuery.data?.data.reports ?? []).find((report) => report.report_key === value) ?? null)}><SelectTrigger><SelectValue placeholder="Select report" /></SelectTrigger><SelectContent>{(catalogQuery.data?.data.reports ?? []).map((report) => <SelectItem key={report.report_key} value={report.report_key}>{report.report_name}</SelectItem>)}</SelectContent></Select></Label>
                <Label className="space-y-1 text-sm">Output format<Select value={generateFormat} onValueChange={(value: "xlsx" | "pdf") => setGenerateFormat(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="xlsx">Excel workbook</SelectItem><SelectItem value="pdf">PDF report</SelectItem></SelectContent></Select></Label>
                <Button disabled={!selectedReport || generateMutation.isPending} onClick={() => selectedReport && generateMutation.mutate({ report_key: selectedReport.report_key, filters, format: generateFormat })}><Play className="h-4 w-4" />Generate {generateFormat === "xlsx" ? "Excel" : "PDF"} report</Button>
                <p className="text-xs font-medium text-muted-foreground">Generate Excel or Generate PDF from the selected report.</p>
                <p className="text-sm text-muted-foreground">Report outputs are generated as Excel or PDF files. The preview below uses safe table rows only.</p>
                {selectedReport ? <ReportExportActions reportKey={selectedReport.report_key} filters={filters as Record<string, unknown>} sensitive={selectedReport.sensitive} /> : null}
              </div>
              <div className="space-y-3">
                {generated ? <InlineAlert title={`${generateFormat === "xlsx" ? "Excel" : "PDF"} report generated.`}>Use the download actions for file output, or review the scoped preview below.</InlineAlert> : null}
                <ReportResultPanel result={generated ?? undefined} loading={generateMutation.isPending} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="hr">{canViewEmployeeReport ? <ReportResultPanel result={employeeReportQuery.data?.data} loading={employeeReportQuery.isLoading} /> : <PermissionPlaceholder title="This report is not available for your role." />}{canViewAssetReport ? <ReportResultPanel result={assetReportQuery.data?.data} loading={assetReportQuery.isLoading} /> : <PermissionPlaceholder title="This report is not available for your role." />}</TabsContent>
          <TabsContent value="attendance">{canViewAttendanceReport ? <ReportResultPanel result={attendanceReportQuery.data?.data} loading={attendanceReportQuery.isLoading} /> : <PermissionPlaceholder title="This report is not available for your role." />}{canViewLeaveReport ? <ReportResultPanel result={leaveReportQuery.data?.data} loading={leaveReportQuery.isLoading} /> : <PermissionPlaceholder title="This report is not available for your role." />}</TabsContent>
          {canPayroll ? <TabsContent value="payroll"><ReportResultPanel result={payrollQuery.data?.data} loading={payrollQuery.isLoading} /></TabsContent> : <TabsContent value="payroll"><PermissionPlaceholder title="Payroll reports are not available for your role." /></TabsContent>}
          {canViewCompliance ? <TabsContent value="compliance">{canViewDocumentSummaryReport ? <ReportResultPanel result={documentSummaryQuery.data?.data} loading={documentSummaryQuery.isLoading} /> : <PermissionPlaceholder title="This compliance report is not available for your role." />}{canViewExpiringDocumentsReport ? <ReportResultPanel result={expiringDocumentsQuery.data?.data} loading={expiringDocumentsQuery.isLoading} /> : <PermissionPlaceholder title="This compliance report is not available for your role." />}{canViewMissingDocumentsReport ? <ReportResultPanel result={missingDocumentsQuery.data?.data} loading={missingDocumentsQuery.isLoading} /> : <PermissionPlaceholder title="This compliance report is not available for your role." />}</TabsContent> : null}
          {canAudit ? <TabsContent value="audit"><ReportResultPanel result={auditQuery.data?.data} loading={auditQuery.isLoading} /></TabsContent> : null}
          {(canDevices || canSync) ? <TabsContent value="devices">{canDevices ? <ReportResultPanel result={devicesQuery.data?.[0]?.data} loading={devicesQuery.isLoading} /> : <PermissionPlaceholder title="Device health report is not available for your role." />}{canSync ? <ReportResultPanel result={devicesQuery.data?.[1]?.data} loading={devicesQuery.isLoading} /> : <PermissionPlaceholder title="Sync status report is not available for your role." />}</TabsContent> : null}
          <TabsContent value="templates">
            <div className="space-y-4">
              <InlineAlert title="Report templates use safe export outputs." variant="info">Report outputs are generated as Excel or PDF files. Notification provider integration and send actions remain separate from report generation.</InlineAlert>
              <DataTable rows={templatePlaceholders} columns={[{ key: "template_name", header: "Template Name" }, { key: "category", header: "Category" }, { key: "format", header: "Format" }, { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> }, { key: "description", header: "Description" }]} getRowId={(row) => row.id} compact />
              <DataTable rows={notificationTemplatePlaceholders} columns={[{ key: "template_name", header: "Notification Template" }, { key: "category", header: "Trigger" }, { key: "format", header: "Channel" }, { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> }, { key: "description", header: "Description" }]} getRowId={(row) => row.id} compact />
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <DetailDrawer title={selectedReport?.report_name ?? "Report"} subtitle={selectedReport?.description} open={drawerOpen} onOpenChange={setDrawerOpen}>
        {selectedReport ? <DetailSection title="Report metadata" rows={[
          { label: "Key", value: selectedReport.report_key },
          { label: "Category", value: selectedReport.category },
          { label: "Sensitive", value: selectedReport.sensitive ? "Yes" : "No" },
          { label: "Required Permission", value: selectedReport.required_permission },
          { label: "Supported Filters", value: selectedReport.supported_filters?.join(", ") || "Not specified" },
        ]} /> : null}
      </DetailDrawer>
    </div>
  );
};
