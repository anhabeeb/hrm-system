import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { LongLeaveActionDialog } from "./LongLeaveActionDialog";
import { longLeaveApi } from "./long-leave.api";
import { LongLeaveDetailDrawer } from "./LongLeaveDetailDrawer";
import { LongLeaveFilters } from "./LongLeaveFilters";
import { LongLeaveForm } from "./LongLeaveForm";
import { LongLeaveTable } from "./LongLeaveTable";
import { ReturnFromLongLeaveDialog } from "./ReturnFromLongLeaveDialog";
import type { LongLeaveFilters as LongLeaveFilterValues, LongLeavePayload, LongLeaveRecord } from "./long-leave.types";

type LongLeaveAction = "approve" | "reject" | "confirm" | "calculate" | null;

export const LongLeavePage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [selected, setSelected] = useState<LongLeaveRecord | null>(null);
  const [action, setAction] = useState<LongLeaveAction>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<LongLeaveFilterValues>(() => ({
    search: searchParams.get("search") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    status: searchParams.get("status") || undefined,
    date_from: searchParams.get("date_from") || undefined,
    date_to: searchParams.get("date_to") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);

  const updateFilters = (next: Partial<LongLeaveFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };

  const listQuery = useQuery({ queryKey: ["long-leave", "list", filters], queryFn: () => longLeaveApi.list(filters) });
  const impactQuery = useQuery({
    queryKey: ["long-leave", "impact", selected?.id],
    queryFn: () => longLeaveApi.salaryImpact(selected!.id),
    enabled: Boolean(selected?.id),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["long-leave"] });

  const createMutation = useMutation({
    mutationFn: longLeaveApi.create,
    onSuccess: async (response) => {
      setSuccessMessage(response.data.salary_impact_calculated ? "Long leave request created successfully. Salary impact preview was calculated." : "Long leave request created successfully. Salary impact review is required.");
      setFormOpen(false);
      await refresh();
    },
  });
  const actionMutation = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      if (!selected) throw new Error("Select a long leave record first.");
      if (action === "approve") return longLeaveApi.approve(selected.id, reason);
      if (action === "reject") return longLeaveApi.reject(selected.id, reason);
      if (action === "confirm") return longLeaveApi.confirmSalaryImpact(selected.id, reason);
      return longLeaveApi.calculateSalaryImpact(selected.id);
    },
    onSuccess: async () => {
      setSuccessMessage(action === "approve" ? "Long leave approved." : action === "reject" ? "Long leave rejected." : action === "confirm" ? "Long leave salary impact confirmed." : "Long leave salary impact calculated successfully.");
      setAction(null);
      await refresh();
    },
  });
  const returnMutation = useMutation({
    mutationFn: ({ actualReturnDate, reason }: { actualReturnDate: string; reason: string }) => longLeaveApi.returnFromLeave(selected!.id, actualReturnDate, reason),
    onSuccess: async () => { setSuccessMessage("Long leave return confirmed."); setReturnOpen(false); await refresh(); },
  });

  const canCreate = auth.hasPermission("long_leave.create");
  const canApprove = auth.hasPermission("long_leave.approve");
  const canReject = auth.hasPermission("long_leave.reject");
  const canReturn = auth.hasPermission("long_leave.return_confirm");
  const canConfirm = auth.hasPermission("long_leave.confirm_salary_impact");
  const error = listQuery.error ?? createMutation.error ?? actionMutation.error ?? returnMutation.error;

  return (
    <div>
      <PageHeader
        title="Long Leave"
        description="Review long leave records, month-by-month salary impact, and return-to-work confirmations."
        actions={canCreate ? <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />New long leave</Button> : null}
      />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Long leave action could not be completed.", "long_leave")} variant="error" /> : null}
        <LongLeaveFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
        <LongLeaveTable
          rows={listQuery.data?.data ?? []}
          loading={listQuery.isLoading}
          pagination={listQuery.data?.pagination}
          canApprove={canApprove}
          canReject={canReject}
          canReturn={canReturn}
          canConfirm={canConfirm}
          onView={(row) => { setSelected(row); setDrawerOpen(true); }}
          onApprove={(row) => { setSelected(row); setAction("approve"); }}
          onReject={(row) => { setSelected(row); setAction("reject"); }}
          onReturn={(row) => { setSelected(row); setReturnOpen(true); }}
          onConfirm={(row) => { setSelected(row); setAction("confirm"); }}
          onPageChange={(page) => updateFilters({ page })}
          onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
        />
      </div>
      <LongLeaveForm open={formOpen} loading={createMutation.isPending} error={createMutation.error ? friendlyHrmError(createMutation.error, "Long leave request could not be created.", "long_leave") : null} onOpenChange={setFormOpen} onSubmit={(payload: LongLeavePayload) => createMutation.mutate(payload)} />
      <LongLeaveDetailDrawer record={selected} impactRows={impactQuery.data?.data.months ?? []} impactLoading={impactQuery.isLoading} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <LongLeaveActionDialog open={Boolean(action)} title={action === "approve" ? "Approve long leave" : action === "reject" ? "Reject long leave" : "Confirm salary impact"} description="A reason is required for this long leave action." confirmLabel={action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Confirm"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Long leave action could not be completed.", "long_leave") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => actionMutation.mutate({ reason })} />
      <ReturnFromLongLeaveDialog open={returnOpen} loading={returnMutation.isPending} error={returnMutation.error ? friendlyHrmError(returnMutation.error, "Long leave return could not be confirmed.", "long_leave") : null} onOpenChange={setReturnOpen} onSubmit={(actualReturnDate, reason) => returnMutation.mutate({ actualReturnDate, reason })} />
    </div>
  );
};
