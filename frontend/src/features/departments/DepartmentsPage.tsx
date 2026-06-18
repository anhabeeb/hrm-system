import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BriefcaseBusiness } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { FilterBar } from "@/components/data/FilterBar";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { useToast } from "@/components/feedback/useToast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { searchParamNumber } from "@/lib/query-string";
import { DepartmentDetailDrawer } from "./DepartmentDetailDrawer";
import { DepartmentForm } from "./DepartmentForm";
import { departmentsApi } from "./departments.api";
import type { Department } from "./departments.types";
import type { DepartmentFormValues } from "./departments.schema";

const saveError = () => new ApiError("The record could not be saved. Please review the form and try again.", { code: "SAVE_FAILED", status: 0 });

export const DepartmentsPage = () => {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Department | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const filters = useMemo(() => ({ search: searchParams.get("search") || undefined, status: searchParams.get("status") as Department["status"] | undefined, page: searchParamNumber(searchParams, "page", 1), page_size: searchParamNumber(searchParams, "page_size", 25) }), [searchParams]);
  const query = useQuery({ queryKey: ["departments", filters], queryFn: () => departmentsApi.list(filters) });
  const mutation = useMutation<unknown, unknown, { id?: string; values: DepartmentFormValues }>({
    mutationFn: ({ id, values }: { id?: string; values: DepartmentFormValues }) => id ? departmentsApi.update(id, values) : departmentsApi.create(values),
    onSuccess: async (_, variables) => {
      toast.success(variables.id ? "Department updated successfully." : "Department created successfully.");
      setError(null);
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (nextError) => {
      const apiError = nextError instanceof ApiError ? nextError : saveError();
      setError(apiError);
      toast.error("Department could not be saved.", apiError.message);
    },
  });
  const setFilterValues = (values: { search?: string; status?: string; page?: number; page_size?: number }) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    if (!("page" in values)) next.set("page", "1");
    setSearchParams(next);
  };
  const canCreate = auth.hasAnyPermission(["organization.departments.manage", "departments.create"]);
  const canEdit = auth.hasAnyPermission(["organization.departments.manage", "departments.edit"]);
  return (
    <div>
      <div className="space-y-4 p-4 md:p-6">
        {query.isError ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Departments could not be loaded. Please try again.</div> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canCreate ? <Button data-setup-target="department-create-button" onClick={() => { setSelected(null); setError(null); setFormOpen(true); }}><BriefcaseBusiness className="h-4 w-4" /> Create Department</Button> : null}
        </div>
        <FilterBar search={filters.search} searchPlaceholder="Search departments" onSearchChange={(search) => setFilterValues({ search: search || undefined, status: filters.status })} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} onApply={() => undefined}>
          <Select value={filters.status ?? "all"} onValueChange={(value) => setFilterValues({ status: value === "all" ? undefined : value, search: filters.search })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select>
        </FilterBar>
        <div data-setup-target="departments-list">
          <DataTable compact loading={query.isLoading} rows={query.data?.data ?? []} pagination={query.data?.pagination} onPageChange={(page) => setFilterValues({ page })} onPageSizeChange={(page_size) => setFilterValues({ page: 1, page_size })} getRowId={(row) => row.id} onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }} emptyTitle="No departments found." columns={[
            { key: "name", header: "Department Name" },
            { key: "code", header: "Code", cell: (row) => row.code ?? "Not set" },
            { key: "head", header: "Head employee", cell: (row) => row.head_employee_name ?? "Not assigned" },
            { key: "min_level", header: "Min level", cell: (row) => `Level ${row.day_to_day_management_min_level ?? 3}` },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { key: "employees", header: "Employees", cell: (row) => row.employee_count ?? 0 },
            { key: "positions", header: "Positions", cell: (row) => row.position_count ?? 0 },
          ]} rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, ...(canEdit ? [{ key: "edit" as const, onSelect: () => { setSelected(row); setError(null); setFormOpen(true); } }] : [])]} />} />
        </div>
        <DepartmentDetailDrawer department={selected} open={drawerOpen} canEdit={canEdit} onOpenChange={setDrawerOpen} onEdit={(row) => { setSelected(row); setFormOpen(true); }} />
        <DepartmentForm open={formOpen} department={selected} error={error} loading={mutation.isPending} onOpenChange={setFormOpen} onSubmit={(values) => mutation.mutate({ id: selected?.id, values })} />
      </div>
    </div>
  );
};
