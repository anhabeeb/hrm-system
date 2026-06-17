import { useQuery } from "@tanstack/react-query";
import { FileSearch, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { AppDateRangePicker } from "@/components/forms/AppDateRangePicker";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { formatReportValue } from "@/features/reports/report-format";
import { ReportExportActions } from "@/features/report-exports/ReportExportActions";
import { useAuth } from "@/features/auth/auth.store";
import { hrReportsApi } from "./hr-reports.api";
import type { HrReportDefinition, HrReportFilters } from "./hr-reports.types";

const categories = [
  { key: "employee", label: "Employee Reports" },
  { key: "compliance", label: "Compliance Reports" },
  { key: "documents", label: "Documents" },
  { key: "leave", label: "Leave Reports" },
  { key: "long_leave", label: "Long Leave" },
  { key: "assets", label: "Assets/Uniforms" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "summary", label: "Summary" },
];

const clean = (value: string | null) => value || undefined;

const filtersFromParams = (searchParams: URLSearchParams): HrReportFilters => ({
  from_date: clean(searchParams.get("from_date")),
  to_date: clean(searchParams.get("to_date")),
  as_of_date: clean(searchParams.get("as_of_date")),
  outlet_id: clean(searchParams.get("outlet_id")),
  employee_id: clean(searchParams.get("employee_id")),
  department_id: clean(searchParams.get("department_id")),
  employee_type: (clean(searchParams.get("employee_type")) as HrReportFilters["employee_type"]) ?? undefined,
  employment_status: clean(searchParams.get("employment_status")),
  search: clean(searchParams.get("search")),
  page: searchParamNumber(searchParams, "page", 1),
  page_size: searchParamNumber(searchParams, "page_size", 25),
});

const defaultReportFor = (reports: HrReportDefinition[], selected?: string | null) =>
  reports.find((report) => report.report_key === selected) ?? reports[0] ?? null;

export const HrReportsPage = () => {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const visibleCategories = useMemo(
    () => categories.filter((category) =>
      (category.key !== "leave" || auth.hasFeature("leave_management")) &&
      (category.key !== "long_leave" || auth.hasFeature("long_leave_management")) &&
      (category.key !== "assets" || (auth.hasFeature("asset_tracking") && auth.hasFeature("uniform_tracking"))),
    ),
    [auth],
  );
  const requestedCategory = searchParams.get("category") ?? "employee";
  const selectedCategory = visibleCategories.some((category) => category.key === requestedCategory) ? requestedCategory : "employee";
  const selectedReportKey = searchParams.get("report") ?? undefined;

  const catalogQuery = useQuery({ queryKey: ["hr-reports", "catalog"], queryFn: () => hrReportsApi.catalog() });
  const allReports = (catalogQuery.data?.data.data ?? []).filter((report) =>
    (report.category !== "leave" || auth.hasFeature("leave_management")) &&
    (report.category !== "long_leave" || auth.hasFeature("long_leave_management")) &&
    (report.report_key !== "contracts" || auth.hasFeature("contract_tracking")),
  );
  const visibleReports = allReports.filter((report) => report.category === selectedCategory);
  const selectedReport = defaultReportFor(visibleReports.length ? visibleReports : allReports, selectedReportKey);
  const reportQuery = useQuery({
    queryKey: ["hr-reports", selectedReport?.report_key, filters],
    queryFn: () => hrReportsApi.report(selectedReport?.report_key ?? "employee-master", filters),
    enabled: Boolean(selectedReport),
  });
  const result = reportQuery.data?.data;

  const updateParams = (next: Partial<HrReportFilters> & { report?: string; category?: string }) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === null) params.delete(key);
      else params.set(key, String(value));
    });
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };

  const columns = (result?.meta.columns ?? selectedReport?.columns ?? []).slice(0, 12).map((column) => ({
    key: column.key,
    header: column.label,
    cell: (row: Record<string, unknown>) => {
      if (column.data_type === "status") return <StatusBadge status={String(row[column.key] ?? "neutral")} />;
      if (["employee_name", "full_name"].includes(column.key)) {
        const name = String(row[column.key] ?? "");
        return (
          <div className="flex min-w-0 items-center gap-2">
            <EmployeeAvatar name={name} employeeCode={String(row.employee_code ?? row.employee_no ?? "")} photoUrl={typeof row.profile_photo_url === "string" ? row.profile_photo_url : null} size="sm" />
            <span className="max-w-48 truncate">{formatReportValue(row[column.key])}</span>
          </div>
        );
      }
      return <span className="block max-w-xs truncate">{formatReportValue(row[column.key])}</span>;
    },
  }));

  const error = catalogQuery.error ?? reportQuery.error;

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {error ? <InlineAlert title={friendlyHrmError(error, "HR reports could not be loaded.")} variant="error" /> : null}

        <div className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 md:grid-cols-7">
          <OutletCombobox value={filters.outlet_id} onChange={(value) => updateParams({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" />
          <EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => updateParams({ employee_id: value })} placeholder="All employees" />
          <div className="min-w-0 md:col-span-2">
            <AppDateRangePicker
              dateFrom={filters.from_date}
              dateTo={filters.to_date}
              fromLabel="From date"
              toLabel="To date"
              onChange={({ dateFrom, dateTo }) => updateParams({ from_date: dateFrom, to_date: dateTo })}
            />
          </div>
          <Select value={filters.employee_type ?? "all"} onValueChange={(value) => updateParams({ employee_type: value as HrReportFilters["employee_type"] })}>
            <SelectTrigger><SelectValue placeholder="Employee type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="local">Local</SelectItem>
              <SelectItem value="foreign">Foreign</SelectItem>
            </SelectContent>
          </Select>
          <Input value={filters.search ?? ""} onChange={(event) => updateParams({ search: event.target.value })} placeholder="Search employee/code" />
          <Button variant="outline" onClick={() => void reportQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Tabs value={selectedCategory} onValueChange={(category) => updateParams({ category })}>
          <TabsList className="flex flex-wrap">
            {visibleCategories.map((category) => (
              <TabsTrigger key={category.key} value={category.key}>{category.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-w-0 rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Report catalog</h2>
              <p className="text-xs text-muted-foreground">Only reports available to your role are shown.</p>
            </div>
            <DataTable
              compact
              rows={visibleReports}
              loading={catalogQuery.isLoading}
              columns={[
                { key: "name", header: "Report", cell: (row) => <button className="text-left text-sm font-medium hover:underline" onClick={() => updateParams({ report: row.report_key })}>{row.name}</button> },
                { key: "export_ready", header: "Output", cell: () => <StatusBadge status="xlsx/pdf" /> },
              ]}
              getRowId={(row) => row.report_key}
              emptyTitle="No HR reports available"
              emptyDescription="Your role may not include this report category."
            />
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold">{selectedReport?.name ?? "Select a report"}</h2>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{selectedReport?.description ?? "Choose an HR report from the catalog."}</p>
              </div>
              {selectedReport ? <ReportExportActions reportKey={`hr:${selectedReport.report_key}`} filters={filters as Record<string, unknown>} sensitive={selectedReport.columns.some((column) => ["passport", "work_permit", "national_id"].some((key) => column.key.includes(key)))} /> : null}
            </div>

            {selectedReport ? (
              <DataTable
                compact
                rows={result?.data ?? []}
                columns={columns}
                loading={reportQuery.isLoading}
                pagination={result?.pagination}
                onPageChange={(page) => updateParams({ page })}
                onPageSizeChange={(page_size) => updateParams({ page_size })}
                getRowId={(row) => String(row.id ?? row.employee_id ?? row.report_key ?? JSON.stringify(row).slice(0, 80))}
                rowActions={(row) => row.employee_id ? <RowActions actions={[{ key: "view", label: "View Employee 360", onSelect: () => window.location.assign(`/employees/${row.employee_id}`) }]} /> : null}
                emptyTitle="No report rows found"
                emptyDescription="Try adjusting filters or choosing another report."
              />
            ) : (
              <EmptyState title="No report selected" description="Pick a report from the catalog to preview scoped report rows and export Excel or PDF files." />
            )}

            <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Excel/PDF output</p>
              <p className="mt-1">Report previews use scoped backend data. Download actions generate Excel workbooks or PDF reports for normal users.</p>
              <p className="mt-1">Generated at: {result?.generated_at ? formatReportValue(result.generated_at) : "Not generated yet"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
