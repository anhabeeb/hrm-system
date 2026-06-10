import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { displayDate } from "@/features/employees/employee-format";
import { offboardingApi } from "./offboarding.api";
import type { OffboardingCase, OffboardingFilters } from "./offboarding.types";

const label = (value?: string | null) => value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "All";

export const OffboardingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo<OffboardingFilters>(() => ({
    status: searchParams.get("status") || undefined,
    offboarding_type: searchParams.get("offboarding_type") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<OffboardingFilters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };
  const listQuery = useQuery({ queryKey: ["offboarding-cases", filters], queryFn: () => offboardingApi.list(filters) });

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {listQuery.error ? <InlineAlert variant="error" title={friendlyHrmError(listQuery.error, "Offboarding cases could not be loaded.")} /> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
          <Select value={filters.status ?? "all"} onValueChange={(value) => updateFilters({ status: value === "all" ? undefined : value })}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft", "in_progress", "pending_clearance", "ready_for_final_settlement", "completed", "cancelled"].map((status) => <SelectItem key={status} value={status}>{label(status)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.offboarding_type ?? "all"} onValueChange={(value) => updateFilters({ offboarding_type: value === "all" ? undefined : value })}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {["resignation", "termination", "retirement", "contract_end", "other"].map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.date_from ?? ""} onChange={(event) => updateFilters({ date_from: event.target.value || undefined })} />
          <Input type="date" value={filters.date_to ?? ""} onChange={(event) => updateFilters({ date_to: event.target.value || undefined })} />
          <Input placeholder="Employee ID" value={filters.employee_id ?? ""} onChange={(event) => updateFilters({ employee_id: event.target.value || undefined })} />
          <Input placeholder="Outlet ID" value={filters.outlet_id ?? ""} onChange={(event) => updateFilters({ outlet_id: event.target.value || undefined })} />
          <Input placeholder="Department ID" value={filters.department_id ?? ""} onChange={(event) => updateFilters({ department_id: event.target.value || undefined })} />
          <Button variant="outline" onClick={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size ?? 25) }))}>Clear filters</Button>
        </div>
        <DataTable<OffboardingCase>
          rows={listQuery.data?.data ?? []}
          loading={listQuery.isLoading}
          pagination={listQuery.data?.pagination}
          getRowId={(row) => row.id}
          emptyTitle="No offboarding cases"
          emptyDescription="Start offboarding from an employee profile to generate clearance tasks."
          columns={[
            { key: "employee_name", header: "Employee", cell: (row) => <div><p className="font-medium">{row.employee_name ?? row.employee_id}</p><p className="text-xs text-muted-foreground">{row.employee_code ?? row.outlet_name ?? "No outlet"}</p></div> },
            { key: "offboarding_type", header: "Type", cell: (row) => label(row.offboarding_type) },
            { key: "effective_exit_date", header: "Exit date", cell: (row) => displayDate(row.effective_exit_date) },
            { key: "status", header: "Status", cell: (row) => label(row.status) },
            { key: "task_total", header: "Checklist", cell: (row) => `${row.task_completed ?? 0}/${row.task_total ?? 0} cleared` },
            { key: "final_settlement_status", header: "Settlement", cell: (row) => label(row.final_settlement_status) },
            { key: "initiated_at", header: "Started", cell: (row) => displayDate(row.initiated_at) },
          ]}
          onPageChange={(page) => updateFilters({ page })}
          onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
        />
      </div>
    </div>
  );
};
