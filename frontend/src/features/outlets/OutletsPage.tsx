import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2 } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { RowActions } from "@/components/data/RowActions";
import { StatusBadge } from "@/components/data/StatusBadge";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { ApiError } from "@/lib/api-errors";
import { searchParamNumber } from "@/lib/query-string";
import { OutletDetailDrawer } from "./OutletDetailDrawer";
import { OutletFilters } from "./OutletFilters";
import { OutletForm } from "./OutletForm";
import { outletsApi } from "./outlets.api";
import type { Outlet } from "./outlets.types";
import type { OutletFormValues } from "./outlets.schema";

const saveError = () => new ApiError("The record could not be saved. Please review the form and try again.", { code: "SAVE_FAILED", status: 0 });

export const OutletsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Outlet | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filters = useMemo(() => ({
    search: searchParams.get("search") || undefined,
    status: searchParams.get("status") as Outlet["status"] | undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const query = useQuery({ queryKey: ["outlets", filters], queryFn: () => outletsApi.list(filters) });
  const mutation = useMutation<unknown, unknown, { id?: string; values: OutletFormValues }>({
    mutationFn: ({ id, values }: { id?: string; values: OutletFormValues }) => id ? outletsApi.update(id, values) : outletsApi.create(values),
    onSuccess: async (_, variables) => {
      setSuccess(variables.id ? "Outlet updated successfully." : "Outlet created successfully.");
      setError(null);
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["outlets"] });
    },
    onError: (nextError) => setError(nextError instanceof ApiError ? nextError : saveError()),
  });

  const setFilterValues = (values: { search?: string; status?: string; page?: number; page_size?: number }) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, String(value)) : next.delete(key));
    if (!("page" in values)) next.set("page", "1");
    setSearchParams(next);
  };

  const canCreate = auth.hasPermission("outlets.create");
  const canEdit = auth.hasPermission("outlets.edit");

  return (
    <div>
      <PageHeader title="Outlets" description="Manage operational outlets used for employee access and HR workflows" />
      <div className="space-y-4 p-4 md:p-6">
        {success ? <InlineAlert title={success} variant="success" /> : null}
        {query.isError ? <InlineAlert title="Outlets could not be loaded." variant="error">Please adjust filters or try again.</InlineAlert> : null}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="text-base font-semibold">Outlet Directory</h2><p className="text-sm text-muted-foreground">Outlet-limited users only see records returned by the backend.</p></div>
          {canCreate ? <Button onClick={() => { setSelected(null); setError(null); setFormOpen(true); }}><Building2 className="h-4 w-4" /> Create Outlet</Button> : null}
        </div>
        <OutletFilters search={filters.search} status={filters.status} onChange={setFilterValues} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
        <DataTable
          compact
          loading={query.isLoading}
          rows={query.data?.data ?? []}
          pagination={query.data?.pagination}
          onPageChange={(page) => setFilterValues({ page })}
          onPageSizeChange={(page_size) => setFilterValues({ page: 1, page_size })}
          getRowId={(row) => row.id}
          onRowClick={(row) => { setSelected(row); setDrawerOpen(true); }}
          emptyTitle="No outlets found."
          columns={[
            { key: "code", header: "Outlet Code", cell: (row) => row.code ?? "Not set" },
            { key: "name", header: "Outlet Name" },
            { key: "address", header: "Location", cell: (row) => row.address ?? "Not set" },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            { key: "employees", header: "Employees", cell: () => "Available in reports" },
            { key: "devices", header: "Devices", cell: () => "Available in devices" },
          ]}
          rowActions={(row) => <RowActions actions={[{ key: "view", onSelect: () => { setSelected(row); setDrawerOpen(true); } }, ...(canEdit ? [{ key: "edit" as const, onSelect: () => { setSelected(row); setError(null); setFormOpen(true); } }] : [])]} />}
        />
        <OutletDetailDrawer outlet={selected} open={drawerOpen} canEdit={canEdit} onOpenChange={setDrawerOpen} onEdit={(row) => { setSelected(row); setFormOpen(true); }} />
        <OutletForm open={formOpen} outlet={selected} error={error} loading={mutation.isPending} onOpenChange={setFormOpen} onSubmit={(values) => mutation.mutate({ id: selected?.id, values })} />
      </div>
    </div>
  );
};
