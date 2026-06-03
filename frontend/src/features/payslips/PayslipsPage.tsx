import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText } from "lucide-react";

import { InlineAlert } from "@/components/feedback/InlineAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth.store";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { searchParamNumber } from "@/lib/query-string";
import { GeneratePayslipsDialog } from "./GeneratePayslipsDialog";
import { PayslipDetailDrawer } from "./PayslipDetailDrawer";
import { PayslipFilters } from "./PayslipFilters";
import { payslipsApi } from "./payslips.api";
import { PayslipsTable } from "./PayslipsTable";
import type { Payslip, PayslipFilters as PayslipFilterValues } from "./payslips.types";

export const PayslipsPage = () => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const filters = useMemo<PayslipFilterValues>(() => ({
    payroll_run_id: searchParams.get("payroll_run_id") || undefined,
    payroll_month: searchParams.get("payroll_month") || undefined,
    employee_id: searchParams.get("employee_id") || undefined,
    outlet_id: searchParams.get("outlet_id") || undefined,
    status: searchParams.get("status") || undefined,
    page: searchParamNumber(searchParams, "page", 1),
    page_size: searchParamNumber(searchParams, "page_size", 25),
  }), [searchParams]);
  const updateFilters = (next: Partial<PayslipFilterValues>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => value === undefined || value === "" ? params.delete(key) : params.set(key, String(value)));
    if (!("page" in next)) params.set("page", "1");
    setSearchParams(params);
  };
  const listQuery = useQuery({ queryKey: ["payslips", filters], queryFn: () => payslipsApi.list(filters) });
  const generateMutation = useMutation({
    mutationFn: payslipsApi.generateBatch,
    onSuccess: async (response) => {
      setSuccessMessage(`Payslips generated successfully. Created ${response.data.created ?? 0}, skipped ${response.data.skipped_existing ?? 0}.`);
      setGenerateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["payslips"] });
    },
  });
  const downloadMutation = useMutation({
    mutationFn: (id: string) => payslipsApi.downloadPlaceholder(id),
    onSuccess: () => setSuccessMessage("Payslip PDF generation is not available yet."),
  });
  const error = listQuery.error ?? generateMutation.error ?? downloadMutation.error;
  const canDownloadPayslip = auth.isSuperAdmin || auth.hasPermission("payslips.download");
  return (
    <div>
      <PageHeader title="Payslips" description="Generate and view payslip metadata. PDF downloads are represented by a safe placeholder." actions={auth.hasPermission("payslips.generate") ? <Button onClick={() => setGenerateOpen(true)}><FileText className="h-4 w-4" />Generate batch</Button> : null} />
      <div className="space-y-4 p-4 md:p-6">
        {successMessage ? <InlineAlert title={successMessage} variant="success" /> : null}
        {error ? <InlineAlert title={friendlyHrmError(error, "Payslip action could not be completed.", "payroll")} variant="error" /> : null}
        <PayslipFilters filters={filters} onChange={updateFilters} onClear={() => setSearchParams(new URLSearchParams({ page: "1", page_size: String(filters.page_size) }))} />
        <PayslipsTable rows={listQuery.data?.data ?? []} loading={listQuery.isLoading} pagination={listQuery.data?.pagination} canDownload={canDownloadPayslip} onView={(row) => { setSelected(row); setDrawerOpen(true); }} onDownload={(row) => downloadMutation.mutate(row.id)} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(page_size) => updateFilters({ page: 1, page_size })} />
      </div>
      <PayslipDetailDrawer payslip={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <GeneratePayslipsDialog open={generateOpen} loading={generateMutation.isPending} error={generateMutation.error ? friendlyHrmError(generateMutation.error, "Payslips could not be generated.", "payroll") : null} onOpenChange={setGenerateOpen} onSubmit={(payload) => generateMutation.mutate(payload)} />
    </div>
  );
};
