import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { AdvanceActionDialog } from "./AdvanceActionDialog";
import { AdvanceDetailDrawer } from "./AdvanceDetailDrawer";
import { AdvanceFilters } from "./AdvanceFilters";
import { AdvanceForm } from "./AdvanceForm";
import { advancesApi } from "./advances.api";
import { AdvancesTable } from "./AdvancesTable";
import type { AdvanceFilters as AdvanceFilterValues, AdvancePayment, AdvancePayload } from "./advances.types";

export const AdvancesPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<AdvancePayment | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const filters = useMemo<AdvanceFilterValues>(() => ({
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    status: searchParams.get("status") || undefined,
    deduction_month: searchParams.get("deduction_month") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<AdvanceFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };
  const listQuery = useQuery({ queryKey: ["advances", filters], queryFn: () => advancesApi.list(filters) });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["advances"] });
  const createMutation = useMutation({ mutationFn: advancesApi.create, onSuccess: async () => { setSuccessMessage("Advance payment requested successfully."); setFormOpen(false); await refresh(); } });
  const actionMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }: { reason: string }) => action === "approve" ? advancesApi.approve(selected!.id, reason) : advancesApi.reject(selected!.id, reason),
    onSuccess: async () => { setSuccessMessage(action === "approve" ? "Advance payment approved." : "Advance payment rejected."); setAction(null); await refresh(); },
  });
  const error = listQuery.error ?? createMutation.error ?? actionMutation.error;
  return (
    <div>
      {auth.hasPermission("advances.create") ? <PageActionBar label="Advances page actions"><Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />New advance</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Advance action could not be completed.", "payroll")} variant="error" /> : null}
        <AdvanceFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
        <AdvancesTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canApprove={auth.hasPermission("advances.approve")} canReject={auth.hasPermission("advances.reject")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onApprove={(row) => { setSelected(row); setAction("approve"); }} onReject={(row) => { setSelected(row); setAction("reject"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
      </div>
      <AdvanceForm open={formOpen} loading={createMutation.isPending} error={createMutation.error ? friendlyHrmError(createMutation.error, "Advance could not be created.", "payroll") : null} onOpenChange={setFormOpen} onSubmit={(payload: AdvancePayload) => createMutation.mutate(payload)} />
      <AdvanceDetailDrawer advance={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <AdvanceActionDialog open={Boolean(action)} action={action ?? "approve"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Advance action could not be completed.", "payroll") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => actionMutation.mutate({ reason })} />
    </div>
  );
};
