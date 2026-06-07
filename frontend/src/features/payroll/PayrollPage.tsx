import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calculator } from "lucide-react";

import { EmptyState } from "@/components/data/EmptyState";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { payrollApi } from "./payroll.api";
import { PayrollActionDialog } from "./PayrollActionDialog";
import { PayrollExceptionsTable } from "./PayrollExceptionsTable";
import { PayrollFilters } from "./PayrollFilters";
import { PayrollFlowStepper } from "./PayrollFlowStepper";
import { PayrollItemDetailDrawer } from "./PayrollItemDetailDrawer";
import { PayrollItemsTable } from "./PayrollItemsTable";
import { PayrollRunDetailDrawer } from "./PayrollRunDetailDrawer";
import { PayrollRunForm } from "./PayrollRunForm";
import { PayrollRunsTable } from "./PayrollRunsTable";
import type { PayrollCalculatePayload, PayrollException, PayrollFilters as PayrollFilterValues, PayrollItem, PayrollRun } from "./payroll.types";

type PayrollAction = "recalculate" | "submit" | "approve" | "reject" | "finalize" | "resolveException" | null;

export const PayrollPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") ?? "runs");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [selectedItem, setSelectedItem] = useState<PayrollItem | null>(null);
  const [selectedException, setSelectedException] = useState<PayrollException | null>(null);
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [action, setAction] = useState<PayrollAction>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filters = useMemo<PayrollFilterValues>(() => ({
    payroll_month: searchParams.get("payroll_month") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    status: searchParams.get("status") || undefined,
    severity: searchParams.get("severity") || undefined,
    exception_type: searchParams.get("exception_type") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<PayrollFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    params.set("tab", tab);
    setSearchParams(params);
  };
  const setActiveTab = (value: string) => {
    setTab(value);
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    params.set("page", "1");
    setSearchParams(params);
  };

  const runsQuery = useQuery({ queryKey: ["payroll", "runs", filters], queryFn: () => payrollApi.list(filters) });
  const itemsQuery = useQuery({ queryKey: ["payroll", "items", selectedRun?.id, filters], queryFn: () => payrollApi.listItems(selectedRun!.id, filters), enabled: Boolean(selectedRun?.id) });
  const exceptionsQuery = useQuery({ queryKey: ["payroll", "exceptions", selectedRun?.id, filters], queryFn: () => payrollApi.listExceptions(selectedRun!.id, filters), enabled: Boolean(selectedRun?.id) });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ["payroll"] });

  const calculateMutation = useMutation({
    mutationFn: payrollApi.calculate,
    onSuccess: async () => { setSuccessMessage("Payroll calculated successfully."); setFormOpen(false); await refresh(); },
  });
  const actionMutation = useMutation<unknown, unknown, { reason: string }>({
    mutationFn: ({ reason }: { reason: string }) => {
      if (action === "resolveException" && selectedRun && selectedException) return payrollApi.resolveException(selectedRun.id, selectedException.id, reason);
      if (!selectedRun) throw new Error("Select a payroll run first.");
      if (action === "recalculate") return payrollApi.recalculate(selectedRun.id, reason);
      if (action === "submit") return payrollApi.submitApproval(selectedRun.id, reason);
      if (action === "approve") return payrollApi.approve(selectedRun.id, reason);
      if (action === "reject") return payrollApi.reject(selectedRun.id, reason);
      if (action === "finalize") return payrollApi.finalize(selectedRun.id, reason);
      throw new Error("Select a payroll action first.");
    },
    onSuccess: async () => {
      const messages: Record<Exclude<PayrollAction, null>, string> = {
        recalculate: "Payroll recalculated successfully.",
        submit: "Payroll submitted for approval.",
        approve: "Payroll approved.",
        reject: "Payroll rejected.",
        finalize: "Payroll finalized successfully.",
        resolveException: "Payroll exception resolved.",
      };
      setSuccessMessage(action ? messages[action] : "Payroll action completed successfully.");
      setAction(null);
      setSelectedException(null);
      await refresh();
    },
  });

  const error = runsQuery.error ?? itemsQuery.error ?? exceptionsQuery.error ?? calculateMutation.error ?? actionMutation.error;
  const hasPayrollPermission = (permission: string) => auth.isSuperAdmin || auth.hasPermission(permission);
  const canCalculate = hasPayrollPermission("payroll.calculate");
  const canRecalculate = hasPayrollPermission("payroll.recalculate");
  const canSubmitForApproval = hasPayrollPermission("payroll.review");
  const canApprove = hasPayrollPermission("payroll.approve");
  const canReject = hasPayrollPermission("payroll.reject");
  const canFinalize = hasPayrollPermission("payroll.finalize");
  const canResolve = auth.hasPermission("payroll.resolve_exceptions");

  const actionCopy = {
    recalculate: ["Recalculate payroll", "Recalculate this draft payroll run using current attendance, leave, and deduction data.", "Recalculate"],
    submit: ["Submit payroll for approval", "Submit this company-wide payroll run for approval.", "Submit"],
    approve: ["Approve payroll", "Approve this payroll run after review.", "Approve"],
    reject: ["Reject payroll", "Reject this payroll run and send it back for correction.", "Reject"],
    finalize: ["Finalize payroll", "Finalize this payroll run, apply approved repayment deductions, create payslip snapshots, and prevent further payroll-impacting edits.", "Finalize payroll"],
    resolveException: ["Resolve payroll exception", "Record the resolution notes for this payroll exception.", "Resolve"],
  } as const;
  const selectedActionCopy = action ? actionCopy[action] : ["Payroll action", "A reason is required.", "Continue"];

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Calculate draft payroll, review exceptions, approve, finalize, and safely protect company-wide runs."
        actions={canCalculate ? <Button onClick={() => setFormOpen(true)}><Calculator className="h-4 w-4" />Calculate draft</Button> : null}
      />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Payroll action could not be completed.", "payroll")} variant="error" /> : null}
        <PayrollFlowStepper status={selectedRun?.status} />
        <PayrollFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size), tab }))} />
        <Tabs value={tab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="runs">Runs</TabsTrigger><TabsTrigger value="items">Items</TabsTrigger><TabsTrigger value="exceptions">Exceptions</TabsTrigger></TabsList>
          <TabsContent value="runs">
            <PayrollRunsTable
              rows={runsQuery.data?.data ?? []}
              loading={runsQuery.isLoading}
              pagination={runsQuery.data?.pagination}
              onView={(row) => { setSelectedRun(row); setRunDrawerOpen(true); }}
              onRecalculate={(row) => { setSelectedRun(row); setAction("recalculate"); }}
              onSubmit={(row) => { setSelectedRun(row); setAction("submit"); }}
              onApprove={(row) => { setSelectedRun(row); setAction("approve"); }}
              onReject={(row) => { setSelectedRun(row); setAction("reject"); }}
              onFinalize={(row) => { setSelectedRun(row); setAction("finalize"); }}
              canRecalculate={canRecalculate}
              canSubmit={canSubmitForApproval}
              canApprove={canApprove}
              canReject={canReject}
              canFinalize={canFinalize}
              onPageChange={(page) => updateFilters({ page })}
              onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })}
            />
          </TabsContent>
          <TabsContent value="items">
            {selectedRun ? <PayrollItemsTable rows={itemsQuery.data?.data ?? []} loading={itemsQuery.isLoading} pagination={itemsQuery.data?.pagination} onView={(row) => { setSelectedItem(row); setItemDrawerOpen(true); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /> : <EmptyState title="Select a payroll run" description="Open a payroll run first to review outlet-filtered employee payroll rows." />}
          </TabsContent>
          <TabsContent value="exceptions">
            {selectedRun ? <PayrollExceptionsTable rows={exceptionsQuery.data?.data ?? []} loading={exceptionsQuery.isLoading} pagination={exceptionsQuery.data?.pagination} canResolve={canResolve} onResolve={(row) => { setSelectedException(row); setAction("resolveException"); }} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} /> : <EmptyState title="Select a payroll run" description="Open a payroll run first to review exceptions and blockers." />}
          </TabsContent>
        </Tabs>
      </div>
      <PayrollRunForm open={formOpen} loading={calculateMutation.isPending} error={calculateMutation.error ? friendlyHrmError(calculateMutation.error, "Payroll calculation could not be started.", "payroll") : null} onOpenChange={setFormOpen} onSubmit={(payload: PayrollCalculatePayload) => calculateMutation.mutate(payload)} />
      <PayrollRunDetailDrawer run={selectedRun} open={runDrawerOpen} onOpenChange={setRunDrawerOpen} />
      <PayrollItemDetailDrawer item={selectedItem} open={itemDrawerOpen} onOpenChange={setItemDrawerOpen} />
      <PayrollActionDialog open={Boolean(action)} title={selectedActionCopy[0]} description={selectedActionCopy[1]} confirmLabel={selectedActionCopy[2]} loading={actionMutation.isPending} error={actionMutation.error ? friendlyHrmError(actionMutation.error, "Payroll action could not be completed.", "payroll") : null} onOpenChange={(open) => !open && setAction(null)} onSubmit={(reason) => actionMutation.mutate({ reason })} />
    </div>
  );
};
