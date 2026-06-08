import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { LookupCombobox } from "@/components/selectors/LookupCombobox";
import { lookupApi } from "@/components/selectors/lookup-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { searchParamNumber } from "@/lib/query-string";
import { friendlyOperationalError } from "@/lib/safe-display";
import type { TableColumn } from "@/types/common";
import { attendanceApi } from "./attendance.api";
import { formatDateTime, humanize } from "./attendance-format";
import type { AttendanceFilters, AttendanceReportRow } from "./attendance.types";
import { ReportExportActions } from "@/features/report-exports/ReportExportActions";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const today = isoDate(new Date());
const month = today.slice(0, 7);
const minutes = (value?: number) => value ? `${Math.floor(value / 60)}h ${value % 60}m` : "0m";
const dateLabel = (value?: string | null) => value ? value.slice(0, 10) : "-";
const overnight = (row: AttendanceReportRow) => row.crosses_midnight ? " (+1 day)" : "";
const firstNumber = (row: AttendanceReportRow | undefined, keys: Array<keyof AttendanceReportRow>) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined) return Number(value).toLocaleString();
  }
  return "0";
};

const goTo = (path: string) => {
  window.location.assign(path);
};

const dailyColumns: TableColumn<AttendanceReportRow>[] = [
  { key: "attendance_date", header: "Date", cell: (row) => dateLabel(row.attendance_date) },
  { key: "employee_name", header: "Employee", cell: (row) => `${row.employee_code ?? ""} ${row.employee_name ?? "Unknown"}`.trim() },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? "-" },
  { key: "roster_shift_name", header: "Shift", cell: (row) => row.roster_shift_name ?? row.roster_shift_code ?? "No published shift" },
  { key: "scheduled_start", header: "Scheduled", cell: (row) => row.scheduled_start ? `${row.scheduled_start} -> ${row.scheduled_end ?? "-"}${overnight(row)}` : "-" },
  { key: "first_clock_in", header: "Actual", cell: (row) => `${row.first_clock_in ? formatDateTime(row.first_clock_in) : "-"} / ${row.last_clock_out ? formatDateTime(row.last_clock_out) : "-"}` },
  { key: "worked_minutes", header: "Worked", cell: (row) => minutes(row.worked_minutes) },
  { key: "late_minutes", header: "Late", cell: (row) => minutes(row.late_minutes) },
  { key: "overtime_minutes", header: "OT", cell: (row) => minutes(row.overtime_minutes) },
  { key: "attendance_status", header: "Status", cell: (row) => <StatusBadge status={row.attendance_status ?? "unknown"} /> },
  { key: "source_summary", header: "Source", cell: (row) => humanize(row.source_summary ?? "none") },
  { key: "manual_correction", header: "Correction", cell: (row) => row.manual_correction ? <StatusBadge status="manual" label="Manual" /> : "-" },
];

const monthlyColumns: TableColumn<AttendanceReportRow>[] = [
  { key: "employee_name", header: "Employee", cell: (row) => `${row.employee_code ?? ""} ${row.employee_name ?? "Unknown"}`.trim() },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? "-" },
  { key: "days_scheduled", header: "Scheduled", cell: (row) => row.days_scheduled ?? 0 },
  { key: "days_present", header: "Present", cell: (row) => row.days_present ?? 0 },
  { key: "days_absent", header: "Absent", cell: (row) => row.days_absent ?? 0 },
  { key: "leave_days", header: "Leave", cell: (row) => row.leave_days ?? 0 },
  { key: "late_days", header: "Late Days", cell: (row) => row.late_days ?? 0 },
  { key: "missing_punch_days", header: "Missing", cell: (row) => row.missing_punch_days ?? 0 },
  { key: "total_scheduled_minutes", header: "Scheduled Time", cell: (row) => minutes(row.total_scheduled_minutes) },
  { key: "total_worked_minutes", header: "Worked", cell: (row) => minutes(row.total_worked_minutes) },
  { key: "attendance_percentage", header: "Attendance %", cell: (row) => `${row.attendance_percentage ?? 0}%` },
  { key: "exception_count", header: "Exceptions", cell: (row) => row.exception_count ?? 0 },
];

