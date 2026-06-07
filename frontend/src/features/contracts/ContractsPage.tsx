import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { DepartmentCombobox, EmployeeCombobox, OutletCombobox, PositionCombobox } from "@/components/selectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayDate } from "@/features/employees/employee-format";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { ContractDocumentAction } from "./ContractDocumentAction";
import { contractStatusBadge, expiryText, label } from "./contract-format";
import { contractsApi } from "./contracts.api";
import type { ContractFilters, EmployeeContract } from "./contracts.types";

export const ContractsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo<ContractFilters>(() => ({
    contract_status: searchParams.get("contract_status") || undefined,
    contract_type: searchParams.get("contract_type") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    position_id: searchParams.get("position_id") || undefined,
    search: searchParams.get("search") || undefined,
    expiring_within_days: searchParamNumber(searchParams, "expiring_within_days", 0) || undefined,
    expired: searchParams.get("expired") === "true" ? true : undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<ContractFilters>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" || value === false ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };
  const query = useQuery({ queryKey: ["contracts", filters], queryFn: () => contractsApi.list(filters) });

  return (
    <div>
      <PageHeader title="Employee Contracts" description="Track active, expiring, expired, renewed, and archived employment contracts." />
      <div className="space-y-4 p-4 md:p-6">
        {query.error ? <InlineAlert variant="error" title={friendlyHrmError(query.error, "Contracts could not be loaded.")} /> : null}
        <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4">
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Search<Input placeholder="Search employee or contract" value={filters.search ?? ""} onChange={(event) => updateFilters({ search: event.target.value || undefined })} /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">
            Status
            <Select value={filters.contract_status ?? "all"} onValueChange={(value) => updateFilters({ contract_status: value === "all" ? undefined : value, expired: undefined })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["draft", "active", "expiring_soon", "expired", "renewed", "archived", "cancelled"].map((status) => <SelectItem key={status} value={status}>{label(status)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">
            Type
            <Select value={filters.contract_type ?? "all"} onValueChange={(value) => updateFilters({ contract_type: value === "all" ? undefined : value })}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {["permanent", "fixed_term", "probation", "temporary", "part_time", "casual", "foreign_worker_contract", "other"].map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">
            Expiry window
            <Select value={String(filters.expiring_within_days ?? "all")} onValueChange={(value) => updateFilters({ expiring_within_days: value === "all" ? undefined : Number(value), expired: undefined })}>
              <SelectTrigger><SelectValue placeholder="Expiry window" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any expiry</SelectItem>
                <SelectItem value="30">Expiring in 30 days</SelectItem>
                <SelectItem value="60">Expiring in 60 days</SelectItem>
                <SelectItem value="90">Expiring in 90 days</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Employee<EmployeeCombobox value={filters.employee_id} outletId={filters.outlet_id} departmentId={filters.department_id} positionId={filters.position_id} onChange={(value) => updateFilters({ employee_id: value })} placeholder="All employees" /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Outlet<OutletCombobox value={filters.outlet_id} onChange={(value) => updateFilters({ outlet_id: value, employee_id: undefined })} placeholder="All accessible outlets" /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Department<DepartmentCombobox value={filters.department_id} onChange={(value) => updateFilters({ department_id: value, employee_id: undefined, position_id: undefined })} placeholder="All departments" /></Label>
          <Label className="space-y-1 text-xs font-medium text-muted-foreground">Position<PositionCombobox value={filters.position_id} departmentId={filters.department_id} onChange={(value) => updateFilters({ position_id: value, employee_id: undefined })} placeholder="All positions" /></Label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => updateFilters({ expired: true, contract_status: undefined, expiring_within_days: undefined })}>Expired</Button>
            <Button variant="outline" onClick={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size ?? 25) }))}>Clear</Button>
          </div>
        </div>
        <DataTable<EmployeeContract>
          rows={query.data?.data ?? []}
          loading={query.isLoading}
          pagination={query.data?.pagination}
          getRowId={(row) => row.id}
          emptyTitle="No contracts found"
          emptyDescription="Try a different expiry window or status filter."
          columns={[
            { key: "employee_name", header: "Employee", cell: (row) => <div><p className="font-medium">{row.employee_name ?? row.employee_id}</p><p className="text-xs text-muted-foreground">{row.employee_code ?? row.outlet_name ?? "No outlet"}</p></div> },
            { key: "contract_number", header: "Contract", cell: (row) => <div><p className="font-medium">{row.contract_number ?? row.id}</p><p className="text-xs text-muted-foreground">Version {row.version_number}</p></div> },
            { key: "contract_type", header: "Type", cell: (row) => label(row.contract_type) },
            { key: "contract_status", header: "Status", cell: (row) => contractStatusBadge(row.contract_status) },
            { key: "start_date", header: "Start", cell: (row) => displayDate(row.start_date) },
            { key: "end_date", header: "End / expiry", cell: (row) => expiryText(row.end_date, row.days_until_expiry) },
            { key: "document_id", header: "Document", cell: (row) => <div className="space-y-1"><p>{row.document?.file_name ?? "Missing"}</p><ContractDocumentAction contract={row} compact /></div> },
          ]}
          onPageChange={(page) => updateFilters({ page })}
          onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
        />
      </div>
    </div>
  );
};
