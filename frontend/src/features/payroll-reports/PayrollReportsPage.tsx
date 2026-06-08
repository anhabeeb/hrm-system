import { useQuery } from "@tanstack/react-query";
import { FileSearch, RefreshCw, ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/EmptyState";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmployeeCombobox, OutletCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatReportValue } from "@/features/reports/report-format";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { formatMoneyMinor } from "@/lib/format";
import { searchParamNumber } from "@/lib/query-string";
import { payrollReportsApi } from "./payroll-reports.api";
import { ReportExportActions } from "@/features/report-exports/ReportExportActions";
import type { PayrollReportDefinition, PayrollReportFilters } from "./payroll-reports.types";

const categories = [
  { key: "payroll", label: "Payroll Summary" },
  { key: "salary", label: "Salary / Compensation" },
  { key: "deductions", label: "Deductions" },
  { key: "advances_loans", label: "Advances & Loans" },
  { key: "attendance", label: "Attendance / Overtime" },
  { key: "long_leave", label: "Long Leave / Leave" },
  { key: "payslips", label: "Payslips" },
  { key: "approvals", label: "Approval / Finalization" },
  { key: "cost", label: "Cost Summary" },
  { key: "audit", label: "Payroll Audit" },
  { key: "finance_summary", label: "Finance Summary" },
];

const clean = (value: string | null) => value || undefined;

const filtersFromParams = (searchParams: URLSearchParams): PayrollReportFilters => ({
  payroll_month: clean(searchParams.get("payroll_month")),
  payroll_run_id: clean(searchParams.get("payroll_run_id")),
  from_date: clean(searchParams.get("from_date")),
  to_date: clean(searchParams.get("to_date")),
  outlet_id: clean(searchParams.get("outlet_id")),
  employee_id: clean(searchParams.get("employee_id")),
  department_id: clean(searchParams.get("department_id")),
  employee_type: (clean(searchParams.get("employee_type")) as PayrollReportFilters["employee_type"]) ?? undefined,
  payroll_status: clean(searchParams.get("payroll_status")),
  payslip_status: clean(searchParams.get("payslip_status")),
  deduction_type: clean(searchParams.get("deduction_type")),
  variance_threshold: searchParamNumber(searchParams, "variance_threshold", 0),
  search: clean(searchParams.get("search")),
  page: searchParamNumber(searchParams, "page", 1),
  page_size: searchParamNumber(searchParams, "page_size", 25),
});

const defaultReportFor = (reports: PayrollReportDefinition[], selected?: string | null) =>
  reports.find((report) => report.report_key === selected) ?? reports[0] ?? null;

export const PayrollReportsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const selectedCategory = searchParams.get("category") ?? "payroll";
  const selectedReportKey = searchParams.get("report") ?? undefined;

  const catalogQuery = useQuery({ queryKey: ["payroll-reports", "catalog"], queryFn: () => payrollReportsApi.catalog() });
  const allReports = catalogQuery.data?.data.data ?? [];
  const visibleReports = allReports.filter((report) => report.category === selectedCategory);
  const selectedReport = defaultReportFor(visibleReports.length ? visibleReports : allReports, selectedReportKey);
  const reportQuery = useQuery({
    queryKey: ["payroll-reports", selectedReport?.report_key, filters],
    queryFn: () => payrollReportsApi.report(selectedReport?.report_key ?? "monthly-summary", filters),
    enabled: Boolean(selectedReport),
  });
  const result = reportQuery.data?.data;
  const currency = result?.meta.currency ?? "MVR";

  const updateParams = (next: Partial<PayrollReportFilters> & { report?: string; category?: string }) => {
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
      if (column.data_type === "money") {
        const value = typeof row[column.key] === "number" ? row[column.key] as number : null;
        return <span className="block text-right tabular-nums">{value === null ? "Restricted" : formatMoneyMinor(value, currency)}</span>;
      }
      return <span className="max-w-xs truncate">{formatReportValue(row[column.key])}</span>;
    },
  }));

  const error = catalogQuery.error ?? reportQuery.error;

  return (
    <div>
      <PageHeader title="Payroll / Finance Reports" description="Salary, deductions, advances, loans, overtime, long-leave deductions, payslips, approvals, and finance payroll summaries." />
      <div className="space-y-4 p-4 md:p-6">
        {error ? <InlineAlert title={friendlyHrmError(error, "Payroll reports could not be loaded.")} variant="error" /> : null}
        {result?.meta.restricted ? (
          <InlineAlert title="Sensitive payroll amounts are hidden because your role does not include payroll_reports.sensitive_amounts.view." />
        ) : null}

        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-8">
          <Input type="month" value={filters.payroll_month ?? ""} onChange={(event) => updateParams({ payroll_month: event.target.value })} aria-label="Payroll month" />
          <OutletCombobox value={filters.outlet_id} onChange={(value) => updateParams({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" />
          <EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} onChange={(value) => updateParams({ employee_id: value })} placeholder="All employees" />
          <Input type="date" value={filters.from_date ?? ""} onChange={(event) => updateParams({ from_date: event.target.value })} aria-label="From date" />
          <Input type="date" value={filters.to_date ?? ""} onChange={(event) => updateParams({ to_date: event.target.value })} aria-label="To date" />
          <Select value={filters.payroll_status ?? "all"} onValueChange={(value) => updateParams({ payroll_status: value === "all" ? undefined : value })}>
            <SelectTrigger><SelectValue placeholder="Payroll status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_approval">Pending approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
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
            {categories.map((category) => (
              <TabsTrigger key={category.key} value={category.key}>{category.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Report catalog</h2>
              <p className="text-xs text-muted-foreground">Permission-aware payroll reports only. Amount access is separately guarded.</p>
            </div>
            <DataTable
              compact
              rows={visibleReports}
              loading={catalogQuery.isLoading}
              columns={[
                { key: "name", header: "Report", cell: (row) => <button className="text-left text-sm font-medium hover:underline" onClick={() => updateParams({ report: row.report_key })}>{row.name}</button> },
                { key: "sensitive", header: "Sensitive", cell: (row) => row.sensitive ? <ShieldAlert className="h-4 w-4 text-amber-600" /> : <StatusBadge status="active" /> },
              ]}
              getRowId={(row) => row.report_key}
              emptyTitle="No payroll reports available"
              emptyDescription="Your role may not include this report category."
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold">{selectedReport?.name ?? "Select a report"}</h2>
                </div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{selectedReport?.description ?? "Choose a payroll report from the catalog."}</p>
              </div>
              {selectedReport ? <ReportExportActions reportKey={`payroll:${selectedReport.report_key}`} filters={filters as Record<string, unknown>} sensitive={selectedReport.sensitive} /> : null}
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
                getRowId={(row) => String(row.id ?? row.employee_id ?? row.payroll_run_id ?? row.report_key ?? JSON.stringify(row).slice(0, 80))}
                rowActions={(row) => row.employee_id ? <RowActions actions={[{ key: "view", label: "View Employee 360", onSelect: () => window.location.assign(`/employees/${row.employee_id}`) }]} /> : null}
                emptyTitle="No report rows found"
                emptyDescription="Try adjusting filters, selecting a payroll month, or choosing another report."
              />
            ) : (
              <EmptyState title="No report selected" description="Pick a report from the catalog to load export-ready JSON rows." />
            )}

            <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
              <Label className="font-medium">Export-ready JSON only</Label>
              <p className="mt-1">CSV export and print views use the same scoped payroll report data. Sensitive amounts remain redacted unless your role allows them.</p>
              <p className="mt-1">Generated at: {result?.generated_at ? formatReportValue(result.generated_at) : "Not generated yet"}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