const exceptionColumns: TableColumn<AttendanceReportRow>[] = [
  { key: "report_date", header: "Date", cell: (row) => dateLabel(row.report_date) },
  { key: "employee_name", header: "Employee / Device User", cell: (row) => row.employee_name ?? row.biometric_user_id ?? "Unknown" },
  { key: "outlet_name", header: "Outlet", cell: (row) => row.outlet_name ?? "-" },
  { key: "exception_type", header: "Exception", cell: (row) => humanize(row.exception_type ?? "") },
  { key: "severity", header: "Severity", cell: (row) => <StatusBadge status={row.severity ?? "warning"} /> },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "open"} /> },
  { key: "message", header: "Message", cell: (row) => row.message ?? "-" },
  { key: "recommended_action", header: "Recommended Action", cell: (row) => row.recommended_action ?? "-" },
];

const punchColumns: TableColumn<AttendanceReportRow>[] = [
  { key: "device_name", header: "Device", cell: (row) => row.device_name ?? row.device_code ?? row.device_id ?? "-" },
  { key: "employee_name", header: "Employee / Device User", cell: (row) => row.employee_name ?? row.biometric_user_id ?? "Unmatched" },
  { key: "device_timestamp", header: "Device Time", cell: (row) => formatDateTime(row.device_timestamp) },
  { key: "server_received_at", header: "Received", cell: (row) => formatDateTime(row.server_received_at) },
  { key: "punch_type", header: "Punch", cell: (row) => humanize(row.punch_type ?? "") },
  { key: "source_endpoint", header: "Endpoint", cell: (row) => humanize(row.source_endpoint ?? "biometric") },
  { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status ?? "unknown"} /> },
  { key: "attendance_event_id", header: "Attendance Event", cell: (row) => row.attendance_event_id ?? "-" },
];

const employeeEventColumns: TableColumn<NonNullable<AttendanceReportRow["events"]>[number] & { attendance_date?: string }>[] = [
  { key: "attendance_date", header: "Date", cell: (row) => dateLabel(row.attendance_date ?? row.event_date) },
  { key: "event_type", header: "Event", cell: (row) => humanize(row.event_type ?? "") },
  { key: "event_time", header: "Time", cell: (row) => formatDateTime(row.event_time) },
  { key: "source", header: "Source", cell: (row) => humanize(row.source ?? "") },
  { key: "attendance_method", header: "Method", cell: (row) => humanize(row.attendance_method ?? "") },
  { key: "source_device_id", header: "Device", cell: (row) => row.device_name ?? row.source_device_id ?? row.device_id ?? "-" },
  { key: "source_event_id", header: "Source Event", cell: (row) => row.source_event_id ?? "-" },
  { key: "sync_status", header: "Sync", cell: (row) => <StatusBadge status={row.sync_status ?? "unknown"} /> },
  { key: "approval_status", header: "Approval", cell: (row) => <StatusBadge status={row.approval_status ?? "unknown"} /> },
];

