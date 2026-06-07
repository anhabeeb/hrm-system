import { useEffect, useState } from "react";

import { FormError } from "@/components/feedback/FormError";
import { LoadingButton } from "@/components/forms/LoadingButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { friendlyHrmError } from "@/lib/hrm-errors";
import { label } from "./contract-format";
import { EmployeeDocumentCombobox } from "./EmployeeDocumentCombobox";
import type { ContractPayload, ContractRenewPayload, ContractType, EmployeeContract } from "./contracts.types";

const contractTypes: ContractType[] = ["permanent", "fixed_term", "probation", "temporary", "part_time", "casual", "foreign_worker_contract", "other"];

const blankPayload = (): ContractPayload => ({
  contract_number: "",
  contract_type: "fixed_term",
  start_date: "",
  end_date: "",
  signed_date: "",
  probation_end_date: "",
  document_id: "",
  currency: "MVR",
  notes: "",
  reason: "",
});

export const ContractFormDialog = ({
  open,
  mode,
  contract,
  loading,
  error,
  employeeId,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit" | "renew";
  contract?: EmployeeContract | null;
  employeeId: string;
  loading?: boolean;
  error?: unknown;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ContractPayload | ContractRenewPayload) => void;
}) => {
  const [payload, setPayload] = useState<ContractPayload>(blankPayload);

  useEffect(() => {
    if (!open) return;
    if (mode === "create" || !contract) {
      setPayload(blankPayload());
      return;
    }
    setPayload({
      contract_number: mode === "renew" ? "" : contract.contract_number ?? "",
      contract_type: contract.contract_type,
      start_date: mode === "renew" ? "" : contract.start_date,
      end_date: mode === "renew" ? "" : contract.end_date ?? "",
      signed_date: mode === "renew" ? "" : contract.signed_date ?? "",
      probation_end_date: mode === "renew" ? "" : contract.probation_end_date ?? "",
      document_id: mode === "renew" ? "" : contract.document_id ?? "",
      salary_snapshot_amount: contract.salary_snapshot_amount ?? undefined,
      currency: contract.currency ?? "MVR",
      notes: mode === "renew" ? "" : contract.notes ?? "",
      reason: "",
    });
  }, [contract, mode, open]);

  const submit = () => {
    if (mode === "renew") {
      onSubmit({
        new_contract_number: payload.contract_number,
        start_date: payload.start_date,
        end_date: payload.end_date,
        signed_date: payload.signed_date,
        probation_end_date: payload.probation_end_date,
        document_id: payload.document_id,
        notes: payload.notes,
        reason: payload.reason,
      });
      return;
    }
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "renew" ? "Renew contract" : mode === "edit" ? "Edit contract" : "Add contract"}</DialogTitle>
          <DialogDescription>Contract history is preserved. Renewals create a new version instead of overwriting the old contract.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Label className="grid gap-1 text-sm">
            {mode === "renew" ? "New contract number" : "Contract number"}
            <Input value={payload.contract_number ?? ""} onChange={(event) => setPayload((current) => ({ ...current, contract_number: event.target.value }))} />
          </Label>
          {mode === "renew" ? null : (
            <Label className="grid gap-1 text-sm">
              Contract type
              <Select value={payload.contract_type} onValueChange={(value) => setPayload((current) => ({ ...current, contract_type: value as ContractType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{contractTypes.map((type) => <SelectItem key={type} value={type}>{label(type)}</SelectItem>)}</SelectContent>
              </Select>
            </Label>
          )}
          <Label className="grid gap-1 text-sm">
            Start date
            <Input type="date" value={payload.start_date} onChange={(event) => setPayload((current) => ({ ...current, start_date: event.target.value }))} />
          </Label>
          <Label className="grid gap-1 text-sm">
            End date
            <Input type="date" value={payload.end_date ?? ""} onChange={(event) => setPayload((current) => ({ ...current, end_date: event.target.value }))} />
          </Label>
          <Label className="grid gap-1 text-sm">
            Signed date
            <Input type="date" value={payload.signed_date ?? ""} onChange={(event) => setPayload((current) => ({ ...current, signed_date: event.target.value }))} />
          </Label>
          <Label className="grid gap-1 text-sm">
            Probation end date
            <Input type="date" value={payload.probation_end_date ?? ""} onChange={(event) => setPayload((current) => ({ ...current, probation_end_date: event.target.value }))} />
          </Label>
          <Label className="grid gap-1 text-sm md:col-span-2">
            Contract document
            <EmployeeDocumentCombobox
              employeeId={employeeId}
              value={payload.document_id}
              onChange={(value) => setPayload((current) => ({ ...current, document_id: value }))}
            />
            <span className="text-xs font-normal text-muted-foreground">Upload the contract document in Employee Documents first, then select it here.</span>
          </Label>
          <Label className="grid gap-1 text-sm md:col-span-2">
            Notes
            <Textarea value={payload.notes ?? ""} onChange={(event) => setPayload((current) => ({ ...current, notes: event.target.value }))} />
          </Label>
          <Label className="grid gap-1 text-sm md:col-span-2">
            Reason
            <Textarea value={payload.reason} onChange={(event) => setPayload((current) => ({ ...current, reason: event.target.value }))} />
          </Label>
          {error ? <div className="md:col-span-2"><FormError message={friendlyHrmError(error, "Contract could not be saved.")} /></div> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={loading} onClick={submit}>{mode === "renew" ? "Renew contract" : "Save contract"}</LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
