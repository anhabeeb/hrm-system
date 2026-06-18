import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageActionBar } from "@/components/layout/PageActionBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { usePayrollSubFeatures } from "@/features/payroll/usePayrollSubFeatures";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { salaryLoansApi } from "./salary-loans.api";
import { SalaryLoanActionDialog } from "./SalaryLoanActionDialog";
import { SalaryLoanDetailDrawer } from "./SalaryLoanDetailDrawer";
import { SalaryLoanFilters } from "./SalaryLoanFilters";
import { SalaryLoanForm } from "./SalaryLoanForm";
import { SalaryLoansTable } from "./SalaryLoansTable";
import type { SalaryLoan, SalaryLoanFilters as SalaryLoanFilterValues, SalaryLoanPayload } from "./salary-loans.types";

export const SalaryLoansPage = () => {
  const auth = useAuth();
  const payrollSubFeatures = usePayrollSubFeatures();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<SalaryLoan | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [action, setAction] = useState<"approve" | "pause" | "settle" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const filters = useMemo<SalaryLoanFilterValues>(() => ({
    outlet_id: searchParams.get("outlet_id") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    status: searchParams.get("status") || undefined,
    start_month: searchParams.get("start_month") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<SalaryLoanFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };
  const listQuery = useQuery({ queryKey: ["salary-loans", filters], queryFn: () => salaryLoansApi.list(filters), enabled: payrollSubFeatures.salaryLoansEnabled });
  const installmentsQuery = useQuery({ queryKey: ["salary-loans", "installments", selected?.id], queryFn: () => salaryLoansApi.installments(selected!.id), enabled: payrollSubFeatures.salaryLoansEnabled && Boolean(selected?.id) });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["salary-loans"] });
  const createMutation = useMutation({ mutationFn: salaryLoansApi.create, onSuccess: async () => { setSuccessMessage("Salary loan created successfully."); setFormOpen(false); await refresh(); } });
  const actionMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }: { reason: string }) => {
      if (action === "approve") return salaryLoansApi.approve(selected!.id, reason);
      if (action === "pause") return salaryLoansApi.pause(selected!.id, reason);
      return salaryLoansApi.settle(selected!.id, reason);
    },
    onSuccess: async () => {
      setSuccessMessage(action === "approve" ? "Salary loan approved." : action === "pause" ? "Salary loan paused." : "Salary loan settled.");
      setAction(null);
      await refresh();
    },
  });
  const error = listQuery.error ?? createMutation.error ?? actionMutation.error;
  return (
    <div>
      {payrollSubFeatures.salaryLoansEnabled && auth.hasPermission("salary_loans.create") ? <PageActionBar label="Salary loans page actions"><Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />New loan</Button></PageActionBar> : null}
      <div className="space-y-4 p-4 md:p-6">
        {!payrollSubFeatures.salaryLoansEnabled ? <InlineAlert title="Salary Loans are disabled. Loan creation, approval, pause, and settlement actions are hidden." /> : null}
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Salary loan action could not be completed.", "payroll")} variant="error" /> : null}
        <SalaryLoanFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
        <SalaryLoansTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canApprove={payrollSubFeatures.salaryLoansEnabled && auth.hasPermission("salary_loans.approve")} canPause={payrollSubFeatures.salaryLoansEnabled && auth.hasPermission("salary_loans.pause")} canSettle={payrollSubFeatures.salaryLoansEnabled && auth.hasPermission("salary_loans.settle")} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onApprove={(row) => { setSelected(row); setAction("approve"); }} onPause={(row) => { setSelected(row); setAction("pause"); }} onSettle={(row) => { setSelected(row); setAction("settle"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
      </div>
      <SalaryLoanForm open={formOpen} loading={createMutation.isPending} error={createMutation.error ? friendlyHrmError(createMutation.error, "Salary loan could not be created.", "payroll") : null} onOpenChange={setFormOpen} onSubmit={(payload: SalaryLoanPayload) => createMutation.mutate(payload)} />
      <SalaryLoanDetailDrawer loan={selected} installments={installmentsQuery.data?.data.installments ?? []} installmentsLoading={installmentsQuery.isLoading} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <SalaryLoanActionDialog open={Boolean(action)} action={action ?? "approve"} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Salary loan action could not be completed.", "payroll") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => actionMutation.mutate({ reason })} />
    </div>
  );
};
