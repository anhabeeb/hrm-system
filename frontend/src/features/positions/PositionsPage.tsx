import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { FilterBar } from "@/components/data/FilterBar";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { useToast } from "@/components/feedback/useToast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth.store";
import { departmentsApi } from "@/features/departments/departments.api";
import { rolesApi } from "@/features/roles/roles.api";
import { ApiError } from "@/lib/api-errors";
import { searchParamNumber } from "@/lib/query-string";
import { displayMoney } from "@/features/employees/employee-format";
import { PositionDetailDrawer } from "./PositionDetailDrawer";
import { PositionForm } from "./PositionForm";
import { positionsApi } from "./positions.api";
import type { Position } from "./positions.types";
import type { PositionFormValues } from "./positions.schema";

const saveError = () => new ApiError("The record could not be saved. Please review the form and try again.", { code: "SAVE_FAILED", status: 0 });

export const PositionsPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Position | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const filters = useMemo(() => ({
    search: searchParams.get("search") || undefined,
    department_id: searchParams.get("department_id") || undefined,
    level: searchParamNumber(searchParams, "level", 0) || undefined,
    status: searchParams.get("status") as Position["status"] | undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const query = useQuery({ queryKey: ["positions", filters], queryFn: () => positionsApi.list(filters) });
  const departmentsQuery = useQuery({ queryKey: ["departments", "options"], queryFn: () => departmentsApi.list({ page_size: 100 }) });
  const rolesQuery = useQuery({ queryKey: ["roles", "position-defaults"], queryFn: () => rolesApi.list({ page_size: 100 }) });
  const mutation = useMutation<unknown, unknown, { id?: string; values: PositionFormValues }>({
    mutationFn: ({ id, values }: { id?: string; values: PositionFormValues }) => id ? positionsApi.update(id, values) : positionsApi.create(values),
    onSuccess: async (_, variables) => {
      toast.success(variables.id ? "Position updated successfully." : "Position created successfully.");
      setError(null);
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
    onError: (nextError) => {
      const apiError = nextError instanceof ApiError ? nextError : saveError();
      setError(apiError);
      toast.error("Position could not be saved.", apiError.message);
    },
  });
  const setFilterValues = (values: { search?: string; department_id?: string; level?: number; status?: string; page?: number; page_size?: number }) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    if (!("page" in values)) next.set("page", "1");
    setSearchParams(next);
  };

  const canCreate = auth.hasAnyPermission(["organization.positions.manage", "positions.create"]);
  const canEdit = auth.hasAnyPermission(["organization.positions.manage", "positions.edit"]);

  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {query.isError ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Positions could not be loaded. Please try again.</div> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canCreate ? <Button onClick={() => { setSelected(null); setError(null); setFormOpen(true); }}><BadgeCheck className="h-4 w-4" /> Create Position</Button> : null}
        </div>
        <FilterBar search={filters.search} searchPlaceholder="Search positions" onSearchChange={(search) => setFilterValues({ search: search || undefined, department_id: filters.department_id, level: filters.level, status: filters.status })} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} onApply={() => undefined}>
          <Select value={filters.department_id ?? "all"} onValueChange={(value) => setFilterValues({ department_id: value === "all" ? undefined : value, search: filters.search, level: filters.level, status: filters.status })}><SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{(departmentsQuery.data?.data ?? []).map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent></Select>
          <Select value={filters.level ? String(filters.level) : "all"} onValueChange={(value) => setFilterValues({ level: value === "all" ? undefined : Number(value), search: filters.search, department_id: filters.department_id, status: filters.status })}><SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger><SelectContent><SelectItem value="all">All levels</SelectItem><SelectItem value="1">Level 1</SelectItem><SelectItem value="2">Level 2</SelectItem><SelectItem value="3">Level 3</SelectItem><SelectItem value="4">Level 4</SelectItem></SelectContent></Select>
          <Select value={filters.status ?? "all"} onValueChange={(value) => setFilterValues({ status: value === "all" ? undefined : value, search: filters.search, department_id: filters.department_id, level: filters.level })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select>
        </FilterBar>
        <DataTable
          compact
          loading={query.isLoading}
          rows={query.data?.data ?? []}
          pagination={query.data?.pagination}
          onPageChange={(page) => setFilterValues({ page })}
          onPageSizeChange={(page_size) => setFilterValues({ page: 1, page_size })}
          getRowId={(row) => row.id}
          onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
          emptyTitle="No positions found."
          columns={[
            { key: "title", header: "Position Name" },
            { key: "department", header: "Department", cell: (row) => row.department_name ?? row.department_id ?? "Not assigned" },
            { key: "level", header: "Level", cell: (row) => `Level ${row.level ?? 1}` },
            { key: "default_role", header: "Default role", cell: (row) => row.default_role_name ?? "Manual assignment" },
            { key: "default_salary_amount", header: "Default Salary", cell: (row) => displayMoney(row.default_salary_amount) },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { key: "employees", header: "Employees Count", cell: () => "Available in reports" },
          ]}
          rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, ...(canEdit ? [{ key: "edit" as const, onSelect: () => { setSelected(row); setError(null); setFormOpen(true); } }] : [])]} />}
        />
        <PositionDetailDrawer position={selected} open={drawerOpen} canEdit={canEdit} onOpenChange={setDrawerOpen} onEdit={(row) => { setSelected(row); setFormOpen(true); }} />
        <PositionForm open={formOpen} position={selected} departments={departmentsQuery.data?.data ?? []} roles={rolesQuery.data?.data ?? []} error={error} loading={mutation.isPending} onOpenChange={setFormOpen} onSubmit={(values) => mutation.mutate({ id: selected?.id, values })} />
      </div>
    </div>
  );
};
