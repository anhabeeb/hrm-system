import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, FileText, Plus, RefreshCw } from "lucide-react";

import { DataTable } from "@/components/data/DataTable";
import { InlineAlert } from "@/components/feedback/InlineAlert";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { displayDate, displayMoney } from "@/features/employees/employee-format";
import type { Employee } from "@/features/employees/employees.types";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { ContractFormDialog } from "./ContractFormDialog";
import { ContractDocumentAction } from "./ContractDocumentAction";
import { contractStatusBadge, expiryText, label } from "./contract-format";
import { contractsApi } from "./contracts.api";
import type { ContractPayload, ContractRenewPayload, EmployeeContract } from "./contracts.types";

export const EmployeeContractsPanel = ({ employee, canManage }: { employee: Employee; canManage: boolean }) => {
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "renew" | null>(null);
  const [selected, setSelected] = useState<EmployeeContract | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EmployeeContract | null>(null);
  const [archiveReason, setArchiveReason] = useState("");

  const query = useQuery({
    queryKey: ["employee-contracts", employee.id],
    queryFn: () => contractsApi.employee(employee.id),
    enabled: Boolean(employee.id),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["employee-contracts", employee.id] }),
      queryClient.invalidateQueries({ queryKey: ["contracts"] }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: (payload: ContractPayload | ContractRenewPayload) => {
      if (dialogMode === "renew" && selected) return contractsApi.renew(employee.id, selected.id, payload as ContractRenewPayload);
      if (dialogMode === "edit" && selected) return contractsApi.update(employee.id, selected.id, payload as ContractPayload);
      return contractsApi.create(employee.id, payload as ContractPayload);
    },
    onSuccess: async () => { setDialogMode(null); setSelected(null); await refresh(); },
  });
  const archiveMutation = useMutation({
    mutationFn: () => {
      if (!archiveTarget) throw new Error("Contract is required.");
      return contractsApi.archive(employee.id, archiveTarget.id, { reason: archiveReason });
    },
    onSuccess: async () => { setArchiveTarget(null); setArchiveReason(""); await refresh(); },
  });

  const data = query.data?.data;
  const current = data?.current_contract;
  const warnings = data?.warnings ?? [];
  const contracts = data?.contracts ?? [];
  const error = query.error ?? saveMutation.error ?? archiveMutation.error;

  return (
    <div className="space-y-4">
      {error ? <InlineAlert variant="error" title={friendlyHrmError(error, "Contracts could not be loaded.")} /> : null}
      {warnings.length > 0 ? <InlineAlert variant="warning" title={warnings[0]}>{warnings.slice(1).join(" ")}</InlineAlert> : null}
      <div className="rounded-lg border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h4 className="font-semibold">Current Contract Summary</h4>
            {current ? (
              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                <span>Number: {current.contract_number ?? "Not recorded"}</span>
                <span>Type: {label(current.contract_type)}</span>
                <span>Status: {contractStatusBadge(current.contract_status)}</span>
                <span>Expiry: {expiryText(current.end_date, current.days_until_expiry)}</span>
                <span>Start: {displayDate(current.start_date)}</span>
                <span className="flex items-center gap-2">Document: {current.document?.file_name ?? "Missing contract document"}{current.document ? <ContractDocumentAction contract={current} compact /> : null}</span>
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">No active contract is recorded for this employee.</p>}
          </div>
          {canManage ? <Button onClick={() => { setSelected(null); setDialogMode("create"); }}><Plus className="h-4 w-4" />Add Contract</Button> : null}
        </div>
      </div>
      <DataTable<EmployeeContract>
        rows={contracts}
        loading={query.isLoading}
        getRowId={(row) => row.id}
        compact
        emptyTitle="No contracts"
        emptyDescription="Add the first employment contract to start tracking expiry and renewals."
        columns={[
          { key: "contract_number", header: "Contract", cell: (row) => <div><p className="font-medium">{row.contract_number ?? row.id}</p><p className="text-xs text-muted-foreground">Version {row.version_number}</p></div> },
          { key: "contract_type", header: "Type", cell: (row) => label(row.contract_type) },
          { key: "start_date", header: "Start", cell: (row) => displayDate(row.start_date) },
          { key: "end_date", header: "End / expiry", cell: (row) => expiryText(row.end_date, row.days_until_expiry) },
          { key: "contract_status", header: "Status", cell: (row) => contractStatusBadge(row.contract_status) },
          { key: "salary_snapshot_amount", header: "Salary snapshot", cell: (row) => displayMoney(row.salary_snapshot_amount, row.currency ?? "MVR") },
          { key: "document_id", header: "Document", cell: (row) => <div className="space-y-1"><p>{row.document?.file_name ?? "Missing"}</p><ContractDocumentAction contract={row} compact /></div> },
        ]}
        rowActions={canManage ? (row) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => { setSelected(row); setDialogMode("edit"); }}><FileText className="h-4 w-4" />Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelected(row); setDialogMode("renew"); }}><RefreshCw className="h-4 w-4" />Renew</Button>
            <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(row)}><Archive className="h-4 w-4" />Archive</Button>
          </div>
        ) : undefined}
      />
      <ContractFormDialog
        open={dialogMode !== null}
        mode={dialogMode ?? "create"}
        contract={selected}
        employeeId={employee.id}
        loading={saveMutation.isPending}
        error={saveMutation.error}
        onOpenChange={(open) => { if (!open) { setDialogMode(null); setSelected(null); } }}
        onSubmit={(payload) => saveMutation.mutate(payload)}
      />
      <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive contract</DialogTitle>
            <DialogDescription>Archiving preserves contract history and removes it from active contract warnings.</DialogDescription>
          </DialogHeader>
          <Label className="grid gap-2 text-sm">
            Reason
            <Textarea value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} />
          </Label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>Cancel</Button>
            <LoadingButton loading={archiveMutation.isPending} onClick={() => archiveMutation.mutate()} disabled={archiveReason.trim().length < 3}>Archive contract</LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