export const AttendanceReportsPage = () => {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "daily");

  const filters = useMemo<AttendanceFilters>(() => ({
    from_date: searchParams.get("from_date") || today,
    to_date: searchParams.get("to_date") || today,
    month: searchParams.get("month") || month,
    outlet_id: searchParams.get("outlet_id") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    position_id: searchParams.get("position_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    attendance_status: searchParams.get("attendance_status") || undefined,
    exception_type: searchParams.get("exception_type") || undefined,
    device_id: searchParams.get("device_id") || undefined,
    source: searchParams.get("source") || undefined,
    late_only: searchParams.get("late_only") === "true" || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<AttendanceFilters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === false) params.delete(key);
      else params.set(key, String(value));
    });
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", tab);
    setSearchParams(params);
  };

  const activeFilters = tab === "monthly"
    ? { ...filters, from_date: undefined, to_date: undefined }
    : filters;

  const summaryQuery = useQuery({ queryKey: ["attendance-reports", "summary", filters], queryFn: () => attendanceApi.reports.summary(filters) });
  const dailyQuery = useQuery({ queryKey: ["attendance-reports", "daily", activeFilters], queryFn: () => attendanceApi.reports.daily(activeFilters), enabled: tab === "daily" });
  const monthlyQuery = useQuery({ queryKey: ["attendance-reports", "monthly", activeFilters], queryFn: () => attendanceApi.reports.monthly(activeFilters), enabled: tab === "monthly" });
  const employeeQuery = useQuery({ queryKey: ["attendance-reports", "employee", activeFilters], queryFn: () => attendanceApi.reports.employee(filters.employee_id!, { ...activeFilters, include_details: true }), enabled: tab === "employee" && Boolean(filters.employee_id) });
  const exceptionsQuery = useQuery({ queryKey: ["attendance-reports", "exceptions", activeFilters], queryFn: () => attendanceApi.reports.exceptions(activeFilters), enabled: tab === "exceptions" });
  const punchesQuery = useQuery({ queryKey: ["attendance-reports", "device-punches", activeFilters], queryFn: () => attendanceApi.reports.devicePunches(activeFilters), enabled: tab === "device-punches" });
  const activeQuery = tab === "monthly" ? monthlyQuery : tab === "employee" ? employeeQuery : tab === "exceptions" ? exceptionsQuery : tab === "device-punches" ? punchesQuery : dailyQuery;
  const exportReportKey = `attendance:${tab === "employee" ? "employee_detail" : tab === "device-punches" ? "device_punches" : tab}`;
  const summary = summaryQuery.data?.data?.[0];
  const employeeEvents = (employeeQuery.data?.data ?? []).flatMap((row) =>
    (row.events ?? []).map((event) => ({ ...event, attendance_date: row.attendance_date })),
  );

  return (
    <div>
      <PageHeader
        title="Attendance Reports"
        description="Review attendance, exceptions, and device punch activity using roster, leave, correction, and biometric context."
      />
      <div className="space-y-4 p-4 md:p-6">
        {activeQuery.isError ? (
          <InlineAlert title={friendlyOperationalError(activeQuery.error, "Attendance report could not be loaded.")} variant="error" />
        ) : null}
        <div className="grid gap-2 md:grid-cols-4">
          {[
            ["Present", firstNumber(summary, ["present", "days_present"])],
            ["Absent", firstNumber(summary, ["absent", "days_absent"])],
            ["Missing Punches", firstNumber(summary, ["missing_punches", "missing_punch_days"])],
            ["Open Exceptions", firstNumber(summary, ["exceptions_open", "exception_count"])],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-card px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={filters.from_date ?? ""} onChange={(event) => updateFilters({ from_date: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={filters.to_date ?? ""} onChange={(event) => updateFilters({ to_date: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Month</Label>
              <Input type="month" value={filters.month ?? ""} onChange={(event) => updateFilters({ month: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Employee</Label>
              <LookupCombobox value={filters.employee_id} onChange={(employee_id) => updateFilters({ employee_id })} queryKey={["lookups", "employees"]} queryFn={lookupApi.employees} placeholder="All employees" />
            </div>
            <div className="space-y-1">
              <Label>Outlet</Label>
              <LookupCombobox value={filters.outlet_id} onChange={(outlet_id) => updateFilters({ outlet_id })} queryKey={["lookups", "outlets"]} queryFn={lookupApi.outlets} placeholder="All outlets" />
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <LookupCombobox value={filters.department_id} onChange={(department_id) => updateFilters({ department_id })} queryKey={["lookups", "departments"]} queryFn={lookupApi.departments} placeholder="All departments" />
            </div>
            <div className="space-y-1">
              <Label>Position</Label>
              <LookupCombobox value={filters.position_id} onChange={(position_id) => updateFilters({ position_id })} queryKey={["lookups", "positions"]} queryFn={lookupApi.positions} placeholder="All positions" />
            </div>
            <div className="flex items-end gap-2">
              <ReportExportActions reportKey={exportReportKey} filters={activeFilters as Record<string, unknown>} />
              <Button variant="ghost" asChild>
                <Link to="/attendance">Attendance <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(value) => { setTab(value); updateFilters({ page: 1 }); }}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="employee">Employee Detail</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="device-punches">Device Punches</TabsTrigger>
          </TabsList>
          <TabsContent value="daily">
            <DataTable columns={dailyColumns} rows={dailyQuery.data?.data ?? []} getRowId={(row) => row.id} loading={dailyQuery.isLoading} compact pagination={dailyQuery.data?.pagination} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} emptyTitle="No daily attendance rows" rowActions={(row) => <RowActions actions={[
              { key: "view", label: "View detail", onSelect: () => goTo(`/attendance/reports?tab=employee&employee_id=${row.employee_id ?? ""}&from_date=${row.attendance_date ?? filters.from_date ?? ""}&to_date=${row.attendance_date ?? filters.to_date ?? ""}`) },
              { key: "more", label: "View source punches", disabled: !row.device_name && !row.source_summary, onSelect: () => goTo(`/attendance/reports?tab=device-punches&employee_id=${row.employee_id ?? ""}&from_date=${row.attendance_date ?? filters.from_date ?? ""}&to_date=${row.attendance_date ?? filters.to_date ?? ""}`) },
              { key: "edit", label: "View correction history", disabled: !row.manual_correction, onSelect: () => goTo(`/attendance/corrections?employee_id=${row.employee_id ?? ""}&date_from=${row.attendance_date ?? ""}&date_to=${row.attendance_date ?? ""}`) },
            ]} />} />
          </TabsContent>
          <TabsContent value="monthly">
            <DataTable columns={monthlyColumns} rows={monthlyQuery.data?.data ?? []} getRowId={(row) => row.employee_id ?? row.id} loading={monthlyQuery.isLoading} compact pagination={monthlyQuery.data?.pagination} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} emptyTitle="No monthly attendance rows" />
          </TabsContent>
          <TabsContent value="employee">
            {!filters.employee_id ? <InlineAlert title="Choose an employee to load the detail report." /> : null}
            <DataTable columns={dailyColumns} rows={employeeQuery.data?.data ?? []} getRowId={(row) => row.id} loading={employeeQuery.isLoading} compact pagination={employeeQuery.data?.pagination} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} emptyTitle="No employee attendance rows" rowActions={(row) => <RowActions actions={[
              { key: "more", label: "View source punches", disabled: !row.device_name && !row.source_summary, onSelect: () => goTo(`/attendance/reports?tab=device-punches&employee_id=${row.employee_id ?? ""}&from_date=${row.attendance_date ?? filters.from_date ?? ""}&to_date=${row.attendance_date ?? filters.to_date ?? ""}`) },
              { key: "edit", label: "View correction history", disabled: !row.manual_correction, onSelect: () => goTo(`/attendance/corrections?employee_id=${row.employee_id ?? ""}&date_from=${row.attendance_date ?? ""}&date_to=${row.attendance_date ?? ""}`) },
            ]} />} />
            {filters.employee_id ? (
              <div className="mt-4">
                <h2 className="mb-2 text-sm font-semibold">Source event details</h2>
                <DataTable
                  columns={employeeEventColumns}
                  rows={employeeEvents}
                  getRowId={(row) => row.id}
                  loading={employeeQuery.isLoading}
                  compact
                  emptyTitle="No source events for this range"
                  emptyDescription="Attendance summary rows can exist without raw source punches, for example approved leave, holiday, or status-only corrections."
                />
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="exceptions">
            <DataTable columns={exceptionColumns} rows={exceptionsQuery.data?.data ?? []} getRowId={(row) => row.id} loading={exceptionsQuery.isLoading} compact pagination={exceptionsQuery.data?.pagination} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} emptyTitle="No attendance exceptions" rowActions={(row) => <RowActions actions={[
              row.source_type === "biometric_attendance_log"
                ? { key: "view", label: "Review staged punch", onSelect: () => goTo("/biometric?tab=unmatched") }
                : { key: "view", label: "Open attendance conflicts", onSelect: () => goTo("/attendance?tab=conflicts") },
            ]} />} />
          </TabsContent>
          <TabsContent value="device-punches">
            {auth.hasAnyPermission(["attendance.device_punches.view", "attendance.reports.view"]) ? (
              <DataTable columns={punchColumns} rows={punchesQuery.data?.data ?? []} getRowId={(row) => row.id} loading={punchesQuery.isLoading} compact pagination={punchesQuery.data?.pagination} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} emptyTitle="No device punches found" rowActions={(row) => <RowActions actions={[
                { key: "view", label: "View attendance event", disabled: !row.attendance_event_id, onSelect: () => goTo(`/attendance?tab=events&event_id=${row.attendance_event_id ?? ""}`) },
                { key: "more", label: "Review staged punch", disabled: !["unmatched_employee", "ambiguous_employee", "rejected", "manually_resolved", "invalid_timestamp"].includes(row.status ?? ""), onSelect: () => goTo("/biometric?tab=unmatched") },
              ]} />} />
            ) : <InlineAlert title="Device punch reports are not available for your role." />}
          </TabsContent>
        </Tabs>
        {activeQuery.data?.generated_at ? <p className="text-xs text-muted-foreground">Generated at {formatDateTime(activeQuery.data.generated_at)}. Report data is export-ready JSON; final export files come later.</p> : null}
      </div>
    </div>
  );
};
